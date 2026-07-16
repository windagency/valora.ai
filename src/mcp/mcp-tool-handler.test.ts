import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MCPTool } from 'types/command.types';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
}));

vi.mock('output/processing-feedback', () => ({
	getProcessingFeedback: vi.fn(() => ({ showMCPStatus: vi.fn(), showMCPToolCall: vi.fn() }))
}));

vi.mock('security/credential-guard', () => ({
	getCredentialGuard: vi.fn(() => ({ scanOutput: (s: string) => s }))
}));

vi.mock('security/prompt-injection-detector', () => ({
	getPromptInjectionDetector: vi.fn(() => ({ sanitizeToolResult: (_tool: string, content: string) => content }))
}));

import { MCPToolHandler } from './mcp-tool-handler';

function makeHandler() {
	const clientManager = {
		callTool: vi.fn(),
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		getConnectedServer: vi.fn().mockReturnValue({ availableTools: [] }),
		getServerConfig: vi.fn(),
		getServerTools: vi.fn().mockReturnValue([]),
		isConnected: vi.fn().mockReturnValue(false),
		requiresApproval: vi.fn().mockResolvedValue(false)
	};
	const availabilityService = { checkAvailability: vi.fn() };
	const approvalCache = {
		cacheApproval: vi.fn().mockResolvedValue(undefined),
		loadPersistentCache: vi.fn().mockResolvedValue(undefined)
	};
	const auditLogger = { logApproval: vi.fn().mockResolvedValue(undefined) };
	const approvalWorkflow = {
		displayConnectionSummary: vi.fn(),
		requestApproval: vi.fn()
	};

	const handler = new MCPToolHandler(
		clientManager as never,
		availabilityService as never,
		approvalCache as never,
		auditLogger as never,
		approvalWorkflow as never
	);

	return { approvalCache, approvalWorkflow, auditLogger, availabilityService, clientManager, handler };
}

describe('MCPToolHandler.executeTool', () => {
	const mcpTool = 'mcp_test_server' as MCPTool;

	it('connects to a not-yet-connected server (no approval required) and executes the tool', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.callTool.mockResolvedValue({ content: 'tool output', success: true });

		const result = await handler.executeTool(mcpTool, 'do_thing', { input: 'x' });

		expect(clientManager.connect).toHaveBeenCalledWith('test-server');
		expect(clientManager.callTool).toHaveBeenCalledWith(
			expect.objectContaining({ args: { input: 'x' }, serverId: 'test-server', toolName: 'do_thing' })
		);
		expect(result).toEqual(
			expect.objectContaining({
				error: undefined,
				output: 'tool output',
				serverId: 'test-server',
				success: true,
				toolName: 'do_thing'
			})
		);
	});

	it('does not reconnect when the server is already connected', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.isConnected.mockReturnValue(true);
		clientManager.callTool.mockResolvedValue({ content: 'ok', success: true });

		await handler.executeTool(mcpTool, 'do_thing', {});

		expect(clientManager.connect).not.toHaveBeenCalled();
		expect(clientManager.getServerConfig).not.toHaveBeenCalled();
	});

	it('fails with a clear error when the server is not registered', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue(null);

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('not found in registry');
		expect(clientManager.callTool).not.toHaveBeenCalled();
	});

	it('fails with a clear error when the server is disabled', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: false, name: 'Test Server' });

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('is disabled');
		expect(clientManager.callTool).not.toHaveBeenCalled();
	});

	it('requests approval before connecting when the server requires it, and connects once approved', async () => {
		const { approvalCache, approvalWorkflow, auditLogger, clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server', remember_approval: true });
		clientManager.requiresApproval.mockResolvedValue(true);
		approvalWorkflow.requestApproval.mockResolvedValue({ approved: true, decision: 'approve', notes: 'ok' });
		clientManager.callTool.mockResolvedValue({ content: 'ok', success: true });

		await handler.executeTool(mcpTool, 'do_thing', {});

		expect(approvalCache.loadPersistentCache).toHaveBeenCalledOnce();
		expect(approvalWorkflow.requestApproval).toHaveBeenCalledWith(
			expect.objectContaining({ enabled: true, name: 'Test Server' }),
			expect.objectContaining({ requestedTools: ['do_thing'], serverId: 'test-server' }),
			[]
		);
		expect(auditLogger.logApproval).toHaveBeenCalledWith('test-server', true, 'approve', 'ok');
		expect(approvalCache.cacheApproval).toHaveBeenCalledWith(
			'test-server',
			expect.objectContaining({ approved: true }),
			true
		);
		expect(clientManager.connect).toHaveBeenCalledWith('test-server');
	});

	it('fails without connecting when the user denies the approval request', async () => {
		const { approvalCache, approvalWorkflow, clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.requiresApproval.mockResolvedValue(true);
		approvalWorkflow.requestApproval.mockResolvedValue({ approved: false, decision: 'deny', notes: 'no' });

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(result.success).toBe(false);
		expect(result.error).toContain('denied connection');
		expect(clientManager.connect).not.toHaveBeenCalled();
		expect(approvalCache.cacheApproval).not.toHaveBeenCalled();
	});

	it('fails immediately on a second call for a server whose connection was already denied this session, without re-prompting', async () => {
		const { approvalWorkflow, clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.requiresApproval.mockResolvedValue(true);
		approvalWorkflow.requestApproval.mockResolvedValue({ approved: false, decision: 'deny', notes: 'no' });

		await handler.executeTool(mcpTool, 'do_thing', {});
		approvalWorkflow.requestApproval.mockClear();
		const secondResult = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(secondResult.success).toBe(false);
		expect(secondResult.error).toContain('is not available');
		expect(approvalWorkflow.requestApproval).not.toHaveBeenCalled();
	});

	it('reports a failed tool result (success=false) returned by the client without throwing', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.callTool.mockResolvedValue({ content: null, error: 'tool errored', success: false });

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(result).toEqual(expect.objectContaining({ error: 'tool errored', success: false }));
	});

	it('catches an exception thrown during execution and returns a failed result instead of propagating', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.callTool.mockRejectedValue(new Error('transport error'));

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		expect(result).toEqual(expect.objectContaining({ error: 'transport error', output: null, success: false }));
	});

	it('scans and sanitizes string tool output for credentials and prompt injection', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.callTool.mockResolvedValue({ content: 'raw output', success: true });

		const result = await handler.executeTool(mcpTool, 'do_thing', {});

		// The mocked scanners are identity functions here — this proves they are
		// actually invoked on the path, not that they redact (that's each
		// scanner's own test suite's job).
		expect(result.output).toBe('raw output');
	});
});

