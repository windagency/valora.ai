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
	getSessionBudgetService: vi.fn(() => ({ wouldExceed: vi.fn().mockReturnValue(false) }))
}));

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage } from 'types/command.types';
import type { EscalationResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionResult, LLMProvider } from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { ExecutionContext } from './execution-context';
import { PipelineExecutionContext, StageExecutor } from './stage-executor';

/**
 * Exercises the escalation decision-making in `StageExecutor` end-to-end through its
 * only meaningful public entry point, `executeStage()`. `promptLoader`/`agentLoader` are
 * StageExecutor's actual constructor-injected dependencies (the intended seam), so fakes
 * are supplied there rather than by reaching into private instance fields. The escalation
 * detection/handler services are module-level singletons (`getEscalationDetectionService`/
 * `getEscalationHandlerService`) with no constructor-injection seam, so they're replaced via
 * `vi.mock()` — a module boundary, not private state.
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
		provider: { complete: providerComplete } as unknown as LLMProvider
	});
}

function makeExecutor(escalationCriteria: string[] = ['Confidence < 70%']): StageExecutor {
	return new StageExecutor(makePromptLoader() as never, makeAgentLoader(escalationCriteria) as never);
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

describe('StageExecutor escalation handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEscalationDetectionService.getConfig.mockReturnValue({
			confidenceThreshold: 70,
			requireExplicitBlock: true,
			selfConsistency: { borderlineBand: 10, enabled: false, sampleCount: 2 }
		});
	});

	describe('fail-closed on a missing/unparseable escalation block', () => {
		it('continues normally when no signal is found and the detection service allows it (requireExplicitBlock disabled)', async () => {
			mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal: null });
			mockEscalationDetectionService.getMissingSignalEscalation.mockReturnValue(null);
			const providerComplete = vi.fn().mockResolvedValue(makeCompletion('no block here'));

			const output = await runStage(makeExecutor(), providerComplete);

			expect(output.success).toBe(true);
			expect(mockEscalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		});

		it('forces an escalation review when no signal is found and requireExplicitBlock is enabled', async () => {
			const forcedSignal = makeSignal({
				confidenceSource: 'defaulted',
				requires_escalation: true,
				risk_level: 'high',
				triggered_criteria: ['missing_escalation_block']
			});
			mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal: null });
			mockEscalationDetectionService.getMissingSignalEscalation.mockReturnValue(forcedSignal);
			mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
			const providerComplete = vi.fn().mockResolvedValue(makeCompletion('no block here'));

			const output = await runStage(makeExecutor(), providerComplete);

			expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
				expect.objectContaining({ signal: forcedSignal })
			);
			expect(output.success).toBe(true);
		});
	});

	describe('retry-on-modify', () => {
		it('re-invokes the LLM with the guidance appended when the human requests modification and a retry is allowed', async () => {
			const signal = makeSignal();
			mockEscalationDetectionService.parseResponse
				.mockReturnValueOnce({ cleanedContent: 'first response', signal })
				.mockReturnValueOnce({ cleanedContent: 'second response', signal: makeSignal({ confidence: 85 }) });
			mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValueOnce(true).mockReturnValueOnce(false);
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
				.mockResolvedValueOnce(makeCompletion('second response'));

			const output = await runStage(makeExecutor(), providerComplete);

			expect(providerComplete).toHaveBeenCalledTimes(2);
			const secondCallOptions = providerComplete.mock.calls[1]?.[0] as { messages: Array<{ content: string }> };
			const secondUserMessage = secondCallOptions.messages.find((m) => m.content.includes('Re-check'))?.content;
			expect(secondUserMessage).toContain('Re-check the auth edge cases');
			expect(output.success).not.toBe(false);
		});

		it('marks the escalation context as not allowing modification once the retry budget is exhausted', async () => {
			const signal = makeSignal();
			mockEscalationDetectionService.parseResponse
				.mockReturnValueOnce({ cleanedContent: 'first response', signal })
				.mockReturnValueOnce({ cleanedContent: 'second response', signal });
			mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			mockEscalationHandlerService.handleEscalation
				.mockResolvedValueOnce(
					makeEscalationResult({
						decision: { decision: 'modify', timestamp: 0 },
						modifiedGuidance: 'Re-check the auth edge cases',
						shouldProceed: false
					})
				)
				// On the final attempt "Modify" is no longer offered (allowModify=false) — simulate "proceed".
				.mockResolvedValueOnce(makeEscalationResult());
			const providerComplete = vi
				.fn()
				.mockResolvedValueOnce(makeCompletion('first response'))
				.mockResolvedValueOnce(makeCompletion('second response'));

			await runStage(makeExecutor(), providerComplete);

			expect(mockEscalationHandlerService.handleEscalation).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ allowModify: false })
			);
		});

		it('marks the escalation context as allowing modification on the first attempt, when a retry is still available', async () => {
			const signal = makeSignal();
			mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'response', signal });
			mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
			const providerComplete = vi.fn().mockResolvedValue(makeCompletion('response'));

			await runStage(makeExecutor(), providerComplete);

			expect(mockEscalationHandlerService.handleEscalation).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({ allowModify: true })
			);
		});

		it('returns a failed stage output when the human aborts, regardless of retry budget', async () => {
			const signal = makeSignal();
			mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'response', signal });
			mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(true);
			mockEscalationHandlerService.handleEscalation.mockResolvedValue(
				makeEscalationResult({
					decision: { decision: 'abort', timestamp: 0 },
					shouldAbort: true,
					shouldProceed: false
				})
			);
			const providerComplete = vi.fn().mockResolvedValue(makeCompletion('response'));

			const output = await runStage(makeExecutor(), providerComplete);

			expect(output.success).toBe(false);
			expect(output.error).toContain('Escalation aborted by user');
		});
	});
});
