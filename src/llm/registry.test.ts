import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMProvider } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { BuiltinProviders } from 'config/providers.config';
import { ProviderError } from 'utils/error-handler';

import { LLMProviderRegistry, ProviderConflictError, resetProviderRegistry } from './registry';

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

/**
 * A minimal provider class whose isConfigured() result and constructor-received
 * config are both controllable, for exercising createProvider()'s branches.
 */
function makeConfigurableProviderClass(
	configured: boolean,
	captured?: { config?: Record<string, unknown> }
): new (config: Record<string, unknown>) => LLMProvider {
	return class {
		constructor(config: Record<string, unknown>) {
			if (captured) captured.config = config;
		}
		isConfigured(): boolean {
			return configured;
		}
	} as unknown as new (config: Record<string, unknown>) => LLMProvider;
}

/** A plain factory function entry (no .prototype) rather than a class constructor. */
function makeConfigurableProviderFactory(
	configured: boolean,
	captured?: { config?: Record<string, unknown> }
): (config: Record<string, unknown>) => LLMProvider {
	return (config: Record<string, unknown>) => {
		if (captured) captured.config = config;
		return { isConfigured: () => configured } as unknown as LLMProvider;
	};
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

			expect(warnSpy).toHaveBeenCalledWith('Provider "ollama" overridden by "plugin-b" (was "plugin-a")', {
				incomingOwner: 'plugin-b',
				previousOwner: 'plugin-a',
				provider: 'ollama'
			});
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
			const { getProviderRegistry } = await import('./registry');
			const first = getProviderRegistry();
			resetProviderRegistry();
			const second = getProviderRegistry();

			expect(second).not.toBe(first);
		});
	});

	describe('createProvider', () => {
		it('throws a ProviderError naming the requested provider when it is not registered', () => {
			expect(() => registry.createProvider('unknown-provider', {})).toThrow(/Unknown provider: unknown-provider/);
		});

		it('lists the currently registered providers in the unknown-provider error details', () => {
			registry.registerProvider('anthropic', makeConfigurableProviderClass(true), { owner: 'core' });

			try {
				registry.createProvider('unknown-provider', {});
				expect.unreachable('createProvider should have thrown for an unregistered provider');
			} catch (error) {
				expect((error as ProviderError).details?.['available']).toContain('anthropic');
			}
		});

		it('constructs a class-based provider entry via `new`, passing the given config through', () => {
			const captured: { config?: Record<string, unknown> } = {};
			registry.registerProvider('anthropic', makeConfigurableProviderClass(true, captured), { owner: 'core' });

			const provider = registry.createProvider('anthropic', { apiKey: 'test-key' });

			expect(provider.isConfigured()).toBe(true);
			expect(captured.config).toEqual({ apiKey: 'test-key' });
		});

		it('invokes a plain factory-function provider entry directly, passing the given config through', () => {
			const captured: { config?: Record<string, unknown> } = {};
			registry.registerProvider('anthropic', makeConfigurableProviderFactory(true, captured), { owner: 'core' });

			const provider = registry.createProvider('anthropic', { apiKey: 'test-key' });

			expect(provider.isConfigured()).toBe(true);
			expect(captured.config).toEqual({ apiKey: 'test-key' });
		});

		it('throws when the constructed provider reports it is not configured', () => {
			registry.registerProvider('anthropic', makeConfigurableProviderClass(false), { owner: 'core' });

			expect(() => registry.createProvider('anthropic', {})).toThrow(/Provider anthropic is not properly configured/);
		});

		describe('Cursor provider special-casing', () => {
			it('passes the mcpSampling argument through to the Cursor provider constructor', () => {
				const receivedArgs: { config?: Record<string, unknown>; mcpSampling?: MCPSamplingService } = {};
				class FakeCursorProvider {
					constructor(config: Record<string, unknown>, mcpSampling?: MCPSamplingService) {
						receivedArgs.config = config;
						receivedArgs.mcpSampling = mcpSampling;
					}
					isConfigured(): boolean {
						return true;
					}
				}
				registry.registerProvider(
					BuiltinProviders.CURSOR,
					FakeCursorProvider as unknown as new (config: Record<string, unknown>) => LLMProvider,
					{ owner: 'core' }
				);
				const fakeMcpSampling = {} as MCPSamplingService;

				const provider = registry.createProvider(BuiltinProviders.CURSOR, { apiKey: 'unused' }, fakeMcpSampling);

				expect(provider.isConfigured()).toBe(true);
				expect(receivedArgs.mcpSampling).toBe(fakeMcpSampling);
			});

			it('throws a Cursor-specific MCP-context hint when the Cursor provider is not configured', () => {
				class UnconfiguredCursorProvider {
					isConfigured(): boolean {
						return false;
					}
				}
				registry.registerProvider(
					BuiltinProviders.CURSOR,
					UnconfiguredCursorProvider as unknown as new (config: Record<string, unknown>) => LLMProvider,
					{ owner: 'core' }
				);

				expect(() => registry.createProvider(BuiltinProviders.CURSOR, {})).toThrow(/requires MCP context/);
			});
		});
	});
});
