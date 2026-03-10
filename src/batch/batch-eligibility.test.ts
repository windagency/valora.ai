import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineStage } from 'types/command.types';
import type { LLMProvider } from 'types/llm.types';

import type { ExecutionContext } from 'executor/execution-context';

import { isEligible } from './batch-eligibility';

// Minimal mock providers
const batchableProvider: LLMProvider & { supportsBatch: () => true } = {
	complete: vi.fn(),
	getAlternativeModels: vi.fn().mockReturnValue([]),
	isConfigured: vi.fn().mockReturnValue(true),
	name: 'anthropic',
	streamComplete: vi.fn(),
	supportsBatch: () => true as const,
	validateModel: vi.fn().mockResolvedValue(true)
};

const nonBatchableProvider: LLMProvider = {
	complete: vi.fn(),
	getAlternativeModels: vi.fn().mockReturnValue([]),
	isConfigured: vi.fn().mockReturnValue(true),
	name: 'google',
	streamComplete: vi.fn(),
	validateModel: vi.fn().mockResolvedValue(true)
};

function makeContext(flags: Record<string, boolean | string | undefined> = {}): ExecutionContext {
	return {
		flags,
		provider: batchableProvider
	} as unknown as ExecutionContext;
}

function makeStage(overrides: Partial<PipelineStage> = {}): PipelineStage {
	return {
		prompt: 'test-prompt',
		required: true,
		stage: 'review',
		...overrides
	};
}

describe('isEligible', () => {
	describe('when all conditions are met', () => {
		it('returns eligible: true', () => {
			const stage = makeStage({ batch: true });
			const ctx = makeContext({ batch: true });

			const result = isEligible(stage, ctx, batchableProvider);

			expect(result.eligible).toBe(true);
			expect(result.reason).toBeUndefined();
		});
	});

	describe('when stage.batch is not set', () => {
		it('returns eligible: false with correct reason', () => {
			const stage = makeStage({ batch: undefined });
			const ctx = makeContext({ batch: true });

			const result = isEligible(stage, ctx, batchableProvider);

			expect(result.eligible).toBe(false);
			expect(result.reason).toMatch(/batch: true/);
		});
	});

	describe('when --batch flag is not set', () => {
		it('returns eligible: false with correct reason', () => {
			const stage = makeStage({ batch: true });
			const ctx = makeContext({});

			const result = isEligible(stage, ctx, batchableProvider);

			expect(result.eligible).toBe(false);
			expect(result.reason).toMatch(/--batch/);
		});
	});

	describe('when provider does not support batch', () => {
		it('returns eligible: false with provider name in reason', () => {
			const stage = makeStage({ batch: true });
			const ctx = makeContext({ batch: true });

			const result = isEligible(stage, ctx, nonBatchableProvider);

			expect(result.eligible).toBe(false);
			expect(result.reason).toContain(nonBatchableProvider.name);
		});
	});

	describe('when multiple conditions fail', () => {
		it('reports the first failing condition (stage.batch missing)', () => {
			const stage = makeStage();
			const ctx = makeContext({});

			const result = isEligible(stage, ctx, nonBatchableProvider);

			expect(result.eligible).toBe(false);
			// Should fail on stage.batch check first
			expect(result.reason).toMatch(/batch: true/);
		});
	});
});
