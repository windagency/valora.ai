/**
 * Unit tests for PluginLoaderService — agent-only plugin bundles.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginLoaderService } from './plugin-loader.service';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('utils/resource-resolver', () => ({
	getResourceResolver: vi.fn(() => ({ registerPluginDir: vi.fn() }))
}));

function writeJson(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeFile(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

describe('PluginLoaderService — agent-only bundles', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads an agent-only plugin and exposes agentsDir', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-secops',
			version: '1.0.0',
			description: 'SecOps agent bundle',
			contributes: ['agents']
		});
		const agentFile = path.join(tmpDir, 'agents', 'secops-engineer.md');
		writeFile(agentFile, '---\nrole: secops-engineer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].manifest.name).toBe('valora-core-secops');
		expect(plugins[0].agentsDir).toBe(path.join(tmpDir, 'agents'));
		expect(plugins[0].commandsDir).toBeUndefined();
		expect(plugins[0].hooks).toBeUndefined();
	});

	it('returns status enabled for a valid agent plugin', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-design',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'ui-ux-designer.md'), '---\nrole: ui-ux-designer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins[0].status).toBe('enabled');
	});

	it('respects plugins.enabled allowlist — skips plugin not in list', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-platform',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'platform-engineer.md'), '---\nrole: platform-engineer\n---\ntest');

		const plugins = loader.loadAll({ enabled: ['other-plugin'] });

		expect(plugins).toHaveLength(0);
	});
});
