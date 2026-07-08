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

	it('does not import @windagency/valora-plugin-memory-vault', async () => {
		const source = await import('node:fs').then(({ readFileSync }) =>
			readFileSync(new URL('./bootstrap.ts', import.meta.url).pathname, 'utf-8')
		);
		expect(source).not.toContain('@windagency/valora-plugin-memory-vault');
	});
});
