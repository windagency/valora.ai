/**
 * Shutdown Manager
 *
 * Handles graceful shutdown of the MCP server and cleanup operations.
 * Separated from MCPOrchestratorServer for better modularity.
 */

import type { Logger } from 'output/logger';

export class ShutdownManager {
	constructor(private logger: Logger) {
		this.setupGracefulShutdown();
	}

	/**
	 * Setup graceful shutdown handlers
	 */
	private setupGracefulShutdown(): void {
		const shutdown = (signal?: string): void => {
			this.logger.info('Shutting down MCP Orchestrator Server...', { signal });
			this.performCleanup();
			this.logger.info('MCP server shutdown complete, exiting process');
			process.exit(0);
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
	 * Perform cleanup operations before shutdown
	 */
	private performCleanup(): void {
		// Add cleanup operations here as needed
		// For example: close database connections, flush caches, etc.
		this.logger.debug('Performing cleanup operations...');
		// Cleanup logic would go here
	}

	/**
	 * Manually trigger shutdown (useful for testing)
	 */
	shutdown(signal = 'manual'): void {
		this.logger.info('Manual shutdown initiated', { signal });
		this.performCleanup();
		process.exit(0);
	}
}
