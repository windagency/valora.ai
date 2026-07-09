/**
 * Escalation Ledger - Persistent record of escalation decisions
 *
 * Appends each escalation decision to .valora/escalations.jsonl (one JSON record
 * per line), modeled on `SpendingTracker` (`utils/spending-tracker.ts`). This is
 * the durable, retrospective half of confidence-reliability: it doesn't verify a
 * confidence number in real time, but lets a later report empirically check
 * whether stated confidence correlates with what a human actually decided.
 *
 * Deliberately excludes free-text fields (reasoning, proposed_action) — only
 * bounded, structured fields are persisted, to avoid unbounded LLM-generated
 * content accumulating on disk indefinitely. The full text remains available via
 * `ReasoningTraceRecorder`'s per-stage trace files if ever needed.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type { EscalationDecisionType, EscalationRiskLevel } from 'types/escalation.types';

import { getRuntimeDataDir } from 'utils/paths';

export interface EscalationLedgerRecord {
	confidence: number;
	confidenceSource: 'defaulted' | 'reported';
	/** Absent until the human decision is known (a "triggered" event precedes the "resolved" one). */
	decision?: EscalationDecisionType;
	riskLevel: EscalationRiskLevel;
	sessionId?: string;
	stage: string;
	timestamp: string;
	triggeredCriteria: string[];
}

export interface GetEscalationRecordsOptions {
	since?: string;
	stage?: string;
}

const getLedgerFile = (dataDir?: string): string => join(dataDir ?? getRuntimeDataDir(), 'escalations.jsonl');

export class EscalationLedger {
	constructor(private readonly dataDir?: string) {}

	/**
	 * Append an escalation record to the JSONL file. Non-fatal: a disk failure here
	 * should never break the pipeline it's observing.
	 */
	record(r: EscalationLedgerRecord): void {
		try {
			ensureDir(this.dataDir);
			appendFileSync(getLedgerFile(this.dataDir), JSON.stringify(r) + '\n', 'utf8');
		} catch {
			// Non-fatal: ledger persistence should not break the main flow
		}
	}

	/**
	 * Read all records, optionally filtered by stage and/or date. Skips individual
	 * unparseable lines rather than discarding the whole file — a single corrupted
	 * append (e.g. a partial write) shouldn't erase every other recorded decision.
	 */
	getRecords(opts?: GetEscalationRecordsOptions): EscalationLedgerRecord[] {
		const file = getLedgerFile(this.dataDir);
		if (!existsSync(file)) return [];

		let lines: string[];
		try {
			lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
		} catch {
			return [];
		}

		let records = lines.reduce<EscalationLedgerRecord[]>((acc, line) => {
			try {
				acc.push(JSON.parse(line) as EscalationLedgerRecord);
			} catch {
				// Skip this line only — the rest of the ledger is still trustworthy.
			}
			return acc;
		}, []);

		if (opts?.stage) {
			records = records.filter((r) => r.stage === opts.stage);
		}
		if (opts?.since) {
			const since = new Date(opts.since).getTime();
			records = records.filter((r) => new Date(r.timestamp).getTime() >= since);
		}

		return records;
	}
}

function ensureDir(dataDir?: string): void {
	const dir = dataDir ?? getRuntimeDataDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

let instance: EscalationLedger | null = null;

export function getEscalationLedger(): EscalationLedger {
	instance ??= new EscalationLedger();
	return instance;
}

export function resetEscalationLedger(): void {
	instance = null;
}
