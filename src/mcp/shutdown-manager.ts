/**
 * Shutdown Manager
 *
 * Handles graceful shutdown of the MCP server and cleanup operations.
 * Separated from MCPOrchestratorServer for better modularity.
 */

import type { Logger } from 'output/logger';

export class ShutdownManager {
	private cleanupHandlers: Array<() => Promise<void>> = [];

	constructor(private logger: Logger) {
		this.setupGracefulShutdown();
	}

	registerCleanup(fn: () => Promise<void>): void {
		this.cleanupHandlers.push(fn);
	}

	/**
	 * Setup graceful shutdown handlers
	 */
	private async performCleanup(): Promise<void> {
		this.logger.debug('Performing cleanup operations...');
		for (const handler of this.cleanupHandlers) {
			try {
				await handler();
			} catch (err) {
				this.logger.warn('Cleanup handler failed', { error: (err as Error).message });
			}
		}
	}

	private setupGracefulShutdown(): void {
		const shutdown = (signal?: string): void => {
			this.logger.info('Shutting down MCP Orchestrator Server...', { signal });
			void this.performCleanup().then(() => {
				this.logger.info('MCP server shutdown complete, exiting process');
				process.exit(0);
			});
		};

		// Handle various shutdown signals
		process.on('SIGINT', () => shutdown('SIGINT'));
		process.on('SIGTERM', () => shutdown('SIGTERM'));
		process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
		process.on('beforeExit', () => shutdown('beforeExit'));

		// Handle uncaught exceptions and rejections
		process.on('uncaughtException', (error) => {
			this.logger.error('Uncaught exception in MCP server', error);
			shutdown('uncaughtException');
		});

		process.on('unhandledRejection', (reason, promise) => {
			this.logger.error('Unhandled rejection in MCP server', reason instanceof Error ? reason : undefined, {
				promise: promise.toString()
			});
			shutdown('unhandledRejection');
		});

		this.logger.debug('Graceful shutdown handlers registered');
	}

	/**
	 * Manually trigger shutdown (useful for testing)
	 */
	shutdown(signal = 'manual'): void {
		this.logger.info('Manual shutdown initiated', { signal });
		void this.performCleanup().then(() => process.exit(0));
	}
}
