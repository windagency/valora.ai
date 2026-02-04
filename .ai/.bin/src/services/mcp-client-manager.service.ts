/**
 * MCP Client Manager Service
 *
 * Manages connections to external MCP servers (Playwright, Fetch, etc.)
 * with lifecycle management, caching, and tool exposure.
 */

import type {
	ConnectedMCPServer,
	ExternalMCPRegistry,
	ExternalMCPServerConfig,
	ExternalMCPTool,
	ExternalMCPToolCallRequest,
	ExternalMCPToolCallResult
} from 'types/mcp-client.types';

// eslint-disable-next-line import/no-unresolved -- SDK exports work at runtime
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// eslint-disable-next-line import/no-unresolved -- SDK exports work at runtime
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { resolve } from 'path';
import { readFile } from 'utils/file-utils';

import type { MCPApprovalCacheService } from './mcp-approval-cache.service';
import type { MCPAuditLoggerService } from './mcp-audit-logger.service';

/**
 * Default path to the external MCP registry
 */
const DEFAULT_REGISTRY_PATH = '.ai/external-mcp.json';

/**
 * MCP Client Manager Service
 *
 * Responsibilities:
 * - Load external MCP configurations from registry
 * - Manage client connections using @modelcontextprotocol/sdk Client
 * - Handle connection lifecycle (connect/disconnect)
 * - Cache connected servers for session reuse
 * - Expose tools from connected servers
 */
export class MCPClientManagerService {
	private clients = new Map<string, Client>();
	private connectedServers = new Map<string, ConnectedMCPServer>();
	private registry: ExternalMCPRegistry | null = null;
	private registryLoaded = false;
	private transports = new Map<string, StdioClientTransport>();

	constructor(
		private approvalCache: MCPApprovalCacheService,
		private auditLogger: MCPAuditLoggerService,
		private registryPath: string = DEFAULT_REGISTRY_PATH
	) {}

	/**
	 * Load the external MCP registry from disk
	 */
	async loadRegistry(): Promise<ExternalMCPRegistry> {
		const logger = getLogger();

		if (this.registryLoaded && this.registry) {
			return this.registry;
		}

		const fullPath = resolve(process.cwd(), this.registryPath);

		if (!existsSync(fullPath)) {
			logger.warn(`External MCP registry not found at ${fullPath}`);
			this.registry = { schema_version: '1.0.0', servers: [] };
			this.registryLoaded = true;
			return this.registry;
		}

		try {
			const content = await readFile(fullPath);
			this.registry = JSON.parse(content) as ExternalMCPRegistry;
			this.registryLoaded = true;

			logger.debug('Loaded external MCP registry', {
				path: fullPath,
				schemaVersion: this.registry.schema_version,
				serverCount: this.registry.servers.length
			});

			return this.registry;
		} catch (error) {
			logger.error('Failed to load external MCP registry', error as Error, { path: fullPath });
			this.registry = { schema_version: '1.0.0', servers: [] };
			this.registryLoaded = true;
			return this.registry;
		}
	}

	/**
	 * Get all available servers from the registry
	 */
	async getAvailableServers(): Promise<ExternalMCPServerConfig[]> {
		const registry = await this.loadRegistry();
		return registry.servers.filter((s) => s.enabled !== false);
	}

	/**
	 * Get a specific server configuration by ID
	 */
	async getServerConfig(serverId: string): Promise<ExternalMCPServerConfig | null> {
		const registry = await this.loadRegistry();
		return registry.servers.find((s) => s.id === serverId) ?? null;
	}

	/**
	 * Check if a server is currently connected
	 */
	isConnected(serverId: string): boolean {
		const server = this.connectedServers.get(serverId);
		return server?.isConnected ?? false;
	}

	/**
	 * Get a connected server instance
	 */
	getConnectedServer(serverId: string): ConnectedMCPServer | null {
		return this.connectedServers.get(serverId) ?? null;
	}

