import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { register } from './index';

function makeApi(): PluginAPI {
	return {
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn() },
		lifecycle: { onActivate: vi.fn(), onDeactivate: vi.fn() },
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		providers: { register: vi.fn() }
	};
}

describe('valora-plugin-compression-typescript register()', () => {
	it('registers all tool keys', () => {
		const api = makeApi();
		register(api);
		const calls = vi.mocked(api.compression.registerStrategy).mock.calls.map(([tool]) => tool);
		expect(calls).toEqual(
			expect.arrayContaining([
				'tsc',
				'eslint',
				'jest',
				'vitest',
				'pnpm',
				'npm',
				'npx',
				'yarn',
				'prettier',
				'bun',
				'bunx',
				'biome'
			])
		);
		expect(calls).toHaveLength(12);
	});
});
