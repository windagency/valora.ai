/**
 * Tool Integrity Monitor
 *
 * Detects tool-set drift (rug pull attacks) by fingerprinting MCP server
 * tool definitions and comparing them across connections.
 */

import { createHash } from 'crypto';

import type { ExternalMCPTool } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';

import { createSecurityEvent, type SecurityEvent } from './security-event.types';

export interface IntegrityCheckResult {
	changed: boolean;
	currentFingerprint: string;
	diff?: ToolSetDiff;
	previousFingerprint?: string;
}

export interface ToolSetDiff {
	added: string[];
	changed: string[];
	removed: string[];
}

export class ToolIntegrityMonitor {
	private events: SecurityEvent[] = [];
	private fingerprints = new Map<string, string>();
	private toolSnapshots = new Map<string, Map<string, string>>();

	/**
	 * Compute a SHA-256 fingerprint of a tool set.
	 * Sorted by name for deterministic output.
	 */
	computeFingerprint(tools: ExternalMCPTool[]): string {
		const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
		const data = sorted.map((t) => ({
			description: t.description,
			inputSchema: t.inputSchema,
			name: t.name
		}));
		return createHash('sha256').update(JSON.stringify(data)).digest('hex');
	}

	/**
	 * Check integrity of a server's tool set.
	 * On first call for a server, stores the fingerprint.
	 * On subsequent calls, compares and reports changes.
	 */
	checkIntegrity(serverId: string, currentTools: ExternalMCPTool[]): IntegrityCheckResult {
		const currentFingerprint = this.computeFingerprint(currentTools);
		const previousFingerprint = this.fingerprints.get(serverId);

		if (previousFingerprint === undefined) {
			// First connection — store baseline
			this.fingerprints.set(serverId, currentFingerprint);
			this.storeToolSnapshot(serverId, currentTools);
			return { changed: false, currentFingerprint };
		}

		if (currentFingerprint === previousFingerprint) {
			return { changed: false, currentFingerprint, previousFingerprint };
		}

		// Tools changed — compute diff
		const diff = this.computeDiff(serverId, currentTools);

		this.logEvent(serverId, previousFingerprint, currentFingerprint, diff);

		// Update stored state
		this.fingerprints.set(serverId, currentFingerprint);
		this.storeToolSnapshot(serverId, currentTools);

		return { changed: true, currentFingerprint, diff, previousFingerprint };
	}

	/**
	 * Get the stored fingerprint for a server.
	 */
	getFingerprint(serverId: string): string | undefined {
		return this.fingerprints.get(serverId);
	}

	/**
	 * Store a fingerprint explicitly (e.g., from approval cache).
	 */
	setFingerprint(serverId: string, fingerprint: string): void {
		this.fingerprints.set(serverId, fingerprint);
	}

	/**
	 * Remove stored fingerprint (e.g., after approval invalidation).
	 */
	clearFingerprint(serverId: string): void {
		this.fingerprints.delete(serverId);
		this.toolSnapshots.delete(serverId);
	}

	/**
	 * Get recorded security events.
	 */
	getEvents(): SecurityEvent[] {
		return [...this.events];
	}

	/**
	 * Clear recorded events.
	 */
	clearEvents(): void {
		this.events = [];
	}

	/**
	 * Store individual tool fingerprints for diff computation.
	 */
	private storeToolSnapshot(serverId: string, tools: ExternalMCPTool[]): void {
		const snapshot = new Map<string, string>();
		for (const tool of tools) {
			const hash = createHash('sha256')
				.update(JSON.stringify({ description: tool.description, inputSchema: tool.inputSchema }))
				.digest('hex');
			snapshot.set(tool.name, hash);
		}
		this.toolSnapshots.set(serverId, snapshot);
	}

	/**
	 * Compute which tools were added, removed, or changed.
	 */
	private computeDiff(serverId: string, currentTools: ExternalMCPTool[]): ToolSetDiff {
		const previousSnapshot = this.toolSnapshots.get(serverId) ?? new Map<string, string>();
		const currentSnapshot = new Map<string, string>();

		for (const tool of currentTools) {
			const hash = createHash('sha256')
				.update(JSON.stringify({ description: tool.description, inputSchema: tool.inputSchema }))
				.digest('hex');
			currentSnapshot.set(tool.name, hash);
		}

		const added: string[] = [];
		const removed: string[] = [];
		const changed: string[] = [];

		for (const [name, hash] of currentSnapshot) {
			if (!previousSnapshot.has(name)) {
				added.push(name);
			} else if (previousSnapshot.get(name) !== hash) {
				changed.push(name);
			}
		}

		for (const name of previousSnapshot.keys()) {
			if (!currentSnapshot.has(name)) {
				removed.push(name);
			}
		}

		return { added, changed, removed };
	}

	private logEvent(serverId: string, previousFingerprint: string, currentFingerprint: string, diff: ToolSetDiff): void {
		const event = createSecurityEvent('tool_set_changed', 'critical', {
			added: diff.added,
			changed: diff.changed,
			currentFingerprint,
			previousFingerprint,
			removed: diff.removed,
			serverId
		});
		this.events.push(event);

		const logger = getLogger();
		logger.warn(`[Security] MCP tool set changed for ${serverId}`, {
			added: diff.added,
			changed: diff.changed,
			removed: diff.removed
		});
	}
}

/**
 * Singleton instance
 */
let instance: null | ToolIntegrityMonitor = null;

export function getToolIntegrityMonitor(): ToolIntegrityMonitor {
	instance ??= new ToolIntegrityMonitor();
	return instance;
}

export function resetToolIntegrityMonitor(): void {
	instance = null;
}
