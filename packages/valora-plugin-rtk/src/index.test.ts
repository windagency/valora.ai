import type { PluginAPI } from 'plugins/plugin-api.types';

import { describe, expect, it, vi } from 'vitest';

import { register } from './index.js';

function makeApi(onActivate = vi.fn()): PluginAPI {
	return {
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn() },
		lifecycle: { onActivate, onDeactivate: vi.fn() },
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		providers: { register: vi.fn() }
	};
}

describe('register()', () => {
	it('registers an onActivate lifecycle hook', () => {
		const onActivate = vi.fn();
		register(makeApi(onActivate), { ensureInstalled: vi.fn() });
		expect(onActivate).toHaveBeenCalledOnce();
	});

	it('calls ensureInstalled when the activation hook fires', async () => {
		let capturedHook: (() => Promise<void>) | undefined;
		const onActivate = vi.fn((fn: () => Promise<void>) => {
			capturedHook = fn;
		});
		const binaryManager = { ensureInstalled: vi.fn().mockResolvedValue(undefined) };

		register(makeApi(onActivate), binaryManager);
		await capturedHook!();

		expect(binaryManager.ensureInstalled).toHaveBeenCalledOnce();
	});
});
