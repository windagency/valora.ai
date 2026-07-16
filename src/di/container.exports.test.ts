import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockBootstrapBundledMemoryProvider = vi.fn();
vi.mock('memory/bootstrap', () => ({
	bootstrapBundledMemoryProvider: mockBootstrapBundledMemoryProvider
}));

vi.mock('@windagency/valora-plugin-memory-vault', () => ({
	parseVaultPluginConfig: vi.fn().mockReturnValue(undefined)
}));

describe('di/container — exported helpers', () => {
	beforeEach(() => {
		mockBootstrapBundledMemoryProvider.mockReset();
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('getLoadedPlugins', () => {
		it('returns an empty array before initializePlugins has ever run', async () => {
			const { getLoadedPlugins } = await import('di/container');

			expect(getLoadedPlugins()).toEqual([]);
		});

		it('reflects the plugins loaded by the most recent initializePlugins() call', async () => {
			const { PluginLoaderService } = await import('plugins/plugin-loader.service');
			const fakePlugin = {
				manifest: { name: 'test-plugin', version: '1.0.0' },
				pluginDir: '/tmp/x',
				status: 'enabled'
			};
			vi.mocked(PluginLoaderService).mockImplementation(
				() => ({ loadAll: vi.fn().mockReturnValue([fakePlugin]) }) as never
			);

			const { createContainer, getLoadedPlugins, initializePlugins } = await import('di/container');
			const container = createContainer();
			await initializePlugins(container);

			expect(getLoadedPlugins()).toEqual([fakePlugin]);
		});
	});

	describe('bootstrapMemoryFromConfig', () => {
		it('dynamically imports and invokes bootstrapBundledMemoryProvider', async () => {
			const { bootstrapMemoryFromConfig } = await import('di/container');

			await bootstrapMemoryFromConfig();

			expect(mockBootstrapBundledMemoryProvider).toHaveBeenCalledOnce();
		});
	});

	describe('setupMCPServices', () => {
		it('registers the given MCP server under MCP_SERVER', async () => {
			const { createContainer, SERVICE_IDENTIFIERS, setupMCPServices } = await import('di/container');
			const container = createContainer();
			const fakeMcpServer = { name: 'fake-mcp-server' };

			setupMCPServices(container, fakeMcpServer as never);

			expect(container.resolve(SERVICE_IDENTIFIERS.MCP_SERVER)).toBe(fakeMcpServer);
		});

		it('registers a SAMPLING_SERVICE factory that wraps the given MCP server', async () => {
			const { createContainer, SERVICE_IDENTIFIERS, setupMCPServices } = await import('di/container');
			const { MCPSamplingServiceImpl } = await import('mcp/sampling-service');
			const container = createContainer();
			const fakeMcpServer = { name: 'fake-mcp-server' };

			setupMCPServices(container, fakeMcpServer as never);

			expect(container.resolve(SERVICE_IDENTIFIERS.SAMPLING_SERVICE)).toBeInstanceOf(MCPSamplingServiceImpl);
		});

		it("registers a REQUEST_HANDLER factory that resolves using the container's own COMMAND_EXECUTOR", async () => {
			const { createContainer, SERVICE_IDENTIFIERS, setupMCPServices } = await import('di/container');
			const { MCPRequestHandler } = await import('mcp/request-handler');
			const container = createContainer();
			const fakeMcpServer = { name: 'fake-mcp-server' };

			setupMCPServices(container, fakeMcpServer as never);

			expect(container.resolve(SERVICE_IDENTIFIERS.REQUEST_HANDLER)).toBeInstanceOf(MCPRequestHandler);
		});

		it('registers a TOOL_REGISTRY factory wired to the same MCP server, command loader, and request handler', async () => {
			const { createContainer, SERVICE_IDENTIFIERS, setupMCPServices } = await import('di/container');
			const { MCPToolRegistry } = await import('mcp/tool-registry');
			const container = createContainer();
			const fakeMcpServer = { name: 'fake-mcp-server' };

			setupMCPServices(container, fakeMcpServer as never);

			expect(container.resolve(SERVICE_IDENTIFIERS.TOOL_REGISTRY)).toBeInstanceOf(MCPToolRegistry);
		});
	});
});
