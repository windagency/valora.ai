/**
 * Append-only JSONL sink for security events.
 *
 * Persistence matters here: in-memory arrays per guard are erased on process
 * crash, which means a successful exfiltration followed by a forced restart
 * would also erase the forensic trail. Each event is written to disk
 * synchronously; reads merge the file with any in-memory caller-supplied
 * events, dedup by `id`, and return chronologically sorted output.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getRuntimeDataDir } from 'utils/paths';

import type { SecurityEvent } from './security-event.types';

const DEFAULT_FILENAME = 'security-audit.jsonl';

export class JsonlAuditSink {
	private writtenIds = new Set<string>();

	constructor(public readonly filePath: string) {
		this.preloadWrittenIds();
	}

	append(event: SecurityEvent): void {
		const id = event.id ?? '';
		if (id && this.writtenIds.has(id)) return;

		try {
			this.ensureDir();
			appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
			if (id) this.writtenIds.add(id);
		} catch {
			// Persistent audit logging is best-effort. A disk full or permissions
			// failure must not break the primary security control flow — the
			// in-memory event arrays in each guard remain authoritative for the
			// running process even if disk writes fail.
		}
	}

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
