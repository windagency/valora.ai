/**
 * Tool Mapping Service - Maps command definitions to MCP tools
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CommandDefinition } from 'types/command.types';
import type { ToolCallArgs, ToolResult } from 'types/mcp.types';

import { getLogger } from 'output/logger';
import { z } from 'zod';

export interface MCPTool {
	description: string;
	handler: (args: ToolCallArgs) => Promise<ToolResult>;
	inputSchema: z.ZodSchema;
	name: string;
	title: string;
}

export class ToolMappingService {
	constructor(
		private mcpServer: McpServer,
		private handleToolCall: (commandName: string, args: ToolCallArgs) => Promise<ToolResult>
	) {}

	/**
	 * Map command definitions to MCP tools and register them
	 */
	mapToMCPTools(commands: CommandDefinition[]): { failCount: number; successCount: number } {
		const logger = getLogger();

		const registrationPromises = commands.map((command) => {
			try {
				const toolName = `ai_${command.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;

				// Create MCP tool definition
				const tool: MCPTool = {
					description: command.description,
					handler: async (args) => {
						return this.handleToolCall(command.name, args as ToolCallArgs);
					},
					inputSchema: z.object({
						args: z.array(z.string()).optional().describe('Command arguments'),
						model: z.string().optional().describe('Override AI model (e.g., claude-sonnet-4.5, gpt-5)'),
						provider: z.string().optional().describe('Override LLM provider (cursor, anthropic, openai, google)'),
						sessionId: z.string().optional().describe('Use specific session ID')
					}),
					name: toolName,
					title: command.name
				};

				// Register the tool with MCP server
				this.registerMCPTool(tool);

				logger.debug(`Registered MCP tool: ${toolName}`, {
					command: command.name,
					description: command.description
				});

				return { success: true };
			} catch (error) {
				logger.warn(`Failed to register tool for command: ${command.name}`, {
					error: (error as Error).message
				});
				return { success: false };
			}
		});

		const { failCount, successCount } = registrationPromises.reduce(
			(acc, result) => ({
				failCount: acc.failCount + (result.success ? 0 : 1),
				successCount: acc.successCount + (result.success ? 1 : 0)
			}),
			{ failCount: 0, successCount: 0 }
		);

		return { failCount, successCount };
	}

	/**
	 * Register a single MCP tool with the server
	 */
	private registerMCPTool(tool: MCPTool): void {
		this.mcpServer.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: tool.inputSchema,
				title: tool.title
			},
			async (args) => {
				const result = await tool.handler(args as unknown as ToolCallArgs);
				return result as unknown as CallToolResult;
			}
		);
	}

	/**
	 * Create tool definition without registering (for testing/validation)
	 */
	createToolDefinition(command: CommandDefinition): MCPTool {
		const toolName = `ai_${command.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;

		return {
			description: command.description,
			handler: async (args) => {
				return this.handleToolCall(command.name, args as ToolCallArgs);
			},
			inputSchema: z.object({
				args: z.array(z.string()).optional().describe('Command arguments'),
				model: z.string().optional().describe('Override AI model (e.g., claude-sonnet-4.5, gpt-5)'),
				provider: z.string().optional().describe('Override LLM provider (cursor, anthropic, openai, google)'),
				sessionId: z.string().optional().describe('Use specific session ID')
			}),
			name: toolName,
			title: command.name
		};
	}
}
