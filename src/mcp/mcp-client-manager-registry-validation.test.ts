/**
 * Focused tests for MCPClientManagerService.loadRegistry()'s schema
 * validation — a malformed registry entry (bad command/url/env shape) must be
 * rejected rather than flowing unchecked into connect().
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
}));

import { MCPApprovalCacheService } from './mcp-approval-cache.service';
import { MCPAuditLoggerService } from './mcp-audit-logger.service';
import { MCPClientManagerService } from './mcp-client-manager.service';

const validServer = {
	id: 'fetch-server',
	name: 'Fetch',
	description: 'Fetches URLs',
	connection: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-fetch'] },
	remember_approval: 'session',
	requires_approval: true,
	security: { audit_logging: true, capabilities: ['network_requests'], risk_level: 'medium' }
};

describe('MCPClientManagerService.loadRegistry() schema validation', () => {
	let tmpDir: string;
	let registryPath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-mcp-registry-'));
		registryPath = path.join(tmpDir, 'external-mcp.json');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads well-formed servers from the registry', async () => {
		fs.writeFileSync(registryPath, JSON.stringify({ schema_version: '1.0.0', servers: [validServer] }), 'utf-8');
		const manager = new MCPClientManagerService(
			new MCPApprovalCacheService(),
			new MCPAuditLoggerService(),
			registryPath
		);

		const registry = await manager.loadRegistry();

		expect(registry.servers).toEqual([validServer]);
	});

	it('skips a registry entry with an invalid connection block', async () => {
		const malformed = { ...validServer, id: 'bad-server', connection: { type: 'not-a-real-type' } };
		fs.writeFileSync(
			registryPath,
			JSON.stringify({ schema_version: '1.0.0', servers: [validServer, malformed] }),
			'utf-8'
		);
		const manager = new MCPClientManagerService(
			new MCPApprovalCacheService(),
			new MCPAuditLoggerService(),
			registryPath
		);

		const registry = await manager.loadRegistry();

		expect(registry.servers).toEqual([validServer]);
	});

	it('skips a registry entry with a non-string command', async () => {
		const malformed = { ...validServer, id: 'bad-command', connection: { type: 'stdio', command: { evil: true } } };
		fs.writeFileSync(registryPath, JSON.stringify({ schema_version: '1.0.0', servers: [malformed] }), 'utf-8');
		const manager = new MCPClientManagerService(
			new MCPApprovalCacheService(),
			new MCPAuditLoggerService(),
			registryPath
		);

		const registry = await manager.loadRegistry();

		expect(registry.servers).toEqual([]);
	});
});
