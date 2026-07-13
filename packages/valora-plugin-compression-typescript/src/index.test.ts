import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { register } from './index';
import {
	filterBiome,
	filterEslint,
	filterPackageManager,
	filterPrettier,
	filterTestRunner,
	filterTsc
} from './strategies.js';

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

	it('binds each tool key to its own filter function, not a mismatched one', () => {
		const api = makeApi();
		register(api);
		const registerStrategy = vi.mocked(api.compression.registerStrategy);

		expect(registerStrategy).toHaveBeenCalledWith('tsc', filterTsc);
		expect(registerStrategy).toHaveBeenCalledWith('eslint', filterEslint);
		expect(registerStrategy).toHaveBeenCalledWith('jest', filterTestRunner);
		expect(registerStrategy).toHaveBeenCalledWith('vitest', filterTestRunner);
		expect(registerStrategy).toHaveBeenCalledWith('pnpm', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('npm', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('npx', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('yarn', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('prettier', filterPrettier);
		expect(registerStrategy).toHaveBeenCalledWith('bun', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('bunx', filterPackageManager);
		expect(registerStrategy).toHaveBeenCalledWith('biome', filterBiome);
	});
});
