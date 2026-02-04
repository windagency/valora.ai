/**
 * MCP Tool Handler
 *
 * Handles execution of MCP tools (mcp_*) from allowed_tools.
 * - Checks MCP availability before execution
 * - Triggers approval workflow on first use
 * - Executes tool calls via MCPClientManager
 * - Logs results to processing feedback and audit log
 */

import type { MCPApprovalCacheService } from 'services/mcp-approval-cache.service';
import type { MCPAuditLoggerService } from 'services/mcp-audit-logger.service';
import type { MCPAvailabilityService } from 'services/mcp-availability.service';
import type { MCPClientManagerService } from 'services/mcp-client-manager.service';
import type { ExternalMCPServerConfig, MCPAccessRequest } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';
import { getProcessingFeedback } from 'output/processing-feedback';
import { extractMCPServerId, type MCPTool } from 'types/command.types';

import type { MCPApprovalWorkflow } from '../cli/mcp-approval-workflow';

/**
 * Result of MCP tool execution
 */
export interface MCPToolExecutionResult {
	/** Tool execution duration in ms */
	durationMs: number;
	/** Error message if failed */
	error?: string;
	/** Tool output */
	output: unknown;
	/** Server ID */
	serverId: string;
	/** Whether execution succeeded */
	success: boolean;
	/** Tool name */
	toolName: string;
}

/**
 * MCP Tool Handler
 */
export class MCPToolHandler {
	/** Track which servers have been connected in this session */
	private connectedServers: Set<string> = new Set();

	constructor(
		private clientManager: MCPClientManagerService,
		private availabilityService: MCPAvailabilityService,
		private approvalCache: MCPApprovalCacheService,
		private auditLogger: MCPAuditLoggerService,
		private approvalWorkflow: MCPApprovalWorkflow
	) {}

	/**
	 * Check availability of MCP tools and display status
	 * Called at command start to show which MCPs are available
	 */
	async checkAndDisplayAvailability(mcpTools: MCPTool[]): Promise<void> {
		if (mcpTools.length === 0) return;

		const summary = await this.availabilityService.checkAvailability(mcpTools);
		const feedback = getProcessingFeedback();

		// Display MCP status in processing feedback
		feedback.showMCPStatus(summary.results);
	}

	/**
	 * Execute an MCP tool
	 * Handles connection, approval, and execution
	 */
	async executeTool(
		mcpTool: MCPTool,
		toolName: string,
		args: Record<string, unknown>
	): Promise<MCPToolExecutionResult> {
		const logger = getLogger();
		const feedback = getProcessingFeedback();
		const startTime = Date.now();

		// Extract server ID from tool name
		const serverId = extractMCPServerId(mcpTool);

		logger.debug('Executing MCP tool', { args, mcpTool, serverId, toolName });

		try {
			// Ensure server is connected (with approval if needed)
			await this.ensureServerConnected(serverId, toolName);

			// Execute the tool
			const result = await this.clientManager.callTool({
				args,
				requestId: `${serverId}-${toolName}-${Date.now()}`,
				serverId,
				toolName
			});

			const durationMs = Date.now() - startTime;

			// Show result in processing feedback
			feedback.showMCPToolCall(serverId, toolName, result.success, durationMs);

			return {
				durationMs,
				error: result.error,
				output: result.content,
				serverId,
				success: result.success,
				toolName
			};
		} catch (error) {
			const durationMs = Date.now() - startTime;
			const errorMessage = (error as Error).message;

			// Show error in processing feedback
			feedback.showMCPToolCall(serverId, toolName, false, durationMs);

			logger.error(`MCP tool execution failed: ${toolName}`, error as Error, { serverId });

			return {
				durationMs,
				error: errorMessage,
				output: null,
				serverId,
				success: false,
				toolName
			};
		}
	}

