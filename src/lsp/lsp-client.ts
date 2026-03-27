/**
 * LSP Client
 *
 * Manages a single language server process: spawning, initialising,
 * request/notification dispatch, and shutdown.
 *
 * Protocol framing (Content-Length / JSON-RPC) is delegated to the
 * LSPProtocolAdapter so that the underlying library can be swapped.
 */

import { spawn } from 'child_process';

import type { LSPClientState, LSPServerConfig } from './lsp.types';

import { getLSPProtocolAdapter, type LSPProtocolConnection } from './lsp-protocol-adapter.interface';

/**
 * LSP Client — manages a single language server process
 */
export class LSPClient {
	private readonly config: LSPServerConfig;
	private connection: LSPProtocolConnection | null = null;
	private readonly projectRoot: string;
	private state: LSPClientState = 'stopped';

	constructor(config: LSPServerConfig, projectRoot: string) {
		this.config = config;
		this.projectRoot = projectRoot;
	}

	/**
	 * Get the current client state
	 */
	getState(): LSPClientState {
		return this.state;
	}

	/**
	 * Start the language server and send initialize request
	 */
	async start(): Promise<boolean> {
		if (this.state === 'ready') return true;
		if (this.state === 'starting') return false;

		this.state = 'starting';

		try {
			const process = spawn(this.config.command, this.config.args, {
				cwd: this.projectRoot,
				env: { ...globalThis.process.env, ...this.config.env },
				stdio: ['pipe', 'pipe', 'pipe']
			});

			const adapter = getLSPProtocolAdapter();
			const connection = adapter.createConnection(process);
			if (!connection) {
				this.state = 'error';
				return false;
			}

			this.connection = connection;

			connection.onClose(() => {
				this.state = 'stopped';
			});

			connection.onError(() => {
				this.state = 'error';
			});

			process.on('exit', () => {
				this.state = 'stopped';
			});

			process.on('error', () => {
				this.state = 'error';
			});

			connection.listen();

			// Send initialize request
			await connection.sendRequest('initialize', {
				capabilities: {
					textDocument: {
						completion: { completionItem: {} },
						definition: { linkSupport: false },
						hover: { contentFormat: ['plaintext', 'markdown'] },
						publishDiagnostics: {},
						references: {}
					},
					workspace: {
						workspaceFolders: true
					}
				},
				initializationOptions: this.config.initializationOptions ?? {},
				processId: globalThis.process.pid,
				rootUri: `file://${this.projectRoot}`,
				workspaceFolders: [{ name: 'root', uri: `file://${this.projectRoot}` }]
			});

			// Send initialized notification
			connection.sendNotification('initialized', {});

			this.state = 'ready';
			return true;
		} catch {
			this.state = 'error';
			this.cleanup();
			return false;
		}
	}

	/**
	 * Send a JSON-RPC request and wait for response
	 */
	async sendRequest(method: string, params?: unknown): Promise<unknown> {
		if (!this.connection) {
			throw new Error('LSP client not started');
		}

		return this.connection.sendRequest(method, params);
	}

	/**
	 * Send a JSON-RPC notification (no response expected)
	 */
	sendNotification(method: string, params?: unknown): void {
		if (!this.connection) return;

		this.connection.sendNotification(method, params);
	}

	/**
	 * Graceful shutdown
	 */
	async shutdown(): Promise<void> {
		if (this.state !== 'ready') {
			this.cleanup();
			return;
		}

		try {
			await this.sendRequest('shutdown');
			this.sendNotification('exit');
		} catch {
			// Force kill if shutdown fails
		} finally {
			this.cleanup();
		}
	}

	/**
	 * Clean up the connection
	 */
	private cleanup(): void {
		if (this.connection) {
			try {
				this.connection.dispose();
			} catch {
				// Already disposed
			}
			this.connection = null;
		}

		this.state = 'stopped';
	}
}
