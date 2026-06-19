import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryProvider, MemoryProviderDescriptor } from 'types/memory.types';

import {
	getMemoryRegistry,
	MemoryProviderConflictError,
	MemoryProviderRegistry,
	resetMemoryRegistry
} from './registry';

const warnSpy = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: warnSpy
	}))
}));

function makeProviderClass(name = 'FakeMemoryProvider'): new (config: Record<string, unknown>) => MemoryProvider {
	return class implements MemoryProvider {
		static displayName = name;
		// Minimal implementation — properties are not exercised here.
		create = vi.fn();
		get = vi.fn();
		update = vi.fn();
		delete = vi.fn();
		query = vi.fn();
		findByPaths = vi.fn();
		invalidateByPaths = vi.fn();
		markStaleByPaths = vi.fn();
		purge = vi.fn();
		prune = vi.fn();
		flush = vi.fn();
		info = vi.fn();
		verify = vi.fn();
	} as unknown as new (config: Record<string, unknown>) => MemoryProvider;
}

const fakeDescriptor: MemoryProviderDescriptor = {
	capabilities: ['embeddings'],
	label: 'Fake Memory'
};

describe('MemoryProviderRegistry', () => {
	let registry: MemoryProviderRegistry;

	beforeEach(() => {
		registry = new MemoryProviderRegistry();
		warnSpy.mockClear();
	});

	afterEach(() => {
		resetMemoryRegistry();
	});

	describe('registerProvider — collision detection', () => {
		it('accepts first registration without error', () => {
			expect(() =>
				registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor)
			).not.toThrow();
		});

		it('throws MemoryProviderConflictError when a second owner registers the same key without override', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);

			expect(() =>
				registry.registerProvider('vault', makeProviderClass(), { owner: 'plugin-x' }, fakeDescriptor)
			).toThrow(MemoryProviderConflictError);
		});

		it('error message includes the colliding key', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);

			expect(() =>
				registry.registerProvider('vault', makeProviderClass(), { owner: 'plugin-x' }, fakeDescriptor)
			).toThrowError(/vault/i);
		});

		it('allows override when override flag is set', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);

			expect(() =>
				registry.registerProvider('vault', makeProviderClass(), { override: true, owner: 'plugin-x' }, fakeDescriptor)
			).not.toThrow();
		});

		it('replaces provider when override is set', () => {
			const ClassA = makeProviderClass('A');
			const ClassB = makeProviderClass('B');

			registry.registerProvider('vault', ClassA, { owner: 'core' }, fakeDescriptor);
			registry.registerProvider('vault', ClassB, { override: true, owner: 'plugin-x' }, fakeDescriptor);

			expect(registry.getOwner('vault')).toBe('plugin-x');
		});

		it('treats same owner registering the same key twice as a no-op (idempotent)', () => {
			const ClassA = makeProviderClass('A');
			registry.registerProvider('vault', ClassA, { owner: 'core' }, fakeDescriptor);

			expect(() => registry.registerProvider('vault', ClassA, { owner: 'core' }, fakeDescriptor)).not.toThrow();
		});

		it('succeeds silently when override replaces an existing provider (observable: new owner is registered)', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			registry.registerProvider('vault', makeProviderClass(), { override: true, owner: 'plugin-x' }, fakeDescriptor);

			expect(registry.getOwner('vault')).toBe('plugin-x');
		});
	});

	describe('registerProvider — owner & descriptor tracking', () => {
		it('tracks which owner registered which key', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			registry.registerProvider('sqlite', makeProviderClass(), { owner: 'plugin-sqlite' }, fakeDescriptor);

			expect(registry.getOwner('vault')).toBe('core');
			expect(registry.getOwner('sqlite')).toBe('plugin-sqlite');
		});

		it('returns undefined for an unregistered key', () => {
			expect(registry.getOwner('unknown')).toBeUndefined();
			expect(registry.getDescriptor('unknown')).toBeUndefined();
		});

		it('exposes the registered descriptor', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			expect(registry.getDescriptor('vault')).toEqual(fakeDescriptor);
		});

		it('lists all registered providers', () => {
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			registry.registerProvider('sqlite', makeProviderClass(), { owner: 'plugin-sqlite' }, fakeDescriptor);

			expect(registry.getAvailableProviders().sort()).toEqual(['sqlite', 'vault']);
		});

		it('hasProvider reports correct presence', () => {
			expect(registry.hasProvider('vault')).toBe(false);
			registry.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			expect(registry.hasProvider('vault')).toBe(true);
		});
	});

	describe('active provider lifecycle', () => {
		it('has no active provider by default', () => {
			expect(registry.hasActive()).toBe(false);
			expect(registry.getActiveName()).toBeUndefined();
		});

		it('throws when getActive() is called without an active provider', () => {
			expect(() => registry.getActive()).toThrow(/no active memory provider/i);
		});

		it('setActive throws for an unknown name', () => {
			expect(() => registry.setActive('does-not-exist', {})).toThrow(/unknown memory provider/i);
		});

		it('setActive instantiates the registered factory and exposes the instance', () => {
			const ClassA = makeProviderClass('A');
			registry.registerProvider('vault', ClassA, { owner: 'core' }, fakeDescriptor);

			registry.setActive('vault', { vaultDir: '/tmp/x' });

			expect(registry.hasActive()).toBe(true);
			expect(registry.getActiveName()).toBe('vault');
			expect(registry.getActive()).toBeInstanceOf(ClassA);
		});

		it('passes config to the factory at setActive time', () => {
			const constructorSpy = vi.fn();
			class CapturingProvider {
				constructor(config: Record<string, unknown>) {
					constructorSpy(config);
				}
			}
			registry.registerProvider(
				'vault',
				CapturingProvider as unknown as new (cfg: Record<string, unknown>) => MemoryProvider,
				{ owner: 'core' },
				fakeDescriptor
			);

			registry.setActive('vault', { vaultDir: '/tmp/active' });

			expect(constructorSpy).toHaveBeenCalledWith({ vaultDir: '/tmp/active' });
		});

		it('replaces the active instance on subsequent setActive calls', () => {
			registry.registerProvider('vault', makeProviderClass('V'), { owner: 'core' }, fakeDescriptor);
			registry.registerProvider('sqlite', makeProviderClass('S'), { owner: 'plugin-sqlite' }, fakeDescriptor);

			registry.setActive('vault', {});
			const first = registry.getActive();
			registry.setActive('sqlite', {});
			const second = registry.getActive();

			expect(second).not.toBe(first);
			expect(registry.getActiveName()).toBe('sqlite');
		});

		it('accepts plain factory functions as well as classes', () => {
			const factory = vi.fn((_config: Record<string, unknown>) => ({ flush: vi.fn() }) as unknown as MemoryProvider);
			registry.registerProvider('test-mem', factory, { owner: 'plugin-test' }, fakeDescriptor);

			registry.setActive('test-mem', { foo: 'bar' });

			expect(factory).toHaveBeenCalledWith({ foo: 'bar' });
			expect(registry.getActive()).toBeDefined();
		});
	});

	describe('resetMemoryRegistry', () => {
		it('clears the singleton so a fresh instance is returned on next call', () => {
			const first = getMemoryRegistry();
			resetMemoryRegistry();
			const second = getMemoryRegistry();

			expect(second).not.toBe(first);
		});

		it('clears any active provider state', () => {
			const singleton = getMemoryRegistry();
			singleton.registerProvider('vault', makeProviderClass(), { owner: 'core' }, fakeDescriptor);
			singleton.setActive('vault', {});

			resetMemoryRegistry();

			const fresh = getMemoryRegistry();
			expect(fresh.hasActive()).toBe(false);
			expect(fresh.getAvailableProviders()).toEqual([]);
		});
	});
});

describe('MemoryProviderConflictError', () => {
	it('exposes existingOwner, incomingOwner, and providerKey', () => {
		const err = new MemoryProviderConflictError('vault', 'core', 'plugin-x');

		expect(err.providerKey).toBe('vault');
		expect(err.existingOwner).toBe('core');
		expect(err.incomingOwner).toBe('plugin-x');
		expect(err.message).toMatch(/vault/);
		expect(err.message).toMatch(/core/);
		expect(err.message).toMatch(/plugin-x/);
	});

	it('is an instance of Error', () => {
		const err = new MemoryProviderConflictError('vault', 'a', 'b');
		expect(err).toBeInstanceOf(Error);
	});
});
