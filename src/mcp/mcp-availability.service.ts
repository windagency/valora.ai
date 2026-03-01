/**
 * MCP Availability Service
 *
 * Checks if external MCP servers are installed, configured, and ready to use.
 * Used by the orchestrator to display MCP status in processing feedback.
 */

import type { ExternalMCPServerConfig } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';

import type { MCPClientManagerService } from './mcp-client-manager.service';

/**
 * MCP availability status
 */
export type MCPAvailabilityStatus = 'connection_failed' | 'disabled' | 'not_configured' | 'not_installed' | 'ready';

/**
 * Result of checking MCP availability
 */
export interface MCPAvailabilityResult {
	/** Server ID */
	serverId: string;
	/** Server display name */
	name: string;
	/** Availability status */
	status: MCPAvailabilityStatus;
	/** Number of tools available (if ready) */
	toolCount?: number;
	/** Error message (if not ready) */
	error?: string;
	/** Risk level from config */
	riskLevel?: string;
}

/**
 * Summary of MCP availability check
 */
export interface MCPAvailabilitySummary {
	/** All checked MCPs */
	results: MCPAvailabilityResult[];
	/** Count of ready MCPs */
	readyCount: number;
	/** Count of unavailable MCPs */
	unavailableCount: number;
	/** Server IDs that are ready */
	readyServers: string[];
}

/**
 * MCP Availability Service
 */
export class MCPAvailabilityService {
	constructor(private clientManager: MCPClientManagerService) {}

	/**
	 * Check availability of specific MCP servers by tool names
	 * @param mcpTools - Array of MCP tool names (e.g., ['mcp_playwright', 'mcp_github'])
	 */
	async checkAvailability(mcpTools: string[]): Promise<MCPAvailabilitySummary> {
		const logger = getLogger();
		const results: MCPAvailabilityResult[] = [];

		// Load registry if not already loaded
		await this.clientManager.loadRegistry();

		for (const tool of mcpTools) {
			// Extract server ID from tool name (mcp_playwright -> playwright)
			const serverId = this.extractServerId(tool);

			if (!serverId) {
				logger.warn(`Invalid MCP tool name: ${tool}`);
				continue;
			}

			const result = await this.checkServerAvailability(serverId);
			results.push(result);
		}

		const readyResults = results.filter((r) => r.status === 'ready');

		return {
			readyCount: readyResults.length,
			readyServers: readyResults.map((r) => r.serverId),
			results,
			unavailableCount: results.length - readyResults.length
		};
	}

	/**
	 * Check availability of a single MCP server
	 */
	async checkServerAvailability(serverId: string): Promise<MCPAvailabilityResult> {
		const logger = getLogger();

		// Get server configuration
		const config = await this.clientManager.getServerConfig(serverId);

		if (!config) {
			return {
				error: 'Server not found in registry',
				name: serverId,
				serverId,
				status: 'not_installed'
			};
		}

		// Check if disabled
		if (config.enabled === false) {
			return {
				name: config.name,
				riskLevel: config.security.risk_level,
				serverId,
				status: 'disabled'
			};
		}

		// Check if already connected
		if (this.clientManager.isConnected(serverId)) {
			const server = this.clientManager.getConnectedServer(serverId);
			return {
				name: config.name,
				riskLevel: config.security.risk_level,
				serverId,
				status: 'ready',
				toolCount: server?.availableTools.length ?? 0
			};
		}

		// Check if configuration is valid
		const configCheck = this.checkConfiguration(config);
		if (!configCheck.valid) {
			return {
				error: configCheck.error,
				name: config.name,
				riskLevel: config.security.risk_level,
				serverId,
				status: 'not_configured'
			};
		}

		// Try a quick connection test (optional - can be expensive)
		// For now, assume configured means ready
		logger.debug(`MCP server ${serverId} appears configured and ready`);

		return {
			name: config.name,
			riskLevel: config.security.risk_level,
			serverId,
			status: 'ready'
		};
	}

	/**
	 * Check if server configuration is valid
	 */
	private checkConfiguration(config: ExternalMCPServerConfig): { error?: string; valid: boolean } {
		// Check connection type
		if (config.connection.type !== 'stdio') {
			return { error: `Unsupported connection type: ${config.connection.type}`, valid: false };
		}

		// Check command exists
		if (!config.connection.command) {
			return { error: 'No command specified', valid: false };
		}

		// For now, assume if we have a command, it's configured
		// In the future, could check if command exists on PATH, env vars set, etc.
		return { valid: true };
	}

	/**
	 * Extract server ID from MCP tool name
	 * mcp_playwright -> playwright
	 * mcp_chrome_devtools -> chrome-devtools
	 */
	private extractServerId(tool: string): null | string {
		if (!tool.startsWith('mcp_')) {
			return null;
		}

		// Remove mcp_ prefix and convert underscores to hyphens
		return tool.substring(4).replace(/_/g, '-');
	}

	/**
	 * Get status display string for processing feedback
	 */
	getStatusDisplay(result: MCPAvailabilityResult): string {
		switch (result.status) {
			case 'connection_failed':
				return `connection failed${result.error ? `: ${result.error}` : ''}`;
			case 'disabled':
				return 'disabled';
			case 'not_configured':
				return `not configured${result.error ? `: ${result.error}` : ''}`;
			case 'not_installed':
				return 'not installed';
			case 'ready':
				return result.toolCount !== undefined ? `ready (${result.toolCount} tools)` : 'ready';
			default:
				return 'unknown';
		}
	}

	/**
	 * Get status icon for processing feedback
	 */
	getStatusIcon(status: MCPAvailabilityStatus): string {
		switch (status) {
			case 'disabled':
				return '○';
			case 'ready':
				return '✓';
			default:
				return '✗';
		}
	}
}

/**
 * Singleton instance
 */
let instance: MCPAvailabilityService | null = null;

/**
 * Get the MCP Availability Service instance
 */
export function getMCPAvailabilityService(clientManager: MCPClientManagerService): MCPAvailabilityService {
	instance ??= new MCPAvailabilityService(clientManager);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPAvailabilityService(): void {
	instance = null;
}
