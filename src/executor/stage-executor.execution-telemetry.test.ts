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
		// Confidence is 95 in these tests — outside the self-consistency borderline band — so
		// self-consistency sampling is disabled here to isolate the telemetry check under test.
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

const mockSelfConsistencySamplerService = { checkAgreement: vi.fn() };
vi.mock('executor/self-consistency-sampler.service', () => ({
	getSelfConsistencySamplerService: vi.fn(() => mockSelfConsistencySamplerService)
}));

vi.mock('executor/session-budget.service', () => ({
	getSessionBudgetService: vi.fn(() => ({
		getSessionTotal: vi.fn().mockReturnValue({ totalCostUsd: 0 }),
		wouldExceed: vi.fn().mockReturnValue(false)
	}))
}));

const mockToolExecutionService = {
	executeTools: vi.fn().mockResolvedValue([]),
	flushPendingWrites: vi.fn(async () => ({ skipped: 0, written: 0 })),
	getToolDefinitions: vi.fn(() => []),
	hasPendingWrites: vi.fn(() => false),
	resetForNewCommand: vi.fn(),
	setDryRunMode: vi.fn(),
	setEffectiveConstraints: vi.fn(),
	setMCPClientManager: vi.fn(),
	setMCPToolHandler: vi.fn()
};
vi.mock('executor/tool-execution.service', () => ({
	getToolExecutionService: vi.fn(() => mockToolExecutionService)
}));

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage } from 'types/command.types';
import type { EscalationResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionResult, LLMProvider, LLMToolCall } from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { ExecutionContext } from './execution-context';
import { PipelineExecutionContext, StageExecutor } from './stage-executor';

/**
 * Exercises the execution-telemetry cross-check reached via `processEscalation`: when the
 * model reports "no escalation needed" but the stage's own tool-loop telemetry shows it
 * actually struggled (exhausted its iteration budget, or a mutating tool call failed), that
 * is independently-verified evidence the pipeline already computes but previously never
 * compared against the confidence claim. Unlike self-consistency sampling, this check is
 * free (no extra LLM calls) and applies to every escalation-gated stage, not just a
 * borderline confidence band.
 *
 * Driven end-to-end through `executeStage()`: the "exhausted" and "fatal failure" telemetry
 * are produced by the REAL tool loop (`callLLMWithToolLoop`/`extractExecutionSummary`)
 * reacting to a fake LLM provider and a fake tool-execution service, rather than by
 * hand-constructing an ExecutionSummary and injecting it directly — this exercises the real
 * summary-derivation logic too, not just the branch that consumes it.
 */

const makeStage = (maxToolIterations?: number): PipelineStage => ({
	max_tool_iterations: maxToolIterations,
	prompt: 'assess-risks',
	required: true,
	stage: 'plan'
});

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

