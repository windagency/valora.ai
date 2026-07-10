import { describe, expect, it } from 'vitest';

import { EXTERNAL_MCP_SERVER_CONFIG_SCHEMA, MCP_CONNECTION_CONFIG_SCHEMA } from './mcp-server-config.schema';

describe('MCP_CONNECTION_CONFIG_SCHEMA', () => {
	it('accepts a minimal stdio connection', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'stdio', command: 'node', args: ['server.js'] });
		expect(result.success).toBe(true);
	});

	it('accepts a minimal sse connection', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'sse', url: 'https://example.com/mcp' });
		expect(result.success).toBe(true);
	});

	it('rejects an unknown connection type', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'carrier-pigeon', command: 'node' });
		expect(result.success).toBe(false);
	});

	it('rejects a non-string command', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'stdio', command: 42 });
		expect(result.success).toBe(false);
	});

	it('rejects a non-string-array args field', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'stdio', command: 'node', args: 'server.js' });
		expect(result.success).toBe(false);
	});

	it('rejects a non-object env field', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'stdio', command: 'node', env: 'FOO=bar' });
		expect(result.success).toBe(false);
	});

	it('rejects a non-string url field', () => {
		const result = MCP_CONNECTION_CONFIG_SCHEMA.safeParse({ type: 'sse', url: 12345 });
		expect(result.success).toBe(false);
	});
});

describe('EXTERNAL_MCP_SERVER_CONFIG_SCHEMA', () => {
	const validServer = {
		id: 'fetch-server',
		name: 'Fetch',
		description: 'Fetches URLs',
		connection: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-fetch'] },
		remember_approval: 'session',
		requires_approval: true,
		security: { audit_logging: true, capabilities: ['network_requests'], risk_level: 'medium' }
	};

	it('accepts a well-formed server config', () => {
		expect(EXTERNAL_MCP_SERVER_CONFIG_SCHEMA.safeParse(validServer).success).toBe(true);
	});

	it('rejects a config missing a required id', () => {
		const { id: _id, ...rest } = validServer;
		expect(EXTERNAL_MCP_SERVER_CONFIG_SCHEMA.safeParse(rest).success).toBe(false);
	});

	it('rejects a config with an invalid connection block', () => {
		const result = EXTERNAL_MCP_SERVER_CONFIG_SCHEMA.safeParse({ ...validServer, connection: { type: 'not-real' } });
		expect(result.success).toBe(false);
	});

	it('rejects a config with an invalid security.risk_level', () => {
		const result = EXTERNAL_MCP_SERVER_CONFIG_SCHEMA.safeParse({
			...validServer,
			security: { ...validServer.security, risk_level: 'apocalyptic' }
		});
		expect(result.success).toBe(false);
	});

	it('rejects a config with an unknown capability', () => {
		const result = EXTERNAL_MCP_SERVER_CONFIG_SCHEMA.safeParse({
			...validServer,
			security: { ...validServer.security, capabilities: ['mind_control'] }
		});
		expect(result.success).toBe(false);
	});
});
