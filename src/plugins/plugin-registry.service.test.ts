import * as fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof fs>();
	return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const sampleEntries = [
	{
		contributes: ['agents', 'commands'],
		description: 'Engineering commands.',
		name: 'valora-plugin-engineering',
		package: '@windagency/valora-plugin-engineering',
		version: '1.0.0'
	}
];

describe('fetchPluginRegistry', () => {
	const originalLocalEnv = process.env['VALORA_PLUGIN_REGISTRY'];
	const originalUrlEnv = process.env['VALORA_PLUGIN_REGISTRY_URL'];

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		if (originalLocalEnv === undefined) {
			delete process.env['VALORA_PLUGIN_REGISTRY'];
		} else {
			process.env['VALORA_PLUGIN_REGISTRY'] = originalLocalEnv;
		}
		if (originalUrlEnv === undefined) {
			delete process.env['VALORA_PLUGIN_REGISTRY_URL'];
		} else {
			process.env['VALORA_PLUGIN_REGISTRY_URL'] = originalUrlEnv;
		}
	});

	it('fetches the registry from the remote URL when no env var is set', async () => {
		delete process.env['VALORA_PLUGIN_REGISTRY'];
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				json: vi.fn().mockResolvedValue(sampleEntries),
				ok: true,
				text: vi.fn().mockResolvedValue(JSON.stringify(sampleEntries))
			})
		);

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toEqual(sampleEntries);
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('github'),
			expect.objectContaining({ signal: expect.anything() as unknown })
		);
	});

	it('reads from a local file when VALORA_PLUGIN_REGISTRY env var is set', async () => {
		process.env['VALORA_PLUGIN_REGISTRY'] = '/tmp/test-registry.json';
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleEntries));

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toEqual(sampleEntries);
		expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/test-registry.json', 'utf-8');
	});

	it('returns null when the remote fetch fails', async () => {
		delete process.env['VALORA_PLUGIN_REGISTRY'];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toBeNull();
	});

	it('returns null when the remote fetch throws (network error)', async () => {
		delete process.env['VALORA_PLUGIN_REGISTRY'];
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toBeNull();
	});

	it('uses VALORA_PLUGIN_REGISTRY_URL when set to override the remote URL', async () => {
		delete process.env['VALORA_PLUGIN_REGISTRY'];
		process.env['VALORA_PLUGIN_REGISTRY_URL'] = 'https://example.com/custom-registry.json';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				text: vi.fn().mockResolvedValue(JSON.stringify(sampleEntries))
			})
		);

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toEqual(sampleEntries);
		expect(fetch).toHaveBeenCalledWith(
			'https://example.com/custom-registry.json',
			expect.objectContaining({ signal: expect.anything() as unknown })
		);
	});

	it('returns null when the local file cannot be read', async () => {
		process.env['VALORA_PLUGIN_REGISTRY'] = '/nonexistent/path.json';
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error('ENOENT');
		});

		const { fetchPluginRegistry } = await import('./plugin-registry.service');
		const result = await fetchPluginRegistry();

		expect(result).toBeNull();
	});
});
