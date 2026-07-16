import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetMemoryRegistry } from './registry';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }))
}));

describe('bootstrapBundledMemoryProvider', () => {
	afterEach(() => {
		resetMemoryRegistry();
	});

	it('registers the ephemeral provider under the key "ephemeral"', async () => {
		const { bootstrapBundledMemoryProvider } = await import('./bootstrap');
		const { getMemoryRegistry } = await import('./registry');
		bootstrapBundledMemoryProvider();
		expect(getMemoryRegistry().hasProvider('ephemeral')).toBe(true);
	});

	it('activates the ephemeral provider', async () => {
		const { bootstrapBundledMemoryProvider } = await import('./bootstrap');
		const { getMemoryRegistry } = await import('./registry');
		bootstrapBundledMemoryProvider();
		expect(getMemoryRegistry().hasActive()).toBe(true);
		const info = await getMemoryRegistry().getActive().info();
		expect(info.name).toBe('ephemeral');
	});

	it('is idempotent — safe to call twice', async () => {
		const { bootstrapBundledMemoryProvider } = await import('./bootstrap');
		bootstrapBundledMemoryProvider();
		expect(() => bootstrapBundledMemoryProvider()).not.toThrow();
	});

	// The raw readFileSync + toContain check that used to live here is now
	// enforced repo-wide (not just for this one file) by
	// __tests__/architecture/memory-plugin.arch.test.ts, which already lists
	// src/memory/bootstrap.ts as a site no longer needing the vault-import
	// exemption — see its "no production file under src/ outside the
	// allowlist imports @windagency/valora-plugin-memory-vault" test.
});
