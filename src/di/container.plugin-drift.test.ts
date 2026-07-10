import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round-10 fix: plugin content fingerprinting only ran at install time
 * (plugin-installer.service.ts), never re-checked on subsequent `valora`
 * runs — a plugin's hooks.json/mcps.json/codeEntrypoint/validators could be
 * modified on disk after install and be activated with full trust
 * indefinitely. `security/tool-integrity-monitor` is mocked entirely (not
 * the real singleton) so this test can never touch the real, persistent
 * `.valora/mcp-baselines.json` on disk regardless of what `getRuntimeDataDir()`
 * resolves to in this environment.
 */

const mockCheckContentIntegrity = vi.fn();
vi.mock('security/tool-integrity-monitor', () => ({
	getToolIntegrityMonitor: () => ({
		checkContentIntegrity: mockCheckContentIntegrity,
		clearFingerprint: vi.fn(),
		setFingerprint: vi.fn()
	})
}));

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		child: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('output/processing-feedback', () => ({
	getProcessingFeedback: vi.fn(() => ({ showPluginsStatus: vi.fn() }))
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: vi.fn(() => ({})) }))
}));

vi.mock('plugins/plugin-loader.service', () => ({
	PluginLoaderService: vi.fn().mockImplementation(() => ({
		loadAll: vi.fn().mockReturnValue([])
	}))
}));

vi.mock('memory/bootstrap', () => ({
	bootstrapBundledMemoryProvider: vi.fn()
}));

vi.mock('@windagency/valora-plugin-memory-vault', () => ({
	parseVaultPluginConfig: vi.fn().mockReturnValue(undefined)
}));

describe('initializePlugins — plugin content drift re-check at load time', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-drift-test-'));
		mockCheckContentIntegrity.mockReset();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.resetModules();
	});

	function makePlugin(): {
		agentsDir: string;
		hooks: { PreToolUse: unknown[] };
		manifest: { name: string; version: string };
		pluginDir: string;
		status: string;
	} {
		const agentsDir = path.join(tmpDir, 'agents');
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, 'valora-plugin.json'),
			JSON.stringify({ name: 'drift-test-plugin', version: '1.0.0' })
		);
		return {
			agentsDir,
			hooks: { PreToolUse: [{ command: 'echo hi', matcher: '*' }] },
			manifest: { name: 'drift-test-plugin', version: '1.0.0' },
			pluginDir: tmpDir,
			status: 'enabled'
		};
	}

	it("registers a plugin's hooks normally when its fingerprint has not drifted", async () => {
		mockCheckContentIntegrity.mockReturnValue({ changed: false, currentFingerprint: 'fp' });

		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(
			() => ({ loadAll: vi.fn().mockReturnValue([makePlugin()]) }) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');
		const { getHookExecutionService } = await import('executor/hook-execution.service');
		const registerSpy = vi.spyOn(getHookExecutionService(), 'registerPluginHooks');

		const container = createContainer();
		await initializePlugins(container);

		expect(registerSpy).toHaveBeenCalledWith({ PreToolUse: [{ command: 'echo hi', matcher: '*' }] });
	});

	it("skips a plugin's hooks when its fingerprint has drifted since it was last verified, but still registers its agentsDir", async () => {
		mockCheckContentIntegrity.mockReturnValue({
			changed: true,
			currentFingerprint: 'new-fp',
			previousFingerprint: 'old-fp'
		});

		const plugin = makePlugin();
		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(() => ({ loadAll: vi.fn().mockReturnValue([plugin]) }) as never);

		const { createContainer, initializePlugins } = await import('di/container');
		const { getHookExecutionService } = await import('executor/hook-execution.service');
		const { AgentLoader } = await import('executor/agent-loader');
		const registerHooksSpy = vi.spyOn(getHookExecutionService(), 'registerPluginHooks');
		const registerDirSpy = vi.spyOn(AgentLoader.prototype, 'registerPluginDir');

		const container = createContainer();
		await initializePlugins(container);

		expect(registerHooksSpy).not.toHaveBeenCalled();
		expect(registerDirSpy).toHaveBeenCalledWith(plugin.agentsDir);
	});
});
