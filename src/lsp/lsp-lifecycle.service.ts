/**
 * LSP Lifecycle Service
 *
 * Manages the lifecycle of LSP servers within the context of a pipeline run.
 * Handles spawn-on-demand, session scoping, and cleanup.
 */

import { getLSPClientManager, type LSPClientManagerService } from './lsp-client-manager.service';

/**
 * LSP Lifecycle Service — coordinates server lifecycle with pipeline execution
 */
export class LSPLifecycleService {
	private manager: LSPClientManagerService;
	private sessionActive = false;

	constructor(projectRoot: string) {
		this.manager = getLSPClientManager(projectRoot);
	}

	/**
	 * Start a session — allows servers to be spawned
	 */
	startSession(): void {
		this.sessionActive = true;
	}

	/**
	 * End a session — shuts down all servers
	 */
	async endSession(): Promise<void> {
		this.sessionActive = false;
		await this.manager.shutdownAll();
	}

	/**
	 * Check if a session is active
	 */
	isSessionActive(): boolean {
		return this.sessionActive;
	}

	/**
	 * Get the client manager (for tool handlers to use)
	 */
	getManager(): LSPClientManagerService {
		return this.manager;
	}
}

/**
 * Singleton management
 */
let lifecycleInstance: LSPLifecycleService | null = null;

export function getLSPLifecycle(projectRoot?: string): LSPLifecycleService {
	if (!lifecycleInstance && projectRoot) {
		lifecycleInstance = new LSPLifecycleService(projectRoot);
	}
	lifecycleInstance ??= new LSPLifecycleService(process.cwd());
	return lifecycleInstance;
}

export function resetLSPLifecycle(): void {
	lifecycleInstance = null;
}
