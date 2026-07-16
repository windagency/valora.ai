import { beforeEach, describe, expect, it, vi } from 'vitest';

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
	getConfig: vi.fn(),
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

const mockSelfConsistencySamplerService = { checkAgreement: vi.fn() };
vi.mock('executor/self-consistency-sampler.service', () => ({
	getSelfConsistencySamplerService: vi.fn(() => mockSelfConsistencySamplerService)
}));

const mockSessionBudgetService = {
	getSessionTotal: vi.fn().mockReturnValue({ totalCostUsd: 0 }),
	wouldExceed: vi.fn().mockReturnValue(false)
};
vi.mock('executor/session-budget.service', () => ({
	getSessionBudgetService: vi.fn(() => mockSessionBudgetService)
}));

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage } from 'types/command.types';
import type { EscalationConfig, EscalationResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionResult, LLMProvider } from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { ExecutionContext } from './execution-context';
import { PipelineExecutionContext, StageExecutor } from './stage-executor';

/**
 * Exercises the self-consistency check (`maybeApplySelfConsistencyCheck`, reached via
 * `processEscalation`) end-to-end through `executeStage()` — the model reports confidence
 * just above the escalation threshold, and this is the one place in the pipeline that
 * verifies that self-report against something other than the model's own words. See
 * stage-executor.escalation.test.ts for the rest of the escalation decision logic (not
 * duplicated here).
 *
 * As in that file, `promptLoader`/`agentLoader` are supplied as real constructor
 * arguments (StageExecutor's actual DI seam); the escalation/self-consistency/session-budget
 * services are module-level singletons replaced via `vi.mock()`, not private-field overrides.
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

function makeExecutionContext(
	providerComplete: ReturnType<typeof vi.fn>,
	sessionId: string | undefined
): ExecutionContext {
	return new ExecutionContext({
		agentRole: 'lead',
		args: [],
		commandName: 'test-command',
		flags: {},
		provider: { complete: providerComplete } as unknown as LLMProvider,
		sessionInfo: sessionId ? { isResumed: false, sessionId } : undefined
	});
}

function makeExecutor(): StageExecutor {
	return new StageExecutor(makePromptLoader() as never, makeAgentLoader() as never);
}

async function runStage(
	executor: StageExecutor,
	providerComplete: ReturnType<typeof vi.fn>,
	sessionId: string | undefined = 'session-1'
): Promise<Awaited<ReturnType<StageExecutor['executeStage']>>> {
	const context: PipelineExecutionContext = { executionContext: makeExecutionContext(providerComplete, sessionId) };
	return executor.executeStage(makeStage(), context, 0);
}

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

describe('StageExecutor self-consistency check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEscalationDetectionService.getConfig.mockReturnValue(DEFAULT_CONFIG);
		mockSessionBudgetService.wouldExceed.mockReturnValue(false);
		mockSessionBudgetService.getSessionTotal.mockReturnValue({ totalCostUsd: 0 });
	});

	it('samples and forces escalation when a majority of samples disagree with the original "no escalation needed" report', async () => {
		const signal = makeSignal({ confidence: 74 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockSelfConsistencySamplerService.checkAgreement.mockResolvedValue({ agreementRatio: 0.0, disagrees: true });
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).toHaveBeenCalledTimes(1);
		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({
					requires_escalation: true,
					triggered_criteria: ['self_consistency_disagreement']
				})
			})
		);
		expect(output.success).toBe(true);
	});

	it('trusts the original report when samples agree, without escalating', async () => {
		const signal = makeSignal({ confidence: 74 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockSelfConsistencySamplerService.checkAgreement.mockResolvedValue({ agreementRatio: 1.0, disagrees: false });
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).toHaveBeenCalledTimes(1);
		expect(mockEscalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		expect(output.success).toBe(true);
	});

	it('skips sampling and proceeds with the original report when it would exceed the session budget', async () => {
		// First call is the stage-level pre-LLM-call budget circuit-breaker (must stay under
		// budget so the LLM call actually happens); the second is the self-consistency
		// sampling gate this test targets.
		mockSessionBudgetService.wouldExceed.mockReturnValueOnce(false).mockReturnValueOnce(true);
		const signal = makeSignal({ confidence: 74 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(output.success).toBe(true);
	});

	it('never samples when confidence is far above the borderline band', async () => {
		const signal = makeSignal({ confidence: 95 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});

	it('never samples when the signal already triggers escalation for another reason', async () => {
		const signal = makeSignal({ confidence: 40 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});

	it('never samples when self-consistency is disabled in config', async () => {
		mockEscalationDetectionService.getConfig.mockReturnValue({
			...DEFAULT_CONFIG,
			selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 }
		});
		const signal = makeSignal({ confidence: 74 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(output.success).toBe(true);
	});

	it('never samples when confidence was defaulted rather than actually reported by the model', async () => {
		const signal = makeSignal({ confidence: 74, confidenceSource: 'defaulted' });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		// A defaulted confidence already escalates unconditionally in shouldTriggerEscalation — simulate that here.
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('...'));

		await runStage(makeExecutor(), providerComplete);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
	});
});
