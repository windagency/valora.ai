import { describe, expect, it, vi } from 'vitest';

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: () => ({ budgets: undefined }), getRaw: () => ({}) }))
}));

vi.mock('executor/project-guidance-loader', () => ({
	loadAvailableAgents: vi.fn(async () => null),
	loadProjectGuidance: vi.fn(async () => null),
	loadProjectKnowledge: vi.fn(async () => null)
}));

vi.mock('ast/ast-index.service', () => ({
	getASTIndexService: vi.fn(() => ({
		buildIndex: vi.fn(async () => ({})),
		isBuilding: () => false,
		isBuilt: () => false,
		loadIndex: () => false
	}))
}));

const mockEscalationDetectionService = {
	getConfig: vi.fn().mockReturnValue({
		confidenceThreshold: 70,
		requireExplicitBlock: true,
		selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 }
	}),
	getMissingSignalEscalation: vi.fn(),
	parseResponse: vi.fn(),
	shouldTriggerEscalation: vi.fn()
};
vi.mock('executor/escalation-detection.service', () => ({
	getEscalationDetectionService: vi.fn(() => mockEscalationDetectionService)
}));

const mockEscalationHandlerService = {
	displayEscalationSummary: vi.fn(),
	handleEscalation: vi.fn()
};
vi.mock('executor/escalation-handler.service', () => ({
	getEscalationHandlerService: vi.fn(() => mockEscalationHandlerService)
}));

vi.mock('executor/self-consistency-sampler.service', () => ({
	getSelfConsistencySamplerService: vi.fn(() => ({ checkAgreement: vi.fn() }))
}));

vi.mock('executor/session-budget.service', () => ({
	getSessionBudgetService: vi.fn(() => ({
		getSessionTotal: vi.fn().mockReturnValue({ totalCostUsd: 0 }),
		wouldExceed: vi.fn().mockReturnValue(false)
	}))
}));

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage } from 'types/command.types';
import type { EscalationResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionResult, LLMProvider } from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { ExecutionContext } from './execution-context';
import { PipelineExecutionContext, StageExecutor } from './stage-executor';

/**
 * Exercises the retry loop bound in `performStageExecution` end-to-end through
 * `executeStage()`: on an escalation "modify" decision, the stage is re-run once with the
 * human's guidance appended to the user message, and the loop must not attempt a third LLM
 * call regardless of what the second attempt produces (MAX_ATTEMPTS = 2). See
 * stage-executor.escalation.test.ts for the rest of the escalation decision logic.
 */

const makeStage = (): PipelineStage => ({ prompt: 'assess-risks', required: true, stage: 'plan' });

const makePrompt = (): PromptDefinition => ({
	agents: [],
	category: 'plan',
	content: 'Assess risks for this change.',
	description: 'Assess risks',
	id: 'plan.assess-risks',
	name: 'assess-risks',
	version: '1.0.0'
});

const makeAgent = (escalationCriteria: string[]): AgentDefinition => ({
	capabilities: { can_review_code: true, can_run_tests: false, can_write_code: false, can_write_knowledge: false },
	content: 'You are a technical lead.',
	decision_making: { escalation_criteria: escalationCriteria },
	description: 'Technical lead',
	role: 'lead',
	specialization: 'leadership',
	tone: 'concise-technical',
	version: '1.0.0'
});

function makePromptLoader(): { loadPrompt: ReturnType<typeof vi.fn> } {
	return { loadPrompt: vi.fn().mockResolvedValue(makePrompt()) };
}

function makeAgentLoader(escalationCriteria: string[] = ['Confidence < 70%']): { loadAgent: ReturnType<typeof vi.fn> } {
	return { loadAgent: vi.fn().mockResolvedValue(makeAgent(escalationCriteria)) };
}

function makeCompletion(content: string): LLMCompletionResult {
	return { content, model: 'test-model', role: 'assistant' };
}

function makeExecutionContext(providerComplete: ReturnType<typeof vi.fn>): ExecutionContext {
	return new ExecutionContext({
		agentRole: 'lead',
		args: [],
		commandName: 'test-command',
		flags: {},
		// sessionInfo intentionally omitted — no sessionId means the budget circuit-breaker is skipped.
		provider: { complete: providerComplete } as unknown as LLMProvider
	});
}

function makeExecutor(): StageExecutor {
	return new StageExecutor(makePromptLoader() as never, makeAgentLoader() as never);
}

async function runStage(
	executor: StageExecutor,
	providerComplete: ReturnType<typeof vi.fn>
): Promise<Awaited<ReturnType<StageExecutor['executeStage']>>> {
	const context: PipelineExecutionContext = { executionContext: makeExecutionContext(providerComplete) };
	return executor.executeStage(makeStage(), context, 0);
}

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

describe('StageExecutor retry loop (performStageExecution)', () => {
	it('re-invokes the LLM once with the guidance appended after a "modify" decision, then does not retry again', async () => {
		mockEscalationDetectionService.parseResponse
			.mockReturnValueOnce({ cleanedContent: 'first response', signal: makeSignal() })
			.mockReturnValueOnce({
				cleanedContent: 'second response, addresses guidance',
				signal: makeSignal({ confidence: 85 })
			});
		mockEscalationDetectionService.shouldTriggerEscalation
			.mockReturnValueOnce(true) // first attempt escalates
			.mockReturnValueOnce(false); // retried attempt does not — no third call needed
		mockEscalationHandlerService.handleEscalation.mockResolvedValueOnce(
			makeEscalationResult({
				decision: { decision: 'modify', timestamp: 0 },
				modifiedGuidance: 'Re-check the auth edge cases',
				shouldProceed: false
			})
		);
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(makeCompletion('first response'))
			.mockResolvedValueOnce(makeCompletion('second response, addresses guidance'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(providerComplete).toHaveBeenCalledTimes(2);
		const secondCallOptions = providerComplete.mock.calls[1]?.[0] as { messages: Array<{ content: string }> };
		const secondUserMessage = secondCallOptions.messages[secondCallOptions.messages.length - 1]?.content ?? '';
		expect(secondUserMessage).toContain('Re-check the auth edge cases');
		expect(output.success).not.toBe(false);
	});

	it('does not attempt a third LLM call even if the retried response also triggers escalation', async () => {
		const signal = makeSignal();
		mockEscalationDetectionService.parseResponse
			.mockReturnValueOnce({ cleanedContent: 'first response', signal })
			.mockReturnValueOnce({ cleanedContent: 'second response, still shaky', signal });
		// Both attempts trigger escalation review.
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
		mockEscalationHandlerService.handleEscalation
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
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(makeCompletion('first response'))
			.mockResolvedValueOnce(makeCompletion('second response, still shaky'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(providerComplete).toHaveBeenCalledTimes(2);
		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ allowModify: false })
		);
		expect(output.success).not.toBe(false);
	});
});
