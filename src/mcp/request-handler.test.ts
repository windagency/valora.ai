import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandExecutor } from 'cli/command-executor';
import type { CommandResult } from 'types/command.types';
import type { ToolCallArgs } from 'types/mcp.types';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ always: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
}));

const mockConfigLoad = vi.fn();
vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ load: mockConfigLoad }))
}));

// Wrapped with vi.fn(actual) rather than fully mocked: real rate-limiting is
// exercised for every other test, only the one dedicated rate-limit test
// overrides it — pre-exhausting the real bucket would be slow and brittle.
vi.mock('utils/rate-limiter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/rate-limiter')>();
	return {
		...actual,
		checkRateLimit: vi.fn(actual.checkRateLimit),
		getRateLimitStatus: vi.fn(actual.getRateLimitStatus)
	};
});

import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import { MCPRequestHandler } from './request-handler';

function makeCommandResult(overrides: Partial<CommandResult> = {}): CommandResult {
	return { duration_ms: 10, outputs: {}, stages: [], success: true, ...overrides };
}

describe('MCPRequestHandler.handleToolCall', () => {
	let mockExecute: ReturnType<typeof vi.fn>;
	let mockHasMCPSampling: ReturnType<typeof vi.fn>;
	let handler: MCPRequestHandler;

	beforeEach(() => {
		mockConfigLoad.mockReset();
		mockConfigLoad.mockResolvedValue({ providers: {} });
		vi.mocked(checkRateLimit).mockClear();
		vi.mocked(getRateLimitStatus).mockClear();

		mockExecute = vi.fn().mockResolvedValue(makeCommandResult());
		mockHasMCPSampling = vi.fn().mockReturnValue(false);
		handler = new MCPRequestHandler({
			execute: mockExecute,
			hasMCPSampling: mockHasMCPSampling
		} as unknown as CommandExecutor);
	});

	it('rejects oversized input without ever invoking the command executor', async () => {
		const hugeArgs: ToolCallArgs = { args: ['x'.repeat(11 * 1024 * 1024)] };

		const result = await handler.handleToolCall('plan', hugeArgs);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('Input validation failed');
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it('rejects the call when rate limited, without ever invoking the command executor', async () => {
		vi.mocked(checkRateLimit).mockReturnValueOnce(false);
		vi.mocked(getRateLimitStatus).mockReturnValueOnce({ allowed: false, remaining: 0, resetTime: Date.now() + 60_000 });

		const result = await handler.handleToolCall('plan', { sessionId: 'session-1' });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('Rate limit exceeded');
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it('executes the command and returns the primary output text on success', async () => {
		mockExecute.mockResolvedValue(makeCommandResult({ outputs: { result: 'Plan complete.' } }));

		const result = await handler.handleToolCall('plan', { sessionId: 'session-1' });

		expect(result.isError).toBe(false);
		expect(result.content[0]?.text).toBe('Plan complete.');
	});

	it("returns an isError result with the command's own error message when execution reports failure", async () => {
		mockExecute.mockResolvedValue(makeCommandResult({ error: 'stage validation failed', success: false }));

		const result = await handler.handleToolCall('plan', { sessionId: 'session-1' });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe('Command failed: stage validation failed');
	});

	it('returns an isError result naming the command and the thrown error message when execution throws', async () => {
		mockExecute.mockRejectedValue(new Error('boom'));

		const result = await handler.handleToolCall('plan', { sessionId: 'session-1' });

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe("Error executing command 'plan': boom");
	});

	it('formats a guided-completion result with the Cursor-specific metadata instead of the regular text formatter', async () => {
		mockExecute.mockResolvedValue(
			makeCommandResult({
				outputs: {
					guidedCompletion: {
						context: {},
						instruction: 'do it',
						systemPrompt: 'sys',
						userPrompt: 'user'
					},
					result: 'formatted prompt for cursor'
				}
			})
		);

		const result = await handler.handleToolCall('plan', { sessionId: 'session-1' });

		expect(result.isError).toBe(false);
		expect(result.content[0]?.text).toBe('formatted prompt for cursor');
		expect(result.metadata).toEqual({
			mode: 'guided_completion',
			provider: 'cursor',
			requiresManualProcessing: true,
			useCursorSubscription: true
		});
	});

	it("propagates provider, model, sessionId, and requestId into the executed command's flags", async () => {
		await handler.handleToolCall('plan', {
			model: 'claude-fable-5',
			provider: 'anthropic',
			requestId: 'req-1',
			sessionId: 'session-1'
		});

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({
				flags: expect.objectContaining({
					model: 'claude-fable-5',
					provider: 'anthropic',
					requestId: 'req-1',
					sessionId: 'session-1'
				})
			})
		);
	});

	it('sets needsSetup=true in flags when a non-Cursor provider has no configuration', async () => {
		mockConfigLoad.mockResolvedValue({ providers: {} });

		await handler.handleToolCall('plan', { provider: 'anthropic', sessionId: 'session-1' });

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ flags: expect.objectContaining({ needsSetup: true }) })
		);
	});

	it('does not set needsSetup when the requested provider is already configured', async () => {
		mockConfigLoad.mockResolvedValue({ providers: { anthropic: { apiKey: 'sk-ant-real' } } });

		await handler.handleToolCall('plan', { provider: 'anthropic', sessionId: 'session-1' });

		const flags = mockExecute.mock.calls[0]?.[1]?.flags as Record<string, unknown>;
		expect(flags['needsSetup']).toBeUndefined();
	});

	it('never requires setup for the Cursor provider (or when no provider is given, since Cursor is the default)', async () => {
		await handler.handleToolCall('plan', { sessionId: 'session-1' });

		const flags = mockExecute.mock.calls[0]?.[1]?.flags as Record<string, unknown>;
		expect(flags['needsSetup']).toBeUndefined();
		expect(mockConfigLoad).not.toHaveBeenCalled();
	});

	it('fails safe (needsSetup=true) when config loading throws', async () => {
		mockConfigLoad.mockRejectedValue(new Error('disk error'));

		await handler.handleToolCall('plan', { provider: 'anthropic', sessionId: 'session-1' });

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ flags: expect.objectContaining({ needsSetup: true }) })
		);
	});

	it('generates a requestId when the caller does not supply one', async () => {
		const args: ToolCallArgs = { sessionId: 'session-1' };

		await handler.handleToolCall('plan', args);

		expect(args.requestId).toBeTruthy();
	});
});