function makeCompletion(content: string, toolCalls?: LLMToolCall[]): LLMCompletionResult {
	return { content, model: 'test-model', role: 'assistant', tool_calls: toolCalls };
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

function makeExecutor(): StageExecutor {
	return new StageExecutor(makePromptLoader() as never, makeAgentLoader() as never);
}

async function runStage(
	executor: StageExecutor,
	providerComplete: ReturnType<typeof vi.fn>,
	maxToolIterations?: number
): Promise<Awaited<ReturnType<StageExecutor['executeStage']>>> {
	const context: PipelineExecutionContext = { executionContext: makeExecutionContext(providerComplete) };
	return executor.executeStage(makeStage(maxToolIterations), context, 0);
}

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

describe('StageExecutor execution-telemetry mismatch check', () => {
	it('forces escalation when the tool loop was exhausted despite a confident "no escalation needed" report', async () => {
		const signal = makeSignal();
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		mockToolExecutionService.executeTools.mockResolvedValueOnce([{ output: 'file contents', tool_call_id: 'call_1' }]);
		// max_tool_iterations: 1 — one tool-call iteration exhausts the budget immediately,
		// forcing handleMaxIterationsExceeded's forced-final-output call (2nd provider.complete).
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(makeCompletion('', [{ arguments: { path: 'x.txt' }, id: 'call_1', name: 'read_file' }]))
			.mockResolvedValueOnce(makeCompletion('{}'));

		const output = await runStage(makeExecutor(), providerComplete, 1);

		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({
					requires_escalation: true,
					triggered_criteria: ['execution_telemetry_mismatch']
				})
			})
		);
		expect(output.success).toBe(true);
	});

	it('forces escalation when a mutating tool call actually failed despite the report', async () => {
		const signal = makeSignal();
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		mockToolExecutionService.executeTools.mockResolvedValueOnce([
			{ output: 'Error: disk full', tool_call_id: 'call_1' }
		]);
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(
				makeCompletion('', [{ arguments: { content: 'x', path: 'foo.txt' }, id: 'call_1', name: 'write' }])
			)
			.mockResolvedValueOnce(makeCompletion('{}'));

		await runStage(makeExecutor(), providerComplete, 1);

		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({ triggered_criteria: ['execution_telemetry_mismatch'] })
			})
		);
	});

	it('does not escalate when telemetry is clean', async () => {
		const signal = makeSignal();
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		const providerComplete = vi.fn().mockResolvedValue(makeCompletion('all clear'));

		const output = await runStage(makeExecutor(), providerComplete);

		expect(mockEscalationHandlerService.handleEscalation).not.toHaveBeenCalled();
		expect(output.success).toBe(true);
	});

	it('still escalates on a telemetry mismatch even when confidence is well outside the self-consistency band', async () => {
		// Confidence 95 is far outside the default [70, 80) borderline band — self-consistency
		// would never fire here, but the telemetry check is unconditional.
		const signal = makeSignal({ confidence: 95 });
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		mockToolExecutionService.executeTools.mockResolvedValueOnce([{ output: 'file contents', tool_call_id: 'call_1' }]);
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(makeCompletion('', [{ arguments: { path: 'x.txt' }, id: 'call_1', name: 'read_file' }]))
			.mockResolvedValueOnce(makeCompletion('{}'));

		await runStage(makeExecutor(), providerComplete, 1);

		expect(mockSelfConsistencySamplerService.checkAgreement).not.toHaveBeenCalled();
		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({ triggered_criteria: ['execution_telemetry_mismatch'] })
			})
		);
	});

	it('forces escalation when a fatal tool failure is followed by a normal (non-exhausted) completion', async () => {
		// Regression test for a bug found while rewriting this suite: the tool loop's
		// "completed without tool calls" exit path used to return a hardcoded zero-valued
		// summary instead of scanning message history via extractExecutionSummary() — so a
		// fatal failure only ever surfaced here when it happened to coincide with loop
		// exhaustion. With a generous max_tool_iterations, the loop never exhausts, isolating
		// this exit path specifically.
		const signal = makeSignal();
		mockEscalationDetectionService.parseResponse.mockReturnValue({ cleanedContent: 'x', signal });
		mockEscalationDetectionService.shouldTriggerEscalation.mockReturnValue(false);
		mockEscalationHandlerService.handleEscalation.mockResolvedValue(makeEscalationResult());
		mockToolExecutionService.executeTools.mockResolvedValueOnce([
			{ output: 'Error: disk full', tool_call_id: 'call_1' }
		]);
		const providerComplete = vi
			.fn()
			.mockResolvedValueOnce(
				makeCompletion('', [{ arguments: { content: 'x', path: 'foo.txt' }, id: 'call_1', name: 'write' }])
			)
			.mockResolvedValueOnce(makeCompletion('{}'));

		await runStage(makeExecutor(), providerComplete, 20);

		expect(mockEscalationHandlerService.handleEscalation).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.objectContaining({ triggered_criteria: ['execution_telemetry_mismatch'] })
			})
		);
	});

	// NOTE: the original version of this suite also covered `executionSummary === undefined`
	// (framed as "a guided-completion path that never ran a tool loop"). That branch is only
	// reachable by calling the private `processEscalation` directly with a hand-constructed
	// `undefined` — `processEscalation` has exactly one real call site (`handleStageCompletion`),
	// which always passes the real summary `callLLMWithToolLoop` returns, and a guided completion
	// short-circuits before escalation is even considered (see `handleStageCompletion`'s
	// `completion.guidedCompletion` check). So `executionSummary` is never actually undefined on
	// any path reachable through the public API — this was defensive-typing coverage for
	// currently-dead code, not a real observable behaviour, and is intentionally not ported.
});
