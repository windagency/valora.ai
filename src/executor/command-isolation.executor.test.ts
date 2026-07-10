/**
 * Regression guard: confirms a base context's `forbidden_paths` survive into
 * isolated/shared stage contexts via `derive(baseContext.effectiveConstraints,
 * {}, ...)`, which is idempotent here since these child contexts always share
 * the base context's own agentRole (no cross-role delegation exists in this
 * codebase). The actual constraint-wiring fix lives upstream, in
 * `ExecutionCoordinator.createExecutionContext()` (see execution-coordinator.test.ts)
 * — this file's `derive()` call sites were deliberately left unchanged after
 * TDD showed replacing their `{}` argument would be dead code (see
 * command-isolation.executor.ts's comments at both call sites for why).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineStage, StageOutput } from 'types/command.types';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import type { LLMProvider } from 'types/llm.types';

import { CommandIsolationExecutor } from './command-isolation.executor';
import { ExecutionContext } from './execution-context';

const stubProvider = {} as LLMProvider;

function makeBaseContext(forbiddenPaths: string[] = []): ExecutionContext {
	return new ExecutionContext({
		agentConstraints: { forbidden_paths: forbiddenPaths },
		agentRole: 'secops-engineer',
		args: [],
		commandName: 'test-command',
		flags: {},
		provider: stubProvider
	});
}

function makeStage(stage: string): PipelineStage {
	return { prompt: `${stage}-prompt`, required: true, stage: stage as PipelineStage['stage'] };
}

function makeSuccessOutput(stage: string): StageOutput {
	return { outputs: {}, stage, success: true };
}

describe('CommandIsolationExecutor constraint propagation', () => {
	let capturedContexts: ExecutionContext[];
	let stageExecutor: { executeStage: ReturnType<typeof vi.fn> };
	let executor: CommandIsolationExecutor;

	beforeEach(() => {
		capturedContexts = [];
		stageExecutor = {
			executeStage: vi.fn(async (stage, { executionContext }) => {
				capturedContexts.push(executionContext);
				return makeSuccessOutput(stage.stage);
			})
		};
		executor = new CommandIsolationExecutor(stageExecutor as any);
	});

	it('propagates declared forbidden_paths into an isolated single-stage context', async () => {
		const baseContext = makeBaseContext(['.valora/', 'data/']);
		const pipeline = [makeStage('analyze')];

		await executor.executeIsolated(
			'test-command',
			pipeline,
			{ skipValidation: true, stages: ['analyze'] },
			baseContext
		);

		expect(capturedContexts).toHaveLength(1);
		expect(capturedContexts[0]!.effectiveConstraints.forbidden_paths).toEqual(['.valora/', 'data/']);
	});

	it('propagates declared forbidden_paths into a shared multi-stage context', async () => {
		const baseContext = makeBaseContext(['.valora/']);
		const pipeline = [makeStage('analyze'), makeStage('implement')];

		await executor.executeIsolated('test-command', pipeline, { stages: ['analyze', 'implement'] }, baseContext);

		expect(capturedContexts).toHaveLength(2);
		for (const context of capturedContexts) {
			expect(context.effectiveConstraints.forbidden_paths).toEqual(['.valora/']);
		}
	});

	it('does not regress to empty constraints when the base context declares none', async () => {
		const baseContext = makeBaseContext([]);
		const pipeline = [makeStage('analyze')];

		await executor.executeIsolated(
			'test-command',
			pipeline,
			{ skipValidation: true, stages: ['analyze'] },
			baseContext
		);

		expect(capturedContexts[0]!.effectiveConstraints.forbidden_paths).toEqual([]);
	});
});
