/**
 * External MCP Integrator
 *
 * Coordinates external MCP server connections during command execution.
 * Handles approval workflows and connection lifecycle.
 */

import type { MCPApprovalCacheService } from 'services/mcp-approval-cache.service';
import type { MCPAuditLoggerService } from 'services/mcp-audit-logger.service';
import type { MCPClientManagerService } from 'services/mcp-client-manager.service';
import type { ConnectedMCPServer, ExternalMCPRequirement, MCPAccessRequest } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';

import type { MCPApprovalWorkflow } from './mcp-approval-workflow';

/**
 * Result of MCP integration check
 */
export interface MCPIntegrationResult {
	/** Connected servers */
	connectedServers: ConnectedMCPServer[];
	/** Errors encountered during connection */
	errors: Array<{ error: string; serverId: string }>;
	/** Whether all required MCPs were connected successfully */
	success: boolean;
}

/**
 * External MCP Integrator
 *
 * Responsibilities:
 * - Check command MCP requirements
 * - Trigger approval workflows for required MCPs
 * - Connect to approved MCP servers
 * - Handle optional vs required MCPs
 */
export class ExternalMCPIntegrator {
	constructor(
		private clientManager: MCPClientManagerService,
		private approvalCache: MCPApprovalCacheService,
		private auditLogger: MCPAuditLoggerService,
		private approvalWorkflow: MCPApprovalWorkflow
	) {}

	/**
	 * Check and connect external MCPs required by a command
	 */
	async checkAndConnectMCPs(
		requirements: ExternalMCPRequirement[],
		requestedBy: string
	): Promise<MCPIntegrationResult> {
		const logger = getLogger();
		const connectedServers: ConnectedMCPServer[] = [];
		const errors: Array<{ error: string; serverId: string }> = [];

		if (!requirements || requirements.length === 0) {
			return { connectedServers, errors, success: true };
		}

		logger.info('Checking external MCP requirements', {
			requestedBy,
			requirementCount: requirements.length
		});

		// Load the approval cache
		await this.approvalCache.loadPersistentCache();

		for (const requirement of requirements) {
			const result = await this.processRequirement(requirement, requestedBy);

			if (result.server) {
				connectedServers.push(result.server);
			}

			if (result.error) {
				errors.push({ error: result.error, serverId: requirement.serverId });

				// If required and failed, stop processing
				if (!requirement.optional) {
					logger.error('Required external MCP connection failed', undefined, {
						error: result.error,
						serverId: requirement.serverId
					});
					return { connectedServers, errors, success: false };
				}
			}
		}

		return { connectedServers, errors, success: true };
	}

	/**
	 * Process a single MCP requirement
	 */
	private async processRequirement(
		requirement: ExternalMCPRequirement,
		requestedBy: string
	): Promise<{ error?: string; server?: ConnectedMCPServer }> {
		const logger = getLogger();
		const { serverId } = requirement;

		// Check if already connected
		if (this.clientManager.isConnected(serverId)) {
			logger.debug('Server already connected', { serverId });
			const server = this.clientManager.getConnectedServer(serverId);
			return { server: server ?? undefined };
		}

		// Get server configuration
		const config = await this.clientManager.getServerConfig(serverId);
		if (!config) {
			return { error: `Server not found in registry: ${serverId}` };
		}

		if (config.enabled === false) {
			return { error: `Server is disabled: ${serverId}` };
		}

		// Check if approval is required
		const needsApproval = await this.clientManager.requiresApproval(serverId);

		if (needsApproval) {
			// Get initial tool list by attempting a temporary connection
			// For security, we first need approval before connecting
			const accessRequest: MCPAccessRequest = {
				reason: requirement.reason,
				requestedBy,
				requestedTools: requirement.requiredTools,
				serverId,
				timestamp: new Date()
			};

			// Get tools list (might be empty if never connected before)
			const existingServer = this.clientManager.getConnectedServer(serverId);
			const availableTools = existingServer?.availableTools ?? [];

			// Request approval
			const approvalResult = await this.approvalWorkflow.requestApproval(config, accessRequest, availableTools);

			// Log the approval decision
			await this.auditLogger.logApproval(
				serverId,
				approvalResult.approved,
				approvalResult.decision,
				approvalResult.notes
			);

			if (!approvalResult.approved) {
				return { error: `User denied connection to ${config.name}` };
			}

			// Cache the approval
			await this.approvalCache.cacheApproval(serverId, approvalResult, config.remember_approval);
		}

		// Connect to the server
		try {
			const server = await this.clientManager.connect(serverId);

			// Display connection summary
			this.approvalWorkflow.displayConnectionSummary(serverId, config.name, server.availableTools.length, true);

			return { server };
		} catch (error) {
			const errorMessage = (error as Error).message;
			this.approvalWorkflow.displayError(`Failed to connect to ${config.name}`, errorMessage);
			return { error: errorMessage };
		}
	}

	/**
	 * Disconnect all connected servers
	 */
	async disconnectAll(): Promise<void> {
		const servers = this.clientManager.getConnectedServers();
		for (const server of servers) {
			await this.clientManager.disconnect(server.serverId);
			this.approvalWorkflow.displayDisconnectionSummary(server.config.name);
		}
	}

	/**
	 * Get all currently connected servers
	 */
	getConnectedServers(): ConnectedMCPServer[] {
		return this.clientManager.getConnectedServers();
	}

	/**
	 * Check if a specific server is connected
	 */
	isConnected(serverId: string): boolean {
		return this.clientManager.isConnected(serverId);
	}
}

/**
 * Singleton instance
 */
let instance: ExternalMCPIntegrator | null = null;

/**
 * Get the External MCP Integrator instance
 */
export function getExternalMCPIntegrator(
	clientManager: MCPClientManagerService,
	approvalCache: MCPApprovalCacheService,
	auditLogger: MCPAuditLoggerService,
	approvalWorkflow: MCPApprovalWorkflow
): ExternalMCPIntegrator {
	instance ??= new ExternalMCPIntegrator(clientManager, approvalCache, auditLogger, approvalWorkflow);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetExternalMCPIntegrator(): void {
	instance = null;
}
