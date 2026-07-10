/**
 * Append-only JSONL sink for security events.
 *
 * Persistence matters here: in-memory arrays per guard are erased on process
 * crash, which means a successful exfiltration followed by a forced restart
 * would also erase the forensic trail. Each event is written to disk
 * synchronously; reads merge the file with any in-memory caller-supplied
 * events, dedup by `id`, and return chronologically sorted output.
 *
 * Known limitation: hash-chaining (see `verifyChain()`) has no external
 * anchor for "how many lines should exist, and what did they contain" —
 * `hashLine()` uses no secret, so anyone with filesystem write access to this
 * file can edit, reorder, delete, insert, or truncate ANY suffix of it and
 * then correctly recompute every `previousHash` forward from that point,
 * producing a chain that verifies successfully end to end. This isn't
 * limited to deleting the most recent line(s) (e.g. `sed -i '$d'`, now
 * blocked for this file specifically via `PROTECTED_INFRASTRUCTURE_PATTERNS`
 * in command-guard.ts, but not for an attacker operating outside the guard
 * entirely, such as a compromised host process editing the file directly) —
 * it applies equally to rewriting an arbitrary earlier line and everything
 * after it. Local hash-chaining alone cannot close this; the actual
 * mitigation is shipping or exporting the log to a location the principal
 * being audited cannot write to (see `audit-exporter.ts`).
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from 'output/logger';
import { getRuntimeDataDir } from 'utils/paths';

import type { SecurityEvent } from './security-event.types';

const DEFAULT_FILENAME = 'security-audit.jsonl';
const GENESIS_HASH = 'genesis';

export class JsonlAuditSink {
	private writtenIds = new Set<string>();

	constructor(public readonly filePath: string) {
		this.preloadWrittenIds();

		// Verifying only ever happened when an operator manually ran
		// `valora security audit-export` — tampering could otherwise go
		// undetected indefinitely. Checking once here means the very next
		// process start (this is a singleton, constructed once per process)
		// surfaces a broken chain instead of relying on someone remembering
		// to check.
		if (!this.verifyChain()) {
			getLogger().warn(
				`[Security] Audit log hash chain integrity check failed for ${this.filePath} — a prior entry may have been deleted, reordered, or edited.`,
				{ filePath: this.filePath }
			);
		}
	}

	/**
	 * Each appended line embeds a hash of the previous line, so deleting,
	 * reordering, or editing any prior line breaks the chain from that point
	 * forward — detectable via `verifyChain()` even if the file itself
	 * remains syntactically valid JSONL. The previous hash is recomputed from
	 * disk on every call rather than cached in memory: a cached value goes
	 * stale the moment another process (or another sink instance in this one)
	 * appends to the same file, which would otherwise make ordinary
	 * concurrent CLI usage indistinguishable from real tampering.
	 */
	append(event: SecurityEvent): void {
		const id = event.id ?? '';
		if (id && this.writtenIds.has(id)) return;

		try {
			this.ensureDir();
			const record = { ...event, previousHash: this.computeLastHashFromFile() };
			const line = JSON.stringify(record);
			appendFileSync(this.filePath, line + '\n', 'utf8');
			if (id) this.writtenIds.add(id);
		} catch {
			// Persistent audit logging is best-effort. A disk full or permissions
			// failure must not break the primary security control flow — the
			// in-memory event arrays in each guard remain authoritative for the
			// running process even if disk writes fail.
		}
	}

	/**
	 * Recomputes the hash chain from the persisted file and confirms every
	 * line's embedded `previousHash` matches the hash of the line before it.
	 * Returns `false` if any line was deleted, reordered, or edited.
	 */
	readAll(): SecurityEvent[] {
		if (!existsSync(this.filePath)) return [];
		try {
			const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
			const events: SecurityEvent[] = [];
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line) as SecurityEvent & { timestamp: Date | string };
					if (typeof parsed.timestamp === 'string') {
						parsed.timestamp = new Date(parsed.timestamp);
					}
					events.push(parsed);
				} catch {
					// Skip malformed line but continue reading.
				}
			}
			return events;
		} catch {
			return [];
		}
	}

	/**
	 * Legacy lines from before hash-chaining existed have no `previousHash`
	 * field at all — they're skipped from the equality check (not defaulted to
	 * `GENESIS_HASH`, which only holds for the very first line) so a
	 * pre-existing multi-line log doesn't spuriously fail verification on
	 * every process start. Once a chained line has been seen, a later line
	 * reverting to the legacy (no-`previousHash`) shape is itself treated as
	 * tampering — e.g. an attacker replacing a chained line to hide a removal.
	 */
	verifyChain(): boolean {
		if (!existsSync(this.filePath)) return true;
		try {
			const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
			let expectedPreviousHash = GENESIS_HASH;
			let chainStarted = false;
			for (const line of lines) {
				const parsed = JSON.parse(line) as { previousHash?: string };
				if (parsed.previousHash === undefined) {
					if (chainStarted) return false;
				} else {
					chainStarted = true;
					if (parsed.previousHash !== expectedPreviousHash) return false;
				}
				expectedPreviousHash = hashLine(line);
			}
			return true;
		} catch {
			return false;
		}
	}

	private computeLastHashFromFile(): string {
		if (!existsSync(this.filePath)) return GENESIS_HASH;
		try {
			const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
			const lastLine = lines.at(-1);
			return lastLine === undefined ? GENESIS_HASH : hashLine(lastLine);
		} catch {
			return GENESIS_HASH;
		}
	}

	private ensureDir(): void {
		const dir = dirname(this.filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	private preloadWrittenIds(): void {
		for (const event of this.readAll()) {
			if (event.id) this.writtenIds.add(event.id);
		}
	}
}

function hashLine(line: string): string {
	return createHash('sha256').update(line).digest('hex');
}

let instance: JsonlAuditSink | null = null;

export function getAuditSink(): JsonlAuditSink {
	instance ??= new JsonlAuditSink(join(getRuntimeDataDir(), DEFAULT_FILENAME));
	return instance;
}

export function resetAuditSink(): void {
	instance = null;
}

export function setAuditSink(sink: JsonlAuditSink | null): void {
	instance = sink;
}
