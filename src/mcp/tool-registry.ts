/**
 * MCP Tool Registry - Manages MCP tool registration and setup
 *
 * MAINT-002: Large Files Need Splitting - This class now orchestrates
 * the use of specialized services for better separation of concerns.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';

import type { CommandLoader } from 'executor/command-loader';
import type { ToolCallArgs, ToolResult } from 'types/mcp.types';

import { LogQueryService } from 'observability/log-query.service';
import { MetricsQueryService } from 'observability/metrics-query.service';
import { LogQuerySchema, MetricsQuerySchema } from 'observability/observability.types';
import { getWorktreeObservabilityManager } from 'observability/worktree-observability-manager';
import { getLogger } from 'output/logger';

import { CommandDiscoveryService } from './command-discovery.service';
import { ToolMappingService } from './tool-mapping.service';

export class MCPToolRegistry {
	private commandDiscovery: CommandDiscoveryService;
	private mcpServer: McpServer;
	private toolMapping: ToolMappingService;

	constructor(
		mcpServer: McpServer,
		commandLoader: CommandLoader,
		handleToolCall: (commandName: string, args: ToolCallArgs) => Promise<ToolResult>
	) {
		this.mcpServer = mcpServer;
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

			// Register observability tools
			this.registerObservabilityTools();

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

	private registerObservabilityTools(): void {
		const mgr = getWorktreeObservabilityManager();

		this.mcpServer.registerTool(
			'query_worktree_logs',
			{
				description: 'Query log entries for an active worktree exploration session',
				inputSchema: z.object({
					query: LogQuerySchema.partial().optional(),
					worktreeId: z.string().describe('The worktree session ID to query')
				}),
				title: 'Query Worktree Logs'
			},
			(args: Record<string, unknown>) => {
				const worktreeId = args['worktreeId'] as string;
				const buf = mgr.getLogBuffer(worktreeId);
				if (!buf) {
					return {
						content: [{ text: `No active worktree found: ${worktreeId}`, type: 'text' as const }],
						isError: true
					};
				}
				const svc = new LogQueryService(buf);
				const results = svc.query((args['query'] as Record<string, unknown>) ?? {});
				return { content: [{ text: JSON.stringify(results, null, 2), type: 'text' as const }] };
			}
		);

		this.mcpServer.registerTool(
			'query_worktree_metrics',
			{
				description: 'Query metrics for an active worktree exploration session',
				inputSchema: z.object({
					query: MetricsQuerySchema.partial().optional(),
					worktreeId: z.string().describe('The worktree session ID to query')
				}),
				title: 'Query Worktree Metrics'
			},
			(args: Record<string, unknown>) => {
				const worktreeId = args['worktreeId'] as string;
				const reg = mgr.getMetricsRegistry(worktreeId);
				if (!reg) {
					return {
						content: [{ text: `No active worktree found: ${worktreeId}`, type: 'text' as const }],
						isError: true
					};
				}
				const svc = new MetricsQueryService(reg);
				const results = svc.query((args['query'] as Record<string, unknown>) ?? {});
				return { content: [{ text: JSON.stringify(results, null, 2), type: 'text' as const }] };
			}
		);
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
