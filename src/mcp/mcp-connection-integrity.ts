/**
 * MCP connection-config drift detection — a sibling check to
 * ToolIntegrityMonitor's tool-list fingerprinting (which only covers what a
 * server *exposes*, not what it's actually *launched with*). Reuses the same
 * generic content-fingerprint baseline store `checkPluginContentDrift` uses
 * for plugin rug-pull detection, keyed separately per server so it composes
 * with (doesn't collide with) the tool-list fingerprint's own key.
 */
import { getToolIntegrityMonitor, type IntegrityCheckResult } from 'security/tool-integrity-monitor';

import type { MCPConnectionConfig } from 'types/mcp-client.types';

export function checkMcpConnectionConfigDrift(serverId: string, connection: MCPConnectionConfig): IntegrityCheckResult {
	const fingerprint = JSON.stringify(connection);
	return getToolIntegrityMonitor().checkContentIntegrity(`mcp-connection:${serverId}`, fingerprint);
}
