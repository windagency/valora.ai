/**
 * Tool Integrity Monitor
 *
 * Detects tool-set drift (rug pull attacks) by fingerprinting MCP server
 * tool definitions and comparing them across connections. Baselines are
 * persisted to disk so drift can be detected even when the originating
 * process is restarted between connections.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ExternalMCPTool } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';
import { getRuntimeDataDir } from 'utils/paths';

import { getAuditSink } from './audit-sink';
import { createSecurityEvent, type SecurityEvent } from './security-event.types';

export interface IntegrityCheckResult {
	changed: boolean;
	currentFingerprint: string;
	diff?: ToolSetDiff;
	previousFingerprint?: string;
}

export interface ToolIntegrityMonitorOptions {
	baselineFilePath?: string;
}

export interface ToolSetDiff {
	added: string[];
	changed: string[];
	removed: string[];
}

interface PersistedBaseline {
	fingerprint: string;
	snapshot: Record<string, string>;
}

type PersistedBaselines = Record<string, PersistedBaseline>;

const DEFAULT_BASELINE_FILENAME = 'mcp-baselines.json';

export class ToolIntegrityMonitor {
	private baselineFilePath: string;
	private events: SecurityEvent[] = [];
	private fingerprints = new Map<string, string>();
	private toolSnapshots = new Map<string, Map<string, string>>();

	constructor(options: ToolIntegrityMonitorOptions = {}) {
		this.baselineFilePath = options.baselineFilePath ?? join(getRuntimeDataDir(), DEFAULT_BASELINE_FILENAME);
		this.loadFromDisk();
	}

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
			this.fingerprints.set(serverId, currentFingerprint);
			this.storeToolSnapshot(serverId, currentTools);
			this.persistToDisk();
			return { changed: false, currentFingerprint };
		}

		if (currentFingerprint === previousFingerprint) {
			return { changed: false, currentFingerprint, previousFingerprint };
		}

		const diff = this.computeDiff(serverId, currentTools);

		this.logEvent(serverId, previousFingerprint, currentFingerprint, diff);

		this.fingerprints.set(serverId, currentFingerprint);
		this.storeToolSnapshot(serverId, currentTools);
		this.persistToDisk();

		return { changed: true, currentFingerprint, diff, previousFingerprint };
	}

	/**
	 * Check integrity of arbitrary content identified by a generic id — used
	 * for plugin rug-pull detection (fingerprinting a plugin's manifest +
	 * code entrypoint), reusing the same baseline store as MCP tool-set
	 * fingerprinting. Unlike {@link checkIntegrity}, there is no per-item
	 * diff — plugin content is treated as a single opaque blob.
	 */
	checkContentIntegrity(id: string, content: string): IntegrityCheckResult {
		const currentFingerprint = createHash('sha256').update(content).digest('hex');
		const previousFingerprint = this.fingerprints.get(id);

		if (previousFingerprint === undefined) {
			this.fingerprints.set(id, currentFingerprint);
			this.persistToDisk();
			return { changed: false, currentFingerprint };
		}

		if (currentFingerprint === previousFingerprint) {
			return { changed: false, currentFingerprint, previousFingerprint };
		}

		this.logContentChangeEvent(id, previousFingerprint, currentFingerprint);
		this.fingerprints.set(id, currentFingerprint);
		this.persistToDisk();

		return { changed: true, currentFingerprint, previousFingerprint };
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

	private loadFromDisk(): void {
		if (!existsSync(this.baselineFilePath)) return;
		try {
			const raw = readFileSync(this.baselineFilePath, 'utf8');
			const parsed = JSON.parse(raw) as PersistedBaselines;
			for (const [serverId, baseline] of Object.entries(parsed)) {
				if (typeof baseline?.fingerprint !== 'string' || typeof baseline.snapshot !== 'object') continue;
				this.fingerprints.set(serverId, baseline.fingerprint);
				this.toolSnapshots.set(serverId, new Map(Object.entries(baseline.snapshot)));
			}
		} catch {
			// Treat any read or parse failure as a missing baseline; the next
			// successful checkIntegrity will rewrite the file.
		}
	}

	private persistToDisk(): void {
		const payload: PersistedBaselines = {};
		for (const [serverId, fingerprint] of this.fingerprints) {
			const snapshotMap = this.toolSnapshots.get(serverId) ?? new Map<string, string>();
			payload[serverId] = {
				fingerprint,
				snapshot: Object.fromEntries(snapshotMap)
			};
		}

		try {
			const dir = dirname(this.baselineFilePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			// Atomic write: write to temp file in same dir, then rename.
			const tmpPath = `${this.baselineFilePath}.tmp-${process.pid}`;
			writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
			renameSync(tmpPath, this.baselineFilePath);
		} catch {
			// Persistence is best-effort — a write failure must not break the
			// in-process integrity tracking. The next process is responsible
			// for reseeding from a clean state.
		}
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

	private logContentChangeEvent(id: string, previousFingerprint: string, currentFingerprint: string): void {
		const event = createSecurityEvent('plugin_code_changed', 'critical', {
			currentFingerprint,
			id,
			previousFingerprint
		});
		this.events.push(event);
		getAuditSink().append(event);

		const logger = getLogger();
		logger.warn(`[Security] Plugin content changed for ${id}`, { currentFingerprint, previousFingerprint });
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
		getAuditSink().append(event);

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
