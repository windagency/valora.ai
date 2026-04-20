import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMProvider } from 'types/llm.types';

import { LLMProviderRegistry, ProviderConflictError, resetProviderRegistry } from '../registry';

const warnSpy = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: warnSpy
	}))
}));

function makeProviderClass(name = 'FakeProvider') {
	return class {
		static displayName = name;
	} as unknown as new (config: Record<string, unknown>) => LLMProvider;
}

describe('LLMProviderRegistry', () => {
	let registry: LLMProviderRegistry;

	beforeEach(() => {
		registry = new LLMProviderRegistry();
	});

	afterEach(() => {
		resetProviderRegistry();
	});

	describe('registerProvider – collision detection', () => {
		it('accepts first registration without error', () => {
			expect(() => registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' })).not.toThrow();
		});

		it('throws ProviderConflictError when a second plugin registers the same key without override', () => {
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' });

			expect(() => registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-b' })).toThrow(
				ProviderConflictError
			);
		});

		it('error message includes the colliding key', () => {
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' });

			expect(() => registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-b' })).toThrowError(
				/ollama/i
			);
		});

		it('allows override when override flag is set', () => {
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' });

			expect(() =>
				registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-b', override: true })
			).not.toThrow();
		});

		it('replaces provider when override is set', () => {
			const ClassA = makeProviderClass('A');
			const ClassB = makeProviderClass('B');

			registry.registerProvider('ollama', ClassA, { owner: 'plugin-a' });
			registry.registerProvider('ollama', ClassB, { owner: 'plugin-b', override: true });

			expect(registry.getAvailableProviders()).toContain('ollama');
		});

		it('treats same owner registering the same key twice as a no-op (idempotent)', () => {
			const ClassA = makeProviderClass('A');
			registry.registerProvider('ollama', ClassA, { owner: 'core' });

			expect(() => registry.registerProvider('ollama', ClassA, { owner: 'core' })).not.toThrow();
		});

		it('warns when override replaces an existing provider', () => {
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' });
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-b', override: true });

			expect(warnSpy).toHaveBeenCalled();
		});
	});

	describe('registerProvider – owner tracking', () => {
		it('tracks which owner registered which key', () => {
			registry.registerProvider('anthropic', makeProviderClass(), { owner: 'core' });
			registry.registerProvider('ollama', makeProviderClass(), { owner: 'plugin-a' });

			expect(registry.getOwner('anthropic')).toBe('core');
			expect(registry.getOwner('ollama')).toBe('plugin-a');
		});

		it('returns undefined for an unregistered key', () => {
			expect(registry.getOwner('unknown')).toBeUndefined();
		});
	});

	describe('resetProviderRegistry', () => {
		it('clears the singleton so a fresh instance is returned on next call', async () => {
			const { getProviderRegistry } = await import('../registry');
			const first = getProviderRegistry();
			resetProviderRegistry();
			const second = getProviderRegistry();

			expect(second).not.toBe(first);
		});
	});
});
