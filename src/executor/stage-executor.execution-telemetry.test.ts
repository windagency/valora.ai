import { describe, expect, it, vi } from 'vitest';

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: () => ({ budgets: undefined }) }))
}));

import { getLogger } from 'output/logger';
import type { PipelineStage } from 'types/command.types';
import type { EscalationConfig, EscalationResult, EscalationSignal } from 'types/escalation.types';

import { StageExecutor } from './stage-executor';

/**
 * Exercises the execution-telemetry cross-check reached via `processEscalation`: when the
 * model reports "no escalation needed" but the stage's own tool-loop telemetry shows it
 * actually struggled (exhausted its iteration budget, or a mutating tool call failed), that
 * is independently-verified evidence the pipeline already computes but previously never
 * compared against the confidence claim. Unlike self-consistency sampling, this check is
 * free (no extra LLM calls) and applies to every escalation-gated stage, not just a
 * borderline confidence band.
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
	processEscalation(
		responseContent: string,
		stage: PipelineStage,
		agentRole: string,
		escalationCriteria: string[],
		duration: number,
		resolvedInputs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>,
		allowRetry: boolean,
		selfConsistencyContext: {
			completionOptions: { messages: unknown[] };
			model: string;
			originalUsage: undefined;
			provider: { complete: ReturnType<typeof vi.fn> };
			sessionId: string | undefined;
		},
		executionSummary: ExecutionSummaryStub | undefined
	): Promise<{ guidance?: string; kind: string; output?: unknown }>;
	selfConsistencySamplerService: { checkAgreement: ReturnType<typeof vi.fn> };
	sessionBudgetService: { wouldExceed: ReturnType<typeof vi.fn> };
}

const makeStage = (): PipelineStage => ({ prompt: 'assess-risks', required: true, stage: 'plan' });

const makeSignal = (overrides: Partial<EscalationSignal> = {}): EscalationSignal => ({
	confidence: 95,
	confidenceSource: 'reported',
	proposed_action: 'Proceed',
	reasoning: 'Looks fine, thoroughly checked.',
	requires_escalation: false,
	risk_level: 'low',
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

const cleanSummary: ExecutionSummaryStub = {
	fatalFailureCount: 0,
	recoverableFailureCount: 0,
	toolFailureCount: 0,
	totalToolIterations: 1,
	verifiedModifiedFiles: [],
	wasLoopExhausted: false
};

const DEFAULT_CONFIG: EscalationConfig = {
	confidenceThreshold: 70,
	requireExplicitBlock: true,
	// Confidence is 95 in these tests — outside the self-consistency borderline band — so
	// self-consistency sampling is disabled here to isolate the telemetry check under test.
	selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 }
};

function makeExecutor(): ExecutorInternals {
	const executor = new StageExecutor({} as never, {} as never) as unknown as ExecutorInternals;

	executor.escalationDetectionService = {
		getConfig: vi.fn().mockReturnValue(DEFAULT_CONFIG),
		getMissingSignalEscalation: vi.fn(),
		parseResponse: vi.fn(),
		shouldTriggerEscalation: vi.fn()
	};
	executor.escalationHandlerService = {
		displayEscalationSummary: vi.fn(),
		handleEscalation: vi.fn()
	};
	executor.selfConsistencySamplerService = { checkAgreement: vi.fn() };
	executor.sessionBudgetService = { wouldExceed: vi.fn().mockReturnValue(false) };

	return executor;
}

const makeReplay = () => ({
	completionOptions: { messages: [] },
	model: 'test-model',
	originalUsage: undefined,
	provider: { complete: vi.fn() },
	sessionId: undefined
});

describe('StageExecutor execution-telemetry mismatch check', () => {
	const logger = getLogger();

	it('forces escalation when the tool loop was exhausted despite a confident "no escalation needed" report', async () => {
		const executor = makeExecutor();
		const signal = makeSignal();
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

		const outcome = await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay(),
			{ ...cleanSummary, wasLoopExhausted: true }
		);

		expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({
					requires_escalation: true,
					triggered_criteria: ['execution_telemetry_mismatch']
				})
			})
		);
		expect(outcome.kind).toBe('continue');
	});

	it('forces escalation when a mutating tool call actually failed despite the report', async () => {
		const executor = makeExecutor();
		const signal = makeSignal();
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

		await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay(),
			{ ...cleanSummary, fatalFailureCount: 2 }
		);

		expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({ triggered_criteria: ['execution_telemetry_mismatch'] })
			})
		);
	});

	it('does not escalate when telemetry is clean', async () => {
		const executor = makeExecutor();
		const signal = makeSignal();
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);

		const outcome = await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay(),
			cleanSummary
		);

		expect(executor.escalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		expect(outcome.kind).toBe('continue');
	});

	it('does not throw when executionSummary is undefined (e.g. a guided-completion path that never ran a tool loop)', async () => {
		const executor = makeExecutor();
		const signal = makeSignal();
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);

		const outcome = await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay(),
			undefined
		);

		expect(outcome.kind).toBe('continue');
	});

	it('still escalates on a telemetry mismatch even when confidence is well outside the self-consistency band', async () => {
		// Confidence 95 is far outside the default [70, 80) borderline band — self-consistency
		// would never fire here, but the telemetry check is unconditional.
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 95 });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		executor.escalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());

		await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay(),
			{ ...cleanSummary, wasLoopExhausted: true }
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({ triggered_criteria: ['execution_telemetry_mismatch'] })
			})
		);
	});
});
