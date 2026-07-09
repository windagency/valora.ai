import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: () => ({ budgets: undefined }) }))
}));

import { getLogger } from 'output/logger';
import type { PipelineStage } from 'types/command.types';
import type { EscalationResult, EscalationSignal } from 'types/escalation.types';

import { StageExecutor } from './stage-executor';

/**
 * Exercises the escalation decision-making that lives on StageExecutor's private
 * methods (`processEscalation`, `handleEscalationResultActions`). These are private
 * because StageExecutor pulls most of its collaborators from module-level singletons
 * rather than constructor injection (see `getEscalationDetectionService`/
 * `getEscalationHandlerService` calls in the constructor); overriding those two fields
 * post-construction is the least invasive way to drive this decision logic under test
 * without instantiating the rest of the pipeline (LLM provider, tool execution, MCP, ...).
 */

interface ExecutorInternals {
	escalationDetectionService: {
		getMissingSignalEscalation: ReturnType<typeof vi.fn>;
		parseResponse: ReturnType<typeof vi.fn>;
		shouldTriggerEscalation: ReturnType<typeof vi.fn>;
	};
	escalationHandlerService: {
		displayEscalationSummary: ReturnType<typeof vi.fn>;
		handleEscalation: ReturnType<typeof vi.fn>;
	};
	processEscalation(
		responseContent: string,
		stage: PipelineStage,
		agentRole: string,
		escalationCriteria: string[],
		duration: number,
		resolvedInputs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>,
		allowRetry: boolean
	): Promise<{ guidance?: string; kind: string; output?: unknown }>;
}

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
		getMissingSignalEscalation: vi.fn(),
		parseResponse: vi.fn(),
		shouldTriggerEscalation: vi.fn()
	};
	executor.escalationHandlerService = {
		displayEscalationSummary: vi.fn(),
		handleEscalation: vi.fn()
	};
	return executor;
}

describe('StageExecutor escalation handling', () => {
	let logger: ReturnType<typeof getLogger>;

	beforeEach(() => {
		logger = getLogger();
	});

	describe('fail-closed on a missing/unparseable escalation block', () => {
		it('continues normally when no signal is found and the detection service allows it (requireExplicitBlock disabled)', async () => {
			const executor = makeExecutor();
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal: null });
			executor.escalationDetectionService.getMissingSignalEscalation.mockReturnValue(null);

			const outcome = await executor.processEscalation(
				'no block here',
				makeStage(),
				'lead',
				['Confidence < 70%'],
				100,
				{},
				logger,
				true
			);

			expect(outcome.kind).toBe('continue');
			expect(executor.escalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		});

		it('forces an escalation review when no signal is found and requireExplicitBlock is enabled', async () => {
			const executor = makeExecutor();
			const forcedSignal = makeSignal({
				confidenceSource: 'defaulted',
				requires_escalation: true,
				risk_level: 'high',
				triggered_criteria: ['missing_escalation_block']
			});
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal: null });
			executor.escalationDetectionService.getMissingSignalEscalation.mockReturnValue(forcedSignal);
			executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

			const outcome = await executor.processEscalation(
				'no block here',
				makeStage(),
				'lead',
				['Confidence < 70%'],
				100,
				{},
				logger,
				true
			);

			expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
				expect.objectContaining({ signal: forcedSignal })
			);
			expect(outcome.kind).toBe('continue');
		});
	});

	describe('retry-on-modify', () => {
		it('returns a retry outcome with the guidance when the human requests modification and a retry is allowed', async () => {
			const executor = makeExecutor();
			const signal = makeSignal();
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
			executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			executor.escalationHandlerService.handleEscalation.mockResolvedValue(
				makeEscalationResult({
					decision: { decision: 'modify', timestamp: 0 },
					modifiedGuidance: 'Re-check the auth edge cases',
					shouldProceed: false
				})
			);

			const outcome = await executor.processEscalation(
				'...',
				makeStage(),
				'lead',
				['Confidence < 70%'],
				100,
				{},
				logger,
				true
			);

			expect(outcome).toEqual({ guidance: 'Re-check the auth edge cases', kind: 'retry' });
		});

		it('marks the escalation context as not allowing modification once the retry budget is exhausted', async () => {
			// The handler only offers "Modify" in its prompt when context.allowModify is true, so on the
			// final attempt (allowRetry=false) the human can no longer be offered a choice that does nothing.
			const executor = makeExecutor();
			const signal = makeSignal();
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
			executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

			await executor.processEscalation('...', makeStage(), 'lead', ['Confidence < 70%'], 100, {}, logger, false);

			expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
				expect.objectContaining({ allowModify: false })
			);
		});

		it('marks the escalation context as allowing modification when a retry is still available', async () => {
			const executor = makeExecutor();
			const signal = makeSignal();
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
			executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

			await executor.processEscalation('...', makeStage(), 'lead', ['Confidence < 70%'], 100, {}, logger, true);

			expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
				expect.objectContaining({ allowModify: true })
			);
		});

		it('returns a terminal stage output when the human aborts, regardless of retry budget', async () => {
			const executor = makeExecutor();
			const signal = makeSignal();
			executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
			executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			executor.escalationHandlerService.handleEscalation.mockResolvedValue(
				makeEscalationResult({
					decision: { decision: 'abort', timestamp: 0 },
					shouldAbort: true,
					shouldProceed: false
				})
			);

			const outcome = await executor.processEscalation(
				'...',
				makeStage(),
				'lead',
				['Confidence < 70%'],
				100,
				{},
				logger,
				true
			);

			expect(outcome.kind).toBe('output');
			expect((outcome.output as { success: boolean }).success).toBe(false);
		});
	});
});