	/**
	 * Get all connected servers
	 */
	getConnectedServers(): ConnectedMCPServer[] {
		return Array.from(this.connectedServers.values()).filter((s) => s.isConnected);
	}

	/**
	 * Connect to an external MCP server
	 */
	async connect(serverId: string): Promise<ConnectedMCPServer> {
		const logger = getLogger();

		// Check if already connected
		const existing = this.connectedServers.get(serverId);
		if (existing?.isConnected) {
			logger.debug('Server already connected', { serverId });
			return existing;
		}

		// Get server config
		const config = await this.getServerConfig(serverId);
		if (!config) {
			throw new Error(`Server not found in registry: ${serverId}`);
		}

		if (config.enabled === false) {
			throw new Error(`Server is disabled: ${serverId}`);
		}

		logger.info('Connecting to external MCP server', {
			connectionType: config.connection.type,
			name: config.name,
			serverId
		});

		try {
			const client = await this.createClient(config);
			const tools = await this.discoverTools(client, serverId);

			const connectedServer: ConnectedMCPServer = {
				availableTools: tools,
				config,
				connectedAt: new Date(),
				isConnected: true,
				serverId
			};

			this.connectedServers.set(serverId, connectedServer);

			await this.auditLogger.logConnection(serverId, true);

			logger.info('Connected to external MCP server', {
				name: config.name,
				serverId,
				toolCount: tools.length
			});

			return connectedServer;
		} catch (error) {
			await this.auditLogger.logConnection(serverId, false, (error as Error).message);
			throw error;
		}
	}

	/**
	 * Disconnect from an external MCP server
	 */
	async disconnect(serverId: string): Promise<void> {
		const logger = getLogger();
		const server = this.connectedServers.get(serverId);

		if (!server) {
			logger.debug('Server not connected, nothing to disconnect', { serverId });
			return;
		}

		logger.info('Disconnecting from external MCP server', { serverId });

		try {
			const transport = this.transports.get(serverId);
			if (transport) {
				await transport.close();
				this.transports.delete(serverId);
			}

			const client = this.clients.get(serverId);
			if (client) {
				await client.close();
				this.clients.delete(serverId);
			}

			server.isConnected = false;
			this.connectedServers.delete(serverId);

			await this.auditLogger.logDisconnection(serverId);

			logger.info('Disconnected from external MCP server', { serverId });
		} catch (error) {
			logger.error('Error disconnecting from MCP server', error as Error, { serverId });
			throw error;
		}
	}

	/**
	 * Disconnect from all connected servers
	 */
	async disconnectAll(): Promise<void> {
		const serverIds = Array.from(this.connectedServers.keys());
		await Promise.all(serverIds.map((id) => this.disconnect(id)));
	}

	/**
	 * Get all available tools from connected servers
	 */
	getAllTools(): ExternalMCPTool[] {
		const tools: ExternalMCPTool[] = [];
		for (const server of this.connectedServers.values()) {
			if (server.isConnected) {
				tools.push(...server.availableTools);
			}
		}
		return tools;
	}

	/**
	 * Get tools from a specific connected server
	 */
	getServerTools(serverId: string): ExternalMCPTool[] {
		const server = this.connectedServers.get(serverId);
		if (!server?.isConnected) {
			return [];
		}
		return server.availableTools;
	}

	/**
	 * Validate that a tool is allowed by security policy
	 */
	private validateToolAccess(server: ConnectedMCPServer, toolName: string): void {
		const blocklist = server.config.security.tool_blocklist ?? [];
		if (blocklist.includes(toolName)) {
			throw new Error(`Tool is blocked by security policy: ${toolName}`);
		}

		const allowlist = server.config.security.tool_allowlist ?? [];
		if (allowlist.length > 0 && !allowlist.includes(toolName)) {
			throw new Error(`Tool not in security allowlist: ${toolName}`);
		}
	}

