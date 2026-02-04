/**
 * MCP Registry Types
 *
 * Types derived from the external-mcp.json registry file.
 * This ensures the MCPTool type stays in sync with the registry.
 */

import { createRequire } from 'module';

// Using createRequire for JSON outside src directory (ESM compatible)
const require = createRequire(import.meta.url);
const externalMcpRegistry = require('../../../external-mcp.json') as ExternalMCPRegistrySchema;

/**
 * Schema for the external MCP registry
 */
interface ExternalMCPRegistrySchema {
	schema_version: string;
	servers: ExternalMCPServerSchema[];
}

interface ExternalMCPServerSchema {
	description: string;
	enabled?: boolean;
	id: string;
	name: string;
	// ... other fields
}

/**
 * Known MCP server IDs from the registry
 * When adding a new MCP server, add its ID here and to external-mcp.json
 */
export type MCPServerId =
	| 'browserstack'
	| 'chrome-devtools'
	| 'context7'
	| 'deep-research'
	| 'elastic'
	| 'figma'
	| 'firebase'
	| 'gcloud'
	| 'github'
	| 'grafana'
	| 'mongodb'
	| 'playwright'
	| 'serena'
	| 'storybook'
	| 'terraform';

/**
 * Convert hyphenated server ID to underscore format for tool names
 * e.g., "chrome-devtools" -> "chrome_devtools"
 */
type HyphenToUnderscore<S extends string> = S extends `${infer L}-${infer R}` ? `${L}_${HyphenToUnderscore<R>}` : S;

/**
 * MCP Tool type derived from registry server IDs
 * Format: mcp_<server-id-with-underscores>
 * e.g., "mcp_playwright" | "mcp_chrome_devtools" | ...
 */
export type MCPTool = `mcp_${HyphenToUnderscore<MCPServerId>}`;

/**
 * All server IDs from the registry (runtime values)
 */
export const MCP_SERVER_IDS: MCPServerId[] = externalMcpRegistry.servers.map(
	(s: ExternalMCPServerSchema) => s.id as MCPServerId
);

/**
 * Map of server ID to MCP tool name
 */
export const SERVER_ID_TO_TOOL: Record<MCPServerId, MCPTool> = Object.fromEntries(
	externalMcpRegistry.servers.map((s: ExternalMCPServerSchema) => [s.id, `mcp_${s.id.replace(/-/g, '_')}` as MCPTool])
) as Record<MCPServerId, MCPTool>;

/**
 * Map of MCP tool name to server ID
 */
export const TOOL_TO_SERVER_ID: Record<MCPTool, MCPServerId> = Object.fromEntries(
	externalMcpRegistry.servers.map((s: ExternalMCPServerSchema) => [
		`mcp_${s.id.replace(/-/g, '_')}` as MCPTool,
		s.id as MCPServerId
	])
) as Record<MCPTool, MCPServerId>;

/**
 * Check if a string is a valid MCP tool name
 */
export function isValidMCPTool(tool: string): tool is MCPTool {
	return tool.startsWith('mcp_') && Object.values(SERVER_ID_TO_TOOL).includes(tool as MCPTool);
}

/**
 * Get server ID from MCP tool name
 * Returns undefined if not a valid MCP tool
 */
export function getServerIdFromTool(tool: string): MCPServerId | undefined {
	if (!tool.startsWith('mcp_')) return undefined;
	const serverId = tool.substring(4).replace(/_/g, '-');
	return MCP_SERVER_IDS.includes(serverId as MCPServerId) ? (serverId as MCPServerId) : undefined;
}

/**
 * Get MCP tool name from server ID
 */
export function getToolFromServerId(serverId: MCPServerId): MCPTool {
	return SERVER_ID_TO_TOOL[serverId];
}
