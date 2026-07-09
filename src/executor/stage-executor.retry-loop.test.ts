import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: () => ({ budgets: undefined }) }))
}));

import { getLogger } from 'output/logger';
import type { PipelineStage } from 'types/command.types';
import type { EscalationResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionResult } from 'types/llm.types';

import { StageExecutor } from './stage-executor';

/**
 * Exercises the retry loop in `performStageExecution`: on an escalation "modify"
 * decision, the stage should be re-run once with the human's guidance appended to
 * the user message, and the loop must not attempt a third LLM call regardless of
 * what the second attempt produces (MAX_ATTEMPTS = 2).
 */

interface ExecutionSummaryStub {
	fatalFailureCount: number;
	recoverableFailureCount: number;
	toolFailureCount: number;
	totalToolIterations: number;
	verifiedModifiedFiles: string[];
	wasLoopExhausted: boolean;
}

interface ExecutorInternals {
	callLLMWithToolLoop: ReturnType<typeof vi.fn>;
	escalationDetectionService: {
		getConfig: ReturnType<typeof vi.fn>;
		getMissingSignalEscalation: ReturnType<typeof vi.fn>;
		parseResponse: ReturnType<typeof vi.fn>;
		shouldTriggerEscalation: ReturnType<typeof vi.fn>;
	};
	escalationHandlerService: {
		displayEscalationSummary: ReturnType<typeof vi.fn>;
		handleEscalation: ReturnType<typeof vi.fn>;
	};
	performStageExecution(
		stage: PipelineStage,
		executionContext: Record<string, unknown>,
		startTime: number
	): Promise<{ success: boolean }>;
}

const emptySummary: ExecutionSummaryStub = {
	fatalFailureCount: 0,
	recoverableFailureCount: 0,
	toolFailureCount: 0,
	totalToolIterations: 1,
	verifiedModifiedFiles: [],
	wasLoopExhausted: false
};

const makeCompletion = (content: string): LLMCompletionResult => ({ content, model: 'test-model', role: 'assistant' });

const makeStage = (): PipelineStage => ({ prompt: 'assess-risks', required: true, stage: 'plan' });

const makeSignal = (overrides: Partial<EscalationSignal> = {}): EscalationSignal => ({
	confidence: 40,
	confidenceSource: 'reported',
	proposed_action: 'Proceed with caution',
	reasoning: 'Some uncertainty remains',
	requires_escalation: false,
	risk_level: 'medium',
	triggered_criteria: [],
	...overrides
});

const makeEscalationResult = (overrides: Partial<EscalationResult> = {}): EscalationResult => ({
	decision: { decision: 'proceed', timestamp: 0 },
	handled: true,
	shouldAbort: false,
	shouldProceed: true,
	...overrides
});

function makeExecutor(): ExecutorInternals {
	const executor = new StageExecutor({} as never, {} as never) as unknown as ExecutorInternals;

	executor.escalationDetectionService = {
		getConfig: vi.fn().mockReturnValue({
			confidenceThreshold: 70,
			// Self-consistency sampling is out of scope for these tests — covered separately.
			selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 }
		}),
		getMissingSignalEscalation: vi.fn(),
		parseResponse: vi.fn(),
		shouldTriggerEscalation: vi.fn()
	};
	executor.escalationHandlerService = {
		displayEscalationSummary: vi.fn(),
		handleEscalation: vi.fn()
	};

	const internals = executor as unknown as Record<string, unknown>;
	internals['loadStageResources'] = vi.fn().mockResolvedValue({ escalationCriteria: ['Confidence < 70%'] });
	internals['resolveStageInputs'] = vi.fn().mockResolvedValue({});
	internals['buildStageMessages'] = vi
		.fn()
		.mockReturnValue({ systemMessage: 'system prompt', userMessage: 'original user message' });
	internals['getExecutionConfig'] = vi
		.fn()
		.mockReturnValue({ isDryRun: false, modelOverride: undefined, tools: undefined });
	internals['logToolConfiguration'] = vi.fn();
	internals['recordStageComplete'] = vi.fn();
	internals['emitLLMResponseEvent'] = vi.fn();
	internals['callLLMWithToolLoop'] = vi.fn();

	return executor;
}