	/**
	 * Call a tool on a connected external MCP server
	 */
	async callTool(request: ExternalMCPToolCallRequest): Promise<ExternalMCPToolCallResult> {
		const logger = getLogger();
		const startTime = Date.now();

		const client = this.clients.get(request.serverId);
		if (!client) {
			throw new Error(`Server not connected: ${request.serverId}`);
		}

		const server = this.connectedServers.get(request.serverId);
		if (!server) {
			throw new Error(`Server not found: ${request.serverId}`);
		}

		this.validateToolAccess(server, request.toolName);

		logger.debug('Calling external MCP tool', {
			requestId: request.requestId,
			serverId: request.serverId,
			toolName: request.toolName
		});

		try {
			const timeout = request.timeout_ms ?? server.config.security.max_execution_ms ?? 30000;

			const result = await Promise.race([
				client.callTool({ arguments: request.args, name: request.toolName }),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error(`Tool call timeout after ${timeout}ms`)), timeout)
				)
			]);

			const durationMs = Date.now() - startTime;

			await this.auditLogger.logToolCall(request.serverId, request.toolName, true, durationMs);

			return {
				content: result,
				duration_ms: durationMs,
				requestId: request.requestId,
				success: true
			};
		} catch (error) {
			const durationMs = Date.now() - startTime;

			await this.auditLogger.logToolCall(
				request.serverId,
				request.toolName,
				false,
				durationMs,
				(error as Error).message
			);

			return {
				content: null,
				duration_ms: durationMs,
				error: (error as Error).message,
				requestId: request.requestId,
				success: false
			};
		}
	}

	/**
	 * Check if approval is required for a server
	 */
	async requiresApproval(serverId: string): Promise<boolean> {
		const config = await this.getServerConfig(serverId);
		if (!config) {
			return true; // Unknown servers require approval
		}

		if (!config.requires_approval) {
			return false;
		}

		// Check if already approved in cache
		return !this.approvalCache.isApproved(serverId);
	}

	/**
	 * Create MCP client for a server
	 */
	private async createClient(config: ExternalMCPServerConfig): Promise<Client> {
		const logger = getLogger();

		if (config.connection.type !== 'stdio') {
			throw new Error(`Connection type not supported: ${config.connection.type}`);
		}

		if (!config.connection.command) {
			throw new Error('Command is required for stdio connection');
		}

		// Build environment, filtering out undefined values
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined) {
				env[key] = value;
			}
		}
		if (config.connection.env) {
			Object.assign(env, config.connection.env);
		}

		const transport = new StdioClientTransport({
			args: config.connection.args,
			command: config.connection.command,
			env
		});

		const client = new Client(
			{
				name: 'valora-mcp-client',
				version: '1.0.0'
			},
			{
				capabilities: {}
			}
		);

		await client.connect(transport);

		this.clients.set(config.id, client);
		this.transports.set(config.id, transport);

		logger.debug('Created MCP client', {
			command: config.connection.command,
			serverId: config.id
		});

		return client;
	}

	/**
	 * Discover available tools from a connected MCP server
	 */
	private async discoverTools(client: Client, serverId: string): Promise<ExternalMCPTool[]> {
		const logger = getLogger();

		try {
			const result = await client.listTools();
			const tools: ExternalMCPTool[] = result.tools.map((tool) => ({
				description: tool.description ?? '',
				inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
				name: tool.name,
				serverId
			}));

			logger.debug('Discovered tools from MCP server', {
				serverId,
				toolCount: tools.length,
				toolNames: tools.map((t) => t.name)
			});

			return tools;
		} catch (error) {
			logger.warn('Failed to discover tools from MCP server', {
				error: (error as Error).message,
				serverId
			});
			return [];
		}
	}
}

/**
 * Singleton instance
 */
let instance: MCPClientManagerService | null = null;

/**
 * Get the MCP Client Manager service instance
 */
export function getMCPClientManager(
	approvalCache: MCPApprovalCacheService,
	auditLogger: MCPAuditLoggerService,
	registryPath?: string
): MCPClientManagerService {
	instance ??= new MCPClientManagerService(approvalCache, auditLogger, registryPath);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPClientManager(): void {
	instance = null;
}
