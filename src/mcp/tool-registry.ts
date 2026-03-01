/**
 * MCP Tool Registry - Manages MCP tool registration and setup
 *
 * MAINT-002: Large Files Need Splitting - This class now orchestrates
 * the use of specialized services for better separation of concerns.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommandLoader } from 'executor/command-loader';
import type { ToolCallArgs, ToolResult } from 'types/mcp.types';

import { getLogger } from 'output/logger';

import { CommandDiscoveryService } from './command-discovery.service';
import { ToolMappingService } from './tool-mapping.service';

export class MCPToolRegistry {
	private commandDiscovery: CommandDiscoveryService;
	private toolMapping: ToolMappingService;

	constructor(
		mcpServer: McpServer,
		commandLoader: CommandLoader,
		handleToolCall: (commandName: string, args: ToolCallArgs) => Promise<ToolResult>
	) {
		this.commandDiscovery = new CommandDiscoveryService(commandLoader);
		this.toolMapping = new ToolMappingService(mcpServer, handleToolCall);
	}

	/**
	 * Register all available commands as MCP tools
	 */
	async setupTools(): Promise<void> {
		const logger = getLogger();
		logger.debug('Setting up MCP tools');

		try {
			// Discover all available commands
			const commands = await this.commandDiscovery.discoverCommands();

			// Map commands to MCP tools and register them
			const { failCount, successCount } = this.toolMapping.mapToMCPTools(commands);

			logger.info('MCP tools registration complete', {
				failed: failCount,
				successful: successCount,
				total: commands.length
			});
		} catch (error) {
			logger.error('Failed to setup MCP tools', error as Error);
			throw error;
		}
	}

	/**
	 * Get the command discovery service for external use
	 */
	getCommandDiscovery(): CommandDiscoveryService {
		return this.commandDiscovery;
	}

	/**
	 * Get the tool mapping service for external use
	 */
	getToolMapping(): ToolMappingService {
		return this.toolMapping;
	}
}
