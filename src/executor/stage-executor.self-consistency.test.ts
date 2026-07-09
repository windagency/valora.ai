import { describe, expect, it, vi } from 'vitest';

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: () => ({ budgets: undefined }) }))
}));

import { getLogger } from 'output/logger';
import type { PipelineStage } from 'types/command.types';
import type { EscalationConfig, EscalationResult, EscalationSignal } from 'types/escalation.types';

import { StageExecutor } from './stage-executor';

/**
 * Exercises `maybeApplySelfConsistencyCheck`, reached via `processEscalation` whenever the
 * model reports "no escalation needed" with confidence just above the threshold. This is the
 * one place in the pipeline that verifies a self-reported confidence against something other
 * than the model's own words (see stage-executor.escalation.test.ts for the rest of the
 * escalation decision logic, which this file does not duplicate).
 */

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
		}
	): Promise<{ guidance?: string; kind: string; output?: unknown }>;
	selfConsistencySamplerService: { checkAgreement: ReturnType<typeof vi.fn> };
	sessionBudgetService: { wouldExceed: ReturnType<typeof vi.fn> };
}

const makeStage = (): PipelineStage => ({ prompt: 'assess-risks', required: true, stage: 'plan' });

const makeSignal = (overrides: Partial<EscalationSignal> = {}): EscalationSignal => ({
	confidence: 74,
	confidenceSource: 'reported',
	proposed_action: 'Proceed',
	reasoning: 'Looks fine',
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

const DEFAULT_CONFIG: EscalationConfig = {
	confidenceThreshold: 70,
	requireExplicitBlock: true,
	selfConsistency: { borderlineBand: 10, enabled: true, sampleCount: 2 }
};

function makeExecutor(configOverrides: Partial<EscalationConfig> = {}): ExecutorInternals {
	const executor = new StageExecutor({} as never, {} as never) as unknown as ExecutorInternals;

	executor.escalationDetectionService = {
		getConfig: vi.fn().mockReturnValue({ ...DEFAULT_CONFIG, ...configOverrides }),
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

const makeReplay = (sessionId: string | undefined = 'session-1') => ({
	completionOptions: { messages: [] },
	model: 'test-model',
	originalUsage: undefined,
	provider: { complete: vi.fn() },
	sessionId
});

describe('StageExecutor self-consistency check', () => {
	const logger = getLogger();

	it('samples and forces escalation when a majority of samples disagree with the original "no escalation needed" report', async () => {
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 74 });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		executor.selfConsistencySamplerService.checkAgreement.mockResolvedValue({ agreementRatio: 0.0, disagrees: true });
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
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).toHaveBeenCalledTimes(1);
		expect(executor.escalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({
					requires_escalation: true,
					triggered_criteria: ['self_consistency_disagreement']
				})
			})
		);
		expect(outcome.kind).toBe('continue');
	});

	it('trusts the original report when samples agree, without escalating', async () => {
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 74 });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		executor.selfConsistencySamplerService.checkAgreement.mockResolvedValue({ agreementRatio: 1.0, disagrees: false });

		const outcome = await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).toHaveBeenCalledTimes(1);
		expect(executor.escalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		expect(outcome.kind).toBe('continue');
	});

	it('skips sampling and proceeds with the original report when it would exceed the session budget', async () => {
		const executor = makeExecutor();
		executor.sessionBudgetService.wouldExceed.mockReturnValue(true);
		const signal = makeSignal({ confidence: 74 });
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
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(outcome.kind).toBe('continue');
	});

	it('never samples when confidence is far above the borderline band', async () => {
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 95 });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);

		await executor.processEscalation(
			'...',
			makeStage(),
			'lead',
			['Confidence < 70%'],
			100,
			{},
			logger,
			true,
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});

	it('never samples when the signal already triggers escalation for another reason', async () => {
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 40 });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
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
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});

	it('never samples when self-consistency is disabled in config', async () => {
		const executor = makeExecutor({ selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 } });
		const signal = makeSignal({ confidence: 74 });
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
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(outcome.kind).toBe('continue');
	});

	it('never samples when confidence was defaulted rather than actually reported by the model', async () => {
		const executor = makeExecutor();
		const signal = makeSignal({ confidence: 74, confidenceSource: 'defaulted' });
		executor.escalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		// A defaulted confidence already escalates unconditionally in shouldTriggerEscalation — simulate that here.
		executor.escalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
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
			makeReplay()
		);

		expect(executor.selfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});
});
