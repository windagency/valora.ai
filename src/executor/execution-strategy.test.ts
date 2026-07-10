import { describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';

vi.mock('di/container', () => ({
	getLoadedPlugins: vi.fn(() => [])
}));

import { getLoadedPlugins } from 'di/container';

import { registerPluginAgentDirs, registerPluginDirsOnLoaders } from './execution-strategy';

function makePlugin(partial: Partial<LoadedPlugin>): LoadedPlugin {
	return {
		manifest: { name: 'test-plugin', version: '1.0.0' },
		pluginDir: '/plugins/test-plugin',
		status: 'enabled',
		...partial
	};
}

describe('registerPluginDirsOnLoaders', () => {
	it('registers agentsDir from each loaded plugin on the agent loader', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({ agentsDir: '/plugin/agents' })]);
		const agentLoader = { registerPluginDir: vi.fn() };
		const promptLoader = { registerPluginPromptsDir: vi.fn() };

		await registerPluginDirsOnLoaders(agentLoader, promptLoader);

		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin/agents');
	});

	it('registers promptsDir from each loaded plugin on the prompt loader', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({ promptsDir: '/plugin/prompts' })]);
		const agentLoader = { registerPluginDir: vi.fn() };
		const promptLoader = { registerPluginPromptsDir: vi.fn() };

		await registerPluginDirsOnLoaders(agentLoader, promptLoader);

		expect(promptLoader.registerPluginPromptsDir).toHaveBeenCalledWith('/plugin/prompts');
	});

	it('skips plugins that contribute neither agents nor prompts', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({})]);
		const agentLoader = { registerPluginDir: vi.fn() };
		const promptLoader = { registerPluginPromptsDir: vi.fn() };

		await registerPluginDirsOnLoaders(agentLoader, promptLoader);

		expect(agentLoader.registerPluginDir).not.toHaveBeenCalled();
		expect(promptLoader.registerPluginPromptsDir).not.toHaveBeenCalled();
	});

	it('registers dirs for all plugins when multiple plugins are loaded', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({ agentsDir: '/plugin-a/agents' }),
			makePlugin({ agentsDir: '/plugin-b/agents', promptsDir: '/plugin-b/prompts' })
		]);
		const agentLoader = { registerPluginDir: vi.fn() };
		const promptLoader = { registerPluginPromptsDir: vi.fn() };

		await registerPluginDirsOnLoaders(agentLoader, promptLoader);

		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin-a/agents');
		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin-b/agents');
		expect(promptLoader.registerPluginPromptsDir).toHaveBeenCalledWith('/plugin-b/prompts');
	});
});

describe('registerPluginAgentDirs', () => {
	it('registers agentsDir from each loaded plugin on the agent loader', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({ agentsDir: '/plugin/agents' })]);
		const agentLoader = { registerPluginDir: vi.fn() };

		await registerPluginAgentDirs(agentLoader);

		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin/agents');
	});

	it('skips plugins that contribute no agents dir', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([makePlugin({})]);
		const agentLoader = { registerPluginDir: vi.fn() };

		await registerPluginAgentDirs(agentLoader);

		expect(agentLoader.registerPluginDir).not.toHaveBeenCalled();
	});

	it('registers dirs for all plugins when multiple plugins are loaded', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({ agentsDir: '/plugin-a/agents' }),
			makePlugin({ agentsDir: '/plugin-b/agents' })
		]);
		const agentLoader = { registerPluginDir: vi.fn() };

		await registerPluginAgentDirs(agentLoader);

		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin-a/agents');
		expect(agentLoader.registerPluginDir).toHaveBeenCalledWith('/plugin-b/agents');
	});
});