const makeExecutionContext = (): Record<string, unknown> => ({
	agentRole: 'lead',
	effectiveConstraints: undefined,
	flags: {},
	mode: undefined,
	model: 'test-model',
	provider: { complete: vi.fn() }
	// sessionInfo intentionally omitted — no sessionId means the budget circuit-breaker is skipped
});

describe('StageExecutor retry loop (performStageExecution)', () => {
	let logger: ReturnType<typeof getLogger>;

	beforeEach(() => {
		logger = getLogger();
		void logger;
	});

	it('re-invokes the LLM once with the guidance appended after a "modify" decision, then does not retry again', async () => {
		const executor = makeExecutor();

		executor.callLLMWithToolLoop
			.mockResolvedValueOnce({ completion: makeCompletion('first response'), summary: emptySummary })
			.mockResolvedValueOnce({
				completion: makeCompletion('second response, addresses guidance'),
				summary: emptySummary
			});

		const firstSignal = makeSignal();
		const secondSignal = makeSignal({ confidence: 85 });

		executor.escalationDetectionService.parseResponse
			.mockReturnValueOnce({ cleanedContent: 'first response', signal: firstSignal })
			.mockReturnValueOnce({ cleanedContent: 'second response, addresses guidance', signal: secondSignal });

		executor.escalationDetectionService.shouldTriggerEscalation
			.mockReturnValueOnce(true) // first attempt escalates
			.mockReturnValueOnce(false); // retried attempt does not — no third call needed

		executor.escalationHandlerService.handleEscalation.mockResolvedValueOnce(
			makeEscalationResult({
				decision: { decision: 'modify', timestamp: 0 },
				modifiedGuidance: 'Re-check the auth edge cases',
				shouldProceed: false
			})
		);

		const stage = makeStage();
		const result = await executor.performStageExecution(stage, makeExecutionContext(), Date.now());

		expect(executor.callLLMWithToolLoop).toHaveBeenCalledTimes(2);

		const secondCallArgs = executor.callLLMWithToolLoop.mock.calls[1] as unknown[];
		const secondCallUserMessage = secondCallArgs[2] as string;
		expect(secondCallUserMessage).toContain('original user message');
		expect(secondCallUserMessage).toContain('Re-check the auth edge cases');

		expect(result.success).not.toBe(false);
	});

	it('does not attempt a third LLM call even if the retried response also triggers escalation', async () => {
		const executor = makeExecutor();

		executor.callLLMWithToolLoop
			.mockResolvedValueOnce({ completion: makeCompletion('first response'), summary: emptySummary })
			.mockResolvedValueOnce({ completion: makeCompletion('second response, still shaky'), summary: emptySummary });

		const signal = makeSignal();

		executor.escalationDetectionService.parseResponse
			.mockReturnValueOnce({ cleanedContent: 'first response', signal })
			.mockReturnValueOnce({ cleanedContent: 'second response, still shaky', signal });

		// Both attempts trigger escalation review.
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);

		executor.escalationHandlerService.handleEscalation
			.mockResolvedValueOnce(
				makeEscalationResult({
					decision: { decision: 'modify', timestamp: 0 },
					modifiedGuidance: 'Re-check the auth edge cases',
					shouldProceed: false
				})
			)
			// On the final attempt the human is no longer offered "Modify" (allowModify=false),
			// so the only realistic outcomes are abort or proceed — simulate "proceed".
			.mockResolvedValueOnce(makeEscalationResult());

		const result = await executor.performStageExecution(makeStage(), makeExecutionContext(), Date.now());

		expect(executor.callLLMWithToolLoop).toHaveBeenCalledTimes(2);
		expect(executor.escalationHandlerService.handleEscalation).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ allowModify: false })
		);
		expect(result.success).not.toBe(false);
	});
});
