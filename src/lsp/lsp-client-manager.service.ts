/**
 * LSP Client Manager Service
 *
 * Multi-language client pool (singleton). Manages LSP client lifecycle,
 * spawning servers on demand and shutting them down after idle timeout.
 */

import type { LSPServerConfig } from './lsp.types';

import { LSPClient } from './lsp-client';
import { getServerForFile } from './lsp-language-registry';

/** Idle timeout before shutting down a server (5 minutes) */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface ManagedClient {
	client: LSPClient;
	config: LSPServerConfig;
	idleTimer: null | ReturnType<typeof setTimeout>;
	lastUsed: number;
}

/**
 * LSP Client Manager — manages a pool of language server clients
 */
export class LSPClientManagerService {
	private readonly clients = new Map<string, ManagedClient>();
	private readonly projectRoot: string;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Get a client for a file, spawning the server if needed.
	 * Returns null if no server is configured for this file type.
	 */
	async getClientForFile(filePath: string): Promise<LSPClient | null> {
		const config = getServerForFile(filePath, this.projectRoot);
		if (!config) return null;

		const key = config.command;
		const existing = this.clients.get(key);

		if (existing) {
			this.touchClient(existing);
			if (existing.client.getState() === 'ready') {
				return existing.client;
			}
			// Client exists but not ready — try to restart
			await existing.client.shutdown();
		}

		// Spawn new client
		const client = new LSPClient(config, this.projectRoot);
		const managed: ManagedClient = {
			client,
			config,
			idleTimer: null,
			lastUsed: Date.now()
		};

		this.clients.set(key, managed);

		const started = await client.start();
		if (!started) {
			this.clients.delete(key);
			return null;
		}

		this.resetIdleTimer(managed, key);
		return client;
	}

	/**
	 * Shut down all managed clients
	 */
	async shutdownAll(): Promise<void> {
		const shutdowns: Array<Promise<void>> = [];

		for (const [, managed] of this.clients) {
			if (managed.idleTimer) clearTimeout(managed.idleTimer);
			shutdowns.push(managed.client.shutdown());
		}

		await Promise.allSettled(shutdowns);
		this.clients.clear();
	}

	/**
	 * Get the number of active clients
	 */
	getActiveClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get status of all managed clients
	 */
	getStatus(): Array<{ command: string; lastUsed: number; state: string }> {
		return Array.from(this.clients.entries()).map(([key, managed]) => ({
			command: key,
			lastUsed: managed.lastUsed,
			state: managed.client.getState()
		}));
	}

	/**
	 * Update last-used timestamp and reset idle timer
	 */
	private touchClient(managed: ManagedClient): void {
		managed.lastUsed = Date.now();
	}

	/**
	 * Reset the idle timeout for a client
	 */
	private resetIdleTimer(managed: ManagedClient, key: string): void {
		if (managed.idleTimer) clearTimeout(managed.idleTimer);

		managed.idleTimer = setTimeout(() => {
			void managed.client.shutdown().then(() => {
				this.clients.delete(key);
			});
		}, IDLE_TIMEOUT_MS);
	}
}

/**
 * Singleton management
 */
let managerInstance: LSPClientManagerService | null = null;

export function getLSPClientManager(projectRoot?: string): LSPClientManagerService {
	if (!managerInstance && projectRoot) {
		managerInstance = new LSPClientManagerService(projectRoot);
	}
	managerInstance ??= new LSPClientManagerService(process.cwd());
	return managerInstance;
}

export function resetLSPClientManager(): void {
	managerInstance = null;
}