	/**
	 * Ensure a server is connected, handling approval if needed
	 */
	private async ensureServerConnected(serverId: string, toolName: string): Promise<void> {
		const logger = getLogger();

		// Check if already connected
		if (this.clientManager.isConnected(serverId)) {
			return;
		}

		// Check if we've already handled this server in this session
		if (this.connectedServers.has(serverId)) {
			// Already tried to connect, must have failed or been denied
			throw new Error(`Server ${serverId} is not available`);
		}

		// Get server configuration
		const config = await this.clientManager.getServerConfig(serverId);
		if (!config) {
			throw new Error(`MCP server not found in registry: ${serverId}`);
		}

		if (config.enabled === false) {
			throw new Error(`MCP server is disabled: ${serverId}`);
		}

		// Check if approval is required
		const needsApproval = await this.clientManager.requiresApproval(serverId);

		if (needsApproval) {
			const approved = await this.requestApproval(serverId, config, toolName);
			if (!approved) {
				this.connectedServers.add(serverId); // Mark as handled (denied)
				throw new Error(`User denied connection to MCP server: ${serverId}`);
			}
		}

		// Connect to the server
		logger.info(`Connecting to MCP server: ${serverId}`);
		await this.clientManager.connect(serverId);
		this.connectedServers.add(serverId);

		// Display connection summary
		const server = this.clientManager.getConnectedServer(serverId);
		this.approvalWorkflow.displayConnectionSummary(serverId, config.name, server?.availableTools.length ?? 0, true);
	}

	/**
	 * Request user approval for MCP server connection
	 */
	private async requestApproval(serverId: string, config: ExternalMCPServerConfig, toolName: string): Promise<boolean> {
		// Load persistent cache
		await this.approvalCache.loadPersistentCache();

		// Create access request
		const accessRequest: MCPAccessRequest = {
			reason: `Tool call: ${toolName}`,
			requestedBy: 'MCP Tool Handler',
			requestedTools: [toolName],
			serverId,
			timestamp: new Date()
		};

		// Get available tools (empty if not yet connected)
		const availableTools = this.clientManager.getServerTools(serverId);

		// Request approval through workflow
		const result = await this.approvalWorkflow.requestApproval(config, accessRequest, availableTools);

		// Log the decision
		await this.auditLogger.logApproval(serverId, result.approved, result.decision, result.notes);

		// Cache if approved
		if (result.approved) {
			await this.approvalCache.cacheApproval(serverId, result, config.remember_approval);
		}

		return result.approved;
	}

	/**
	 * Get list of available tools from a connected MCP server
	 */
	getAvailableTools(mcpTool: MCPTool): string[] {
		const serverId = extractMCPServerId(mcpTool);
		const tools = this.clientManager.getServerTools(serverId);
		return tools.map((t) => t.name);
	}

	/**
	 * Check if a server is currently connected
	 */
	isServerConnected(mcpTool: MCPTool): boolean {
		const serverId = extractMCPServerId(mcpTool);
		return this.clientManager.isConnected(serverId);
	}

	/**
	 * Disconnect all connected servers
	 */
	async disconnectAll(): Promise<void> {
		for (const serverId of this.connectedServers) {
			if (this.clientManager.isConnected(serverId)) {
				await this.clientManager.disconnect(serverId);
			}
		}
		this.connectedServers.clear();
	}

	/**
	 * Reset state for new command execution
	 */
	reset(): void {
		this.connectedServers.clear();
	}
}

/**
 * Singleton instance
 */
let instance: MCPToolHandler | null = null;

/**
 * Get the MCP Tool Handler instance
 */
export function getMCPToolHandler(
	clientManager: MCPClientManagerService,
	availabilityService: MCPAvailabilityService,
	approvalCache: MCPApprovalCacheService,
	auditLogger: MCPAuditLoggerService,
	approvalWorkflow: MCPApprovalWorkflow
): MCPToolHandler {
	instance ??= new MCPToolHandler(clientManager, availabilityService, approvalCache, auditLogger, approvalWorkflow);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPToolHandler(): void {
	instance = null;
}
