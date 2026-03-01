/**
 * MCP Context - Legacy global state (DEPRECATED)
 *
 * This module contained global state for backwards compatibility during
 * the transition to dependency injection. All code has been migrated to
 * use proper dependency injection with MCPSamplingService interface.
 *
 * These functions are no longer used and will be removed in a future version.
 *
 * @deprecated No longer used - dependency injection is now fully implemented
 */

import type { MCPServerInstance } from 'types/mcp.types';

let mcpServerInstance: MCPServerInstance | null = null;

/**
 * Set the global MCP server instance
 * @deprecated Use dependency injection with MCPSamplingService instead
 */
export function setMCPServer(server: MCPServerInstance): void {
	mcpServerInstance = server;
}

/**
 * Get the global MCP server instance
 * @deprecated Use dependency injection with MCPSamplingService instead
 */
export function getMCPServer(): MCPServerInstance | null {
	return mcpServerInstance;
}

/**
 * Check if MCP server is available
 * @deprecated Use dependency injection with MCPSamplingService instead
 */
export function hasMCPServer(): boolean {
	return mcpServerInstance !== null;
}
