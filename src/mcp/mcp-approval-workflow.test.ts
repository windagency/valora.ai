import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExternalMCPServerConfig, ExternalMCPTool, MCPAccessRequest } from 'types/mcp-client.types';

const mockPrompt = vi.fn();
vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({ prompt: mockPrompt })
}));

vi.mock('output/console-output', () => ({
	getConsoleOutput: () => ({
		blank: vi.fn(),
		bold: vi.fn(),
		dim: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		print: vi.fn(),
		success: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		cyan: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	})
}));

vi.mock('output/markdown', () => ({
	getRenderer: () => ({ box: (content: string) => content })
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import { MCPApprovalWorkflow } from './mcp-approval-workflow';

function makeServerConfig(overrides: Partial<ExternalMCPServerConfig> = {}): ExternalMCPServerConfig {
	return {
		connection: { type: 'stdio' },
		description: 'A test MCP server',
		id: 'test-server',
		name: 'Test Server',
		remember_approval: 'always_ask',
		requires_approval: true,
		security: { audit_logging: true, capabilities: [], risk_level: 'low' },
		...overrides
	};
}

function makeAccessRequest(overrides: Partial<MCPAccessRequest> = {}): MCPAccessRequest {
	return {
		reason: 'Testing',
		requestedBy: 'test-agent',
		serverId: 'test-server',
		timestamp: new Date(),
		...overrides
	};
}

function makeTool(overrides: Partial<ExternalMCPTool> = {}): ExternalMCPTool {
	return {
		description: 'A test tool',
		inputSchema: {},
		name: 'test_tool',
		serverId: 'test-server',
		...overrides
	};
}

describe('MCPApprovalWorkflow', () => {
	let workflow: MCPApprovalWorkflow;

	beforeEach(() => {
		mockPrompt.mockReset();
		workflow = new MCPApprovalWorkflow();
	});

	describe('requestApproval — decision semantics', () => {
		it('returns approved: false when the user chooses Deny', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'deny' });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), [makeTool()]);

			expect(result).toMatchObject({ approved: false, decision: 'deny', remember: false });
		});

		it('returns approved: true, remember: true when the user chooses Approve', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'approve' });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), [makeTool()]);

			expect(result).toMatchObject({ approved: true, decision: 'approve', remember: true });
		});

		it('returns approved: true, remember: false when the user chooses Session', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'session' });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), [makeTool()]);

			expect(result).toMatchObject({ approved: true, decision: 'session', remember: false });
		});

		it('never returns approved: true for a Deny decision even if the caller mishandles remember', async () => {
			// Regression guard: approve/deny must never be derived from `remember` —
			// only `decision === 'deny'` should short-circuit to a denial.
			mockPrompt.mockResolvedValueOnce({ decision: 'deny' });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), [makeTool()]);

			expect(result.approved).toBe(false);
		});
	});

	describe('requestApproval — configure flow (handleConfigureFlow)', () => {
		it('returns exactly the tools the user selected — not more, not fewer', async () => {
			const tools = [makeTool({ name: 'tool_a' }), makeTool({ name: 'tool_b' }), makeTool({ name: 'tool_c' })];
			mockPrompt
				.mockResolvedValueOnce({ decision: 'configure' })
				.mockResolvedValueOnce({ allowedTools: ['tool_a', 'tool_c'] })
				.mockResolvedValueOnce({ remember: false });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), tools);

			expect(result.allowedTools).toEqual(['tool_a', 'tool_c']);
			expect(result.allowedTools).not.toContain('tool_b');
			expect(result).toMatchObject({ approved: true, decision: 'configure' });
		});

		it('denies the connection when the user selects zero tools in configure mode', async () => {
			const tools = [makeTool({ name: 'tool_a' })];
			mockPrompt.mockResolvedValueOnce({ decision: 'configure' }).mockResolvedValueOnce({ allowedTools: [] });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), tools);

			expect(result).toMatchObject({ approved: false, decision: 'deny' });
		});

		it('denies immediately when configure is chosen but no tools are available at all', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'configure' });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), []);

			expect(result).toMatchObject({ approved: false, decision: 'deny' });
			// No further prompts (tool-selection, remember) should have been issued.
			expect(mockPrompt).toHaveBeenCalledTimes(1);
		});

		it('propagates the user’s "remember this configuration" choice into the result', async () => {
			mockPrompt
				.mockResolvedValueOnce({ decision: 'configure' })
				.mockResolvedValueOnce({ allowedTools: ['tool_a'] })
				.mockResolvedValueOnce({ remember: true });

			const result = await workflow.requestApproval(makeServerConfig(), makeAccessRequest(), [
				makeTool({ name: 'tool_a' })
			]);

			expect(result.remember).toBe(true);
		});
	});

	describe('displayConnectionSummary / displayDisconnectionSummary', () => {
		it('does not throw for a successful connection summary', () => {
			expect(() => workflow.displayConnectionSummary('id', 'Test Server', 3, true)).not.toThrow();
		});

		it('does not throw for a failed connection summary', () => {
			expect(() => workflow.displayConnectionSummary('id', 'Test Server', 0, false)).not.toThrow();
		});
	});
});
