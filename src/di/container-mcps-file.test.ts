/**
 * Focused tests for registerPluginMcpsFile's schema validation — a malformed
 * or malicious mcps.json entry (bad command/url/env shape) must be rejected
 * rather than flowing unchecked into the MCP server registry.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

const { mockRegisterGlobalPluginMcpServers } = vi.hoisted(() => ({
	mockRegisterGlobalPluginMcpServers: vi.fn()
}));

vi.mock('mcp/mcp-client-manager.service', () => ({
	MCPClientManagerService: vi.fn(),
	registerGlobalPluginMcpServers: mockRegisterGlobalPluginMcpServers
}));

import { registerPluginMcpsFile } from './container';

describe('registerPluginMcpsFile', () => {
	let tmpDir: string;
	let mcpsPath: string;

	beforeEach(() => {
		vi.clearAllMocks();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-mcps-file-'));
		mcpsPath = path.join(tmpDir, 'mcps.json');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	const validServer = {
		id: 'fetch-server',
		name: 'Fetch',
		description: 'Fetches URLs',
		connection: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-fetch'] },
		remember_approval: 'session',
		requires_approval: true,
		security: { audit_logging: true, capabilities: ['network_requests'], risk_level: 'medium' }
	};

	it('registers a well-formed server entry', () => {
		fs.writeFileSync(mcpsPath, JSON.stringify({ servers: [validServer] }), 'utf-8');

		registerPluginMcpsFile(mcpsPath);

		expect(mockRegisterGlobalPluginMcpServers).toHaveBeenCalledWith([validServer]);
	});

	it('skips a server entry with an invalid connection block and still registers the valid ones', () => {
		const malformed = { ...validServer, id: 'bad-server', connection: { type: 'not-a-real-type' } };
		fs.writeFileSync(mcpsPath, JSON.stringify({ servers: [validServer, malformed] }), 'utf-8');

		registerPluginMcpsFile(mcpsPath);

		expect(mockRegisterGlobalPluginMcpServers).toHaveBeenCalledWith([validServer]);
	});

	it('skips a server entry with a non-string command masquerading as a real config', () => {
		const malformed = { ...validServer, id: 'bad-command', connection: { type: 'stdio', command: { evil: true } } };
		fs.writeFileSync(mcpsPath, JSON.stringify({ servers: [malformed] }), 'utf-8');

		registerPluginMcpsFile(mcpsPath);

		expect(mockRegisterGlobalPluginMcpServers).toHaveBeenCalledWith([]);
	});

	it('registers an empty list when the file has no servers key', () => {
		fs.writeFileSync(mcpsPath, JSON.stringify({}), 'utf-8');

		registerPluginMcpsFile(mcpsPath);

		expect(mockRegisterGlobalPluginMcpServers).toHaveBeenCalledWith([]);
	});
});
