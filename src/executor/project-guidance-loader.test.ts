import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';

vi.mock('di/container', () => ({
	getLoadedPlugins: vi.fn(() => [])
}));

vi.mock('utils/paths', () => ({
	getPackageDataDir: vi.fn(() => '/nonexistent/data')
}));

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({ bold: (s: string) => s, dim: (s: string) => s, magenta: (s: string) => s }))
}));

vi.mock('output/processing-feedback', () => ({
	getProcessingFeedback: vi.fn(() => ({ showInfo: vi.fn() }))
}));

import { getLoadedPlugins } from 'di/container';
import { getPackageDataDir } from 'utils/paths';

import { clearGuidanceCache, loadAvailableAgents } from './project-guidance-loader';

function makePlugin(partial: Partial<LoadedPlugin>): LoadedPlugin {
	return {
		manifest: { name: 'test-plugin', version: '1.0.0' },
		pluginDir: '/plugins/test-plugin',
		status: 'enabled',
		...partial
	};
}

function writeAgentFile(dir: string, role: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, `${role}.md`),
		`---\nrole: ${role}\nversion: 1.0.0\ndescription: Test agent\nspecialization: testing\ntone: concise-technical\ncapabilities:\n  can_write_knowledge: false\n  can_write_code: false\n  can_review_code: false\n  can_run_tests: false\n---\n\nAgent content for ${role}.`
	);
}

describe('loadAvailableAgents — plugin dir resolution', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-agents-test-'));
		clearGuidanceCache();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		clearGuidanceCache();
	});

	it('returns null when no agent dirs exist and no plugins are loaded', async () => {
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'nonexistent'));
		vi.mocked(getLoadedPlugins).mockReturnValue([]);

		const result = await loadAvailableAgents(['product-manager']);

		expect(result).toBeNull();
	});

	it('finds an agent in the primary data/agents dir', async () => {
		const primaryDir = path.join(tmpDir, 'data', 'agents');
		writeAgentFile(primaryDir, 'lead');
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'data'));
		vi.mocked(getLoadedPlugins).mockReturnValue([]);

		const result = await loadAvailableAgents(['lead']);

		expect(result).toContain('Agent content for lead');
	});

	it('finds an agent in a plugin agents dir when not in the primary dir', async () => {
		const primaryDir = path.join(tmpDir, 'data', 'agents');
		const pluginAgentsDir = path.join(tmpDir, 'plugins', 'my-plugin', 'agents');
		fs.mkdirSync(primaryDir, { recursive: true }); // primary exists but has no agents
		writeAgentFile(pluginAgentsDir, 'product-manager');
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'data'));
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({ agentsDir: pluginAgentsDir })]);

		const result = await loadAvailableAgents(['product-manager']);

		expect(result).toContain('Agent content for product-manager');
	});

	it('prefers the primary dir agent over the plugin dir when both contain the same role', async () => {
		const primaryDir = path.join(tmpDir, 'data', 'agents');
		const pluginAgentsDir = path.join(tmpDir, 'plugins', 'my-plugin', 'agents');
		writeAgentFile(primaryDir, 'lead');
		writeAgentFile(pluginAgentsDir, 'lead');
		// Overwrite plugin version with distinct content
		fs.writeFileSync(
			path.join(pluginAgentsDir, 'lead.md'),
			`---\nrole: lead\nversion: 1.0.0\ndescription: Plugin lead\nspecialization: testing\ntone: concise-technical\ncapabilities:\n  can_write_knowledge: false\n  can_write_code: false\n  can_review_code: false\n  can_run_tests: false\n---\n\nPlugin version of lead.`
		);
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'data'));
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({ agentsDir: pluginAgentsDir })]);

		const result = await loadAvailableAgents(['lead']);

		expect(result).toContain('Agent content for lead');
		expect(result).not.toContain('Plugin version of lead');
	});

	it('loads agents from multiple plugin dirs', async () => {
		const primaryDir = path.join(tmpDir, 'data', 'agents');
		const pluginDirA = path.join(tmpDir, 'plugins', 'plugin-a', 'agents');
		const pluginDirB = path.join(tmpDir, 'plugins', 'plugin-b', 'agents');
		fs.mkdirSync(primaryDir, { recursive: true });
		writeAgentFile(pluginDirA, 'lead');
		writeAgentFile(pluginDirB, 'product-manager');
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'data'));
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({ agentsDir: pluginDirA }),
			makePlugin({ agentsDir: pluginDirB })
		]);

		const result = await loadAvailableAgents(['lead', 'product-manager']);

		expect(result).toContain('Agent content for lead');
		expect(result).toContain('Agent content for product-manager');
	});

	it('skips plugins that have no agentsDir', async () => {
		const primaryDir = path.join(tmpDir, 'data', 'agents');
		fs.mkdirSync(primaryDir, { recursive: true });
		vi.mocked(getPackageDataDir).mockReturnValue(path.join(tmpDir, 'data'));
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({})]);

		expect(() => loadAvailableAgents(['lead'])).not.toThrow();
	});
});
