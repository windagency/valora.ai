import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { register } from './index';
import {
	filterCat,
	filterCurl,
	filterDiff,
	filterDocker,
	filterGh,
	filterGit,
	filterJson,
	filterLog,
	filterLs,
	filterMake,
	filterRg
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

describe('valora-plugin-compression-universal register()', () => {
	it('registers all tool keys', async () => {
		const api = makeApi();
		register(api);
		const calls = vi.mocked(api.compression.registerStrategy).mock.calls.map(([tool]) => tool);
		expect(calls).toEqual(
			expect.arrayContaining([
				'git',
				'grep',
				'rg',
				'docker',
				'make',
				'ls',
				'find',
				'tree',
				'cat',
				'diff',
				'curl',
				'wget',
				'jq',
				'yq',
				'tail',
				'journalctl',
				'gh'
			])
		);
		expect(calls).toHaveLength(17);
	});

	it('binds each tool key to its own filter function, not a mismatched one', () => {
		const api = makeApi();
		register(api);
		const registerStrategy = vi.mocked(api.compression.registerStrategy);

		expect(registerStrategy).toHaveBeenCalledWith('git', filterGit);
		expect(registerStrategy).toHaveBeenCalledWith('grep', filterRg);
		expect(registerStrategy).toHaveBeenCalledWith('rg', filterRg);
		expect(registerStrategy).toHaveBeenCalledWith('docker', filterDocker);
		expect(registerStrategy).toHaveBeenCalledWith('make', filterMake);
		expect(registerStrategy).toHaveBeenCalledWith('ls', filterLs);
		expect(registerStrategy).toHaveBeenCalledWith('find', filterLs);
		expect(registerStrategy).toHaveBeenCalledWith('tree', filterLs);
		expect(registerStrategy).toHaveBeenCalledWith('cat', filterCat);
		expect(registerStrategy).toHaveBeenCalledWith('diff', filterDiff);
		expect(registerStrategy).toHaveBeenCalledWith('curl', filterCurl);
		expect(registerStrategy).toHaveBeenCalledWith('wget', filterCurl);
		expect(registerStrategy).toHaveBeenCalledWith('jq', filterJson);
		expect(registerStrategy).toHaveBeenCalledWith('yq', filterJson);
		expect(registerStrategy).toHaveBeenCalledWith('tail', filterLog);
		expect(registerStrategy).toHaveBeenCalledWith('journalctl', filterLog);
		expect(registerStrategy).toHaveBeenCalledWith('gh', filterGh);
	});
});
