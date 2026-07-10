/**
 * MCPAuditLoggerService must not persist raw credential material that leaks
 * into an `error` string — e.g. a stdio MCP server whose `connection.env`
 * embeds a secret, failing to spawn with that secret echoed in the error
 * message. `writeEntry` is the single choke point for both the in-memory log
 * and the persisted `.jsonl` file, so redacting there closes every call site
 * (`logConnection`/`logToolCall`/`logError`) at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MCPAuditLoggerService, resetMCPAuditLogger } from './mcp-audit-logger.service';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

describe('MCPAuditLoggerService — credential redaction', () => {
	let service: MCPAuditLoggerService;

	beforeEach(() => {
		resetMCPAuditLogger();
		service = new MCPAuditLoggerService('', false);
	});

	afterEach(() => {
		resetMCPAuditLogger();
	});

	it("redacts a credential leaked into logConnection's error message", async () => {
		await service.logConnection('server-a', false, 'spawn failed: AKIAABCDEFGHIJKLMNOP is invalid');

		const [entry] = service.getRecentEntries();
		expect(entry?.error).not.toContain('AKIAABCDEFGHIJKLMNOP');
	});

	it("redacts a credential leaked into logToolCall's error message", async () => {
		await service.logToolCall('server-a', 'navigate', false, 10, 'token=ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD');

		const [entry] = service.getRecentEntries();
		expect(entry?.error).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
	});

	it("redacts a credential leaked into logError's error message", async () => {
		await service.logError('server-a', 'connection refused, key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');

		const [entry] = service.getRecentEntries();
		expect(entry?.error).not.toContain('sk-ant-api03');
	});

	it('leaves an ordinary error message untouched', async () => {
		await service.logError('server-a', 'connection refused: ECONNREFUSED');

		const [entry] = service.getRecentEntries();
		expect(entry?.error).toBe('connection refused: ECONNREFUSED');
	});
});
