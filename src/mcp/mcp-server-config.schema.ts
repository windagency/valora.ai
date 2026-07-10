/**
 * Zod validation for external MCP server configuration (`mcps.json` and the
 * external MCP registry file). Previously these were read with a bare `as`
 * cast — a malicious or malformed config could declare an arbitrary `command`/
 * `url`/`env` and it would flow straight into `connect()` unchecked.
 */

import { z } from 'zod';

const MCP_CONNECTION_TYPE_SCHEMA = z.enum(['sse', 'stdio', 'websocket']);

const MCP_RISK_LEVEL_SCHEMA = z.enum(['critical', 'high', 'low', 'medium']);

const MCP_APPROVAL_MEMORY_SCHEMA = z.enum(['always_ask', 'persistent', 'session']);

const MCP_CAPABILITY_SCHEMA = z.enum([
	'browser_automation',
	'code_execution',
	'database_access',
	'file_system',
	'network_requests',
	'process_spawn',
	'screen_capture',
	'system_access'
]);

export const MCP_CONNECTION_CONFIG_SCHEMA = z.object({
	args: z.array(z.string()).optional(),
	command: z.string().optional(),
	env: z.record(z.string()).optional(),
	headers: z.record(z.string()).optional(),
	type: MCP_CONNECTION_TYPE_SCHEMA,
	url: z.string().optional(),
	workingDirectory: z.string().optional()
});

const MCP_SECURITY_CONFIG_SCHEMA = z.object({
	audit_logging: z.boolean(),
	capabilities: z.array(MCP_CAPABILITY_SCHEMA),
	max_execution_ms: z.number().optional(),
	risk_level: MCP_RISK_LEVEL_SCHEMA,
	tool_allowlist: z.array(z.string()).optional(),
	tool_blocklist: z.array(z.string()).optional()
});

export const EXTERNAL_MCP_SERVER_CONFIG_SCHEMA = z.object({
	connection: MCP_CONNECTION_CONFIG_SCHEMA,
	description: z.string(),
	enabled: z.boolean().optional(),
	id: z.string().min(1),
	name: z.string(),
	remember_approval: MCP_APPROVAL_MEMORY_SCHEMA,
	requires_approval: z.boolean(),
	security: MCP_SECURITY_CONFIG_SCHEMA,
	tags: z.array(z.string()).optional(),
	version: z.string().optional()
});
