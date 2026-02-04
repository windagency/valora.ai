/**
 * MCP Audit Logger Service
 *
 * Logs all external MCP operations for security auditing.
 * Tracks approval decisions, connections, tool calls, and errors.
 */

import type { MCPAuditLogEntry } from 'types/mcp-client.types';

import { existsSync, mkdirSync } from 'fs';
import { getLogger } from 'output/logger';
import { dirname, resolve } from 'path';
import { appendFile, readFile } from 'utils/file-utils';

/**
 * Default path for the audit log
 */
const DEFAULT_AUDIT_LOG_PATH = '.ai/logs/mcp-audit.jsonl';

/**
 * Maximum audit log entries to keep in memory
 */
const MAX_MEMORY_ENTRIES = 1000;

/**
 * MCP Audit Logger Service
 *
 * Responsibilities:
 * - Log all external MCP operations
 * - Track approval decisions
 * - Track connections and disconnections
 * - Track tool calls with timing
 * - Support both file-based and memory-based logging
 */
export class MCPAuditLoggerService {
	private initialized = false;
	private memoryLog: MCPAuditLogEntry[] = [];

	constructor(
		private logPath: string = DEFAULT_AUDIT_LOG_PATH,
		private writeToFile: boolean = true
	) {}

	/**
	 * Initialize the audit logger
	 */
	initialize(): void {
		if (this.initialized) {
			return;
		}

		const logger = getLogger();

		if (this.writeToFile) {
			const fullPath = resolve(process.cwd(), this.logPath);
			const dir = dirname(fullPath);

			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				logger.debug('Created audit log directory', { dir });
			}
		}

		this.initialized = true;
		logger.debug('MCP Audit Logger initialized', { logPath: this.logPath });
	}

	/**
	 * Log an approval decision
	 */
	async logApproval(serverId: string, approved: boolean, decision?: string, notes?: string): Promise<void> {
		const entry: MCPAuditLogEntry = {
			details: {
				decision,
				notes
			},
			operation: 'approval',
			serverId,
			success: approved,
			timestamp: new Date()
		};

		await this.writeEntry(entry);
	}

	/**
	 * Log a connection attempt
	 */
	async logConnection(serverId: string, success: boolean, error?: string): Promise<void> {
		const entry: MCPAuditLogEntry = {
			error,
			operation: 'connect',
			serverId,
			success,
			timestamp: new Date()
		};

		await this.writeEntry(entry);
	}

	/**
	 * Log a disconnection
	 */
	async logDisconnection(serverId: string): Promise<void> {
		const entry: MCPAuditLogEntry = {
			operation: 'disconnect',
			serverId,
			success: true,
			timestamp: new Date()
		};

		await this.writeEntry(entry);
	}

	/**
	 * Log a tool call
	 */
	async logToolCall(
		serverId: string,
		toolName: string,
		success: boolean,
		durationMs: number,
		error?: string
	): Promise<void> {
		const entry: MCPAuditLogEntry = {
			duration_ms: durationMs,
			error,
			operation: 'tool_call',
			serverId,
			success,
			timestamp: new Date(),
			toolName
		};

		await this.writeEntry(entry);
	}

	/**
	 * Log an error
	 */
	async logError(serverId: string, error: string, details?: Record<string, unknown>): Promise<void> {
		const entry: MCPAuditLogEntry = {
			details,
			error,
			operation: 'error',
			serverId,
			success: false,
			timestamp: new Date()
		};

		await this.writeEntry(entry);
	}

	/**
	 * Get recent audit entries from memory
	 */
	getRecentEntries(limit: number = 100): MCPAuditLogEntry[] {
		return this.memoryLog.slice(-limit);
	}

	/**
	 * Get entries for a specific server
	 */
	getServerEntries(serverId: string, limit: number = 100): MCPAuditLogEntry[] {
		return this.memoryLog.filter((e) => e.serverId === serverId).slice(-limit);
	}

	/**
	 * Get entries by operation type
	 */
	getEntriesByOperation(operation: MCPAuditLogEntry['operation'], limit: number = 100): MCPAuditLogEntry[] {
		return this.memoryLog.filter((e) => e.operation === operation).slice(-limit);
	}

	/**
	 * Get statistics summary
	 */
	getStats(): {
		byOperation: Record<string, number>;
		byServer: Record<string, number>;
		successRate: number;
		totalEntries: number;
	} {
		const byOperation: Record<string, number> = {};
		const byServer: Record<string, number> = {};
		let successCount = 0;

		for (const entry of this.memoryLog) {
			byOperation[entry.operation] = (byOperation[entry.operation] ?? 0) + 1;
			byServer[entry.serverId] = (byServer[entry.serverId] ?? 0) + 1;
			if (entry.success) {
				successCount++;
			}
		}

		return {
			byOperation,
			byServer,
			successRate: this.memoryLog.length > 0 ? successCount / this.memoryLog.length : 0,
			totalEntries: this.memoryLog.length
		};
	}

	/**
	 * Load historical entries from file
	 */
	async loadHistoricalEntries(limit: number = 1000): Promise<MCPAuditLogEntry[]> {
		const logger = getLogger();

		if (!this.writeToFile) {
			return this.memoryLog.slice(-limit);
		}

		const fullPath = resolve(process.cwd(), this.logPath);

		if (!existsSync(fullPath)) {
			return [];
		}

		try {
			const content = await readFile(fullPath);
			const lines = content.trim().split('\n').filter(Boolean);
			const entries: MCPAuditLogEntry[] = [];

			for (const line of lines.slice(-limit)) {
				try {
					const entry = JSON.parse(line) as MCPAuditLogEntry;
					entry.timestamp = new Date(entry.timestamp);
					entries.push(entry);
				} catch {
					// Skip malformed lines
				}
			}

			return entries;
		} catch (error) {
			logger.warn('Failed to load historical audit entries', {
				error: (error as Error).message,
				path: fullPath
			});
			return [];
		}
	}

	/**
	 * Clear the in-memory log
	 */
	clearMemoryLog(): void {
		const count = this.memoryLog.length;
		this.memoryLog = [];
		getLogger().debug('Cleared memory audit log', { count });
	}

	/**
	 * Write an entry to both memory and file
	 */
	private async writeEntry(entry: MCPAuditLogEntry): Promise<void> {
		const logger = getLogger();

		// Add to memory log
		this.memoryLog.push(entry);

		// Trim memory log if too large
		if (this.memoryLog.length > MAX_MEMORY_ENTRIES) {
			this.memoryLog = this.memoryLog.slice(-MAX_MEMORY_ENTRIES);
		}

		// Write to file if enabled
		if (this.writeToFile) {
			this.initialize();

			try {
				const fullPath = resolve(process.cwd(), this.logPath);
				const line = JSON.stringify(entry) + '\n';
				await appendFile(fullPath, line);
			} catch (error) {
				logger.warn('Failed to write audit log entry', {
					error: (error as Error).message,
					operation: entry.operation,
					serverId: entry.serverId
				});
			}
		}

		// Log to standard logger for debugging
		logger.debug('MCP Audit', {
			operation: entry.operation,
			serverId: entry.serverId,
			success: entry.success,
			toolName: entry.toolName
		});
	}
}

/**
 * Singleton instance
 */
let instance: MCPAuditLoggerService | null = null;

/**
 * Get the MCP Audit Logger service instance
 */
export function getMCPAuditLogger(logPath?: string, writeToFile?: boolean): MCPAuditLoggerService {
	instance ??= new MCPAuditLoggerService(logPath, writeToFile);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPAuditLogger(): void {
	instance = null;
}
