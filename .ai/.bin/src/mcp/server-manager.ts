/**
 * MCP Server Manager
 *
 * Manages the MCP server lifecycle and connection handling.
 * Separated from MCPOrchestratorServer for better modularity.
 */

import type { Logger } from 'output/logger';

import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
// eslint-disable-next-line import/no-unresolved -- .js extensions required for ESM compatibility
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/no-unresolved -- .js extensions required for ESM compatibility
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
// eslint-disable-next-line import/no-unresolved -- .js extensions required for ESM compatibility
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_ID } from 'config/constants';
import Fastify, { type FastifyInstance } from 'fastify';

export class MCPServerManager {
	private httpServer: FastifyInstance | null = null;
	private mcpServer: McpServer;
	private transport: null | SSEServerTransport | StdioServerTransport = null;

	constructor(
		private logger: Logger,
		version: string
	) {
		this.mcpServer = new McpServer({
			name: MCP_ID,
			version
		});
	}

	/**
	 * Get the underlying MCP server instance
	 */
	getServer(): McpServer {
		return this.mcpServer;
	}

	/**
	 * Connect to the transport layer
	 */
	async connect(mode: 'sse' | 'stdio' = 'sse', port: number = 3000): Promise<void> {
		if (mode === 'sse') {
			await this.startHTTPServer(port);
		} else {
			this.transport = new StdioServerTransport();
			this.logger.debug('Connecting to Cursor via MCP transport (stdio)');
			await this.mcpServer.connect(this.transport);
			this.logger.debug('MCP connection established');
		}
	}

	/**
	 * Start HTTP server with SSE transport
	 */
	private async startHTTPServer(port: number): Promise<void> {
		this.httpServer = Fastify({ logger: false });

		// Security middleware
		await this.httpServer.register(fastifyHelmet);
		await this.httpServer.register(fastifyCors);

		// SSE Endpoint
		this.httpServer.get('/sse', async (_req, reply) => {
			this.logger.debug('New SSE connection request');

			// SSE requires the underlying Node.js response
			// We must bypass Fastify's response handling for the stream
			const res = reply.raw;

			this.transport = new SSEServerTransport('/message', res);
			await this.mcpServer.connect(this.transport);
			this.logger.debug('MCP connection established (SSE)');

			// Return nothing, as the transport handles the response
			return reply.hijack();
		});

		// Message Endpoint
		this.httpServer.post('/message', async (req, reply) => {
			if (this.transport instanceof SSEServerTransport) {
				// We pass the parsed body from Fastify to the transport
				await this.transport.handlePostMessage(req.raw, reply.raw, req.body);
			} else {
				reply.status(400).send('No active SSE connection');
			}
		});

		try {
			await this.httpServer.listen({ host: '0.0.0.0', port });
			this.logger.info(`MCP Server listening on port ${port} (SSE)`);
			this.logger.info(`SSE Endpoint: http://localhost:${port}/sse`);
			this.logger.info(`Message Endpoint: http://localhost:${port}/message`);
		} catch (err) {
			this.logger.error('Failed to start HTTP server', err as Error);
			throw err;
		}
	}

	/**
	 * Disconnect from the transport layer
	 */
	async disconnect(): Promise<void> {
		if (this.httpServer) {
			await this.httpServer.close();
			this.httpServer = null;
		}

		if (this.transport) {
			// MCP SDK handles transport cleanup
			// But for Stdio, we might need to be careful?
			// transport.close() if available?
			this.transport = null;
			this.logger.debug('MCP transport disconnected');
		}
	}

	/**
	 * Check client capabilities
	 */
	getClientCapabilities(): unknown {
		return this.mcpServer.server.getClientCapabilities();
	}
}