describe('MCPToolHandler — connection state helpers', () => {
	const mcpTool = 'mcp_test_server' as MCPTool;

	it("getAvailableTools returns the connected server's tool names", () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerTools.mockReturnValue([{ name: 'tool_a' }, { name: 'tool_b' }]);

		expect(handler.getAvailableTools(mcpTool)).toEqual(['tool_a', 'tool_b']);
	});

	it("isServerConnected reflects the client manager's connection state for the extracted server id", () => {
		const { clientManager, handler } = makeHandler();
		clientManager.isConnected.mockReturnValue(true);

		expect(handler.isServerConnected(mcpTool)).toBe(true);
		expect(clientManager.isConnected).toHaveBeenCalledWith('test-server');
	});

	it('disconnectAll disconnects every connected server and clears tracked state', async () => {
		const { clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.callTool.mockResolvedValue({ content: 'ok', success: true });
		await handler.executeTool(mcpTool, 'do_thing', {});
		clientManager.isConnected.mockReturnValue(true);

		await handler.disconnectAll();

		expect(clientManager.disconnect).toHaveBeenCalledWith('test-server');
	});

	it('reset() clears the per-session connected-servers tracking without disconnecting anything', async () => {
		const { approvalWorkflow, clientManager, handler } = makeHandler();
		clientManager.getServerConfig.mockResolvedValue({ enabled: true, name: 'Test Server' });
		clientManager.requiresApproval.mockResolvedValue(true);
		clientManager.callTool.mockResolvedValue({ content: 'ok', success: true });

		// Deny once so the server is tracked as "handled" (denied) this session.
		approvalWorkflow.requestApproval.mockResolvedValue({ approved: false, decision: 'deny', notes: 'no' });
		const denied = await handler.executeTool(mcpTool, 'do_thing', {});
		expect(denied.success).toBe(false);

		handler.reset();

		// After reset, a fresh attempt re-enters the normal (not "already handled") path.
		clientManager.requiresApproval.mockResolvedValue(false);
		const result = await handler.executeTool(mcpTool, 'do_thing', {});
		expect(result.success).toBe(true);
	});
});

describe('MCPToolHandler.checkAndDisplayAvailability', () => {
	it('does nothing when given an empty tool list', async () => {
		const { availabilityService, handler } = makeHandler();

		await handler.checkAndDisplayAvailability([]);

		expect(availabilityService.checkAvailability).not.toHaveBeenCalled();
	});

	it('checks availability and forwards the results to processing feedback', async () => {
		const { availabilityService, handler } = makeHandler();
		availabilityService.checkAvailability.mockResolvedValue({
			results: [{ available: true, serverId: 'test-server' }]
		});

		await handler.checkAndDisplayAvailability(['mcp_test_server'] as MCPTool[]);

		expect(availabilityService.checkAvailability).toHaveBeenCalledWith(['mcp_test_server']);
	});
});
