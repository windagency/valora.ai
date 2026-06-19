import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { sanitizeForLogging } from 'utils/data-sanitizer';
import { getRuntimeDataDir } from 'utils/paths';

import type { TraceEvent, TraceEventKind, TraceVerifyResult } from './observability.types';

const GENESIS_HASH = '0'.repeat(64);

export class ReasoningTraceRecorder {
	private previousHash = GENESIS_HASH;
	private sequence = 0;
	private readonly traceFile: string;

	constructor(
		private readonly sessionId: string,
		private readonly stageId: string,
		traceDir?: string
	) {
		const base = traceDir ?? path.join(getRuntimeDataDir(), 'traces');
		const sessionDir = path.join(base, sessionId);
		fs.mkdirSync(sessionDir, { recursive: true });
		this.traceFile = path.join(sessionDir, `${stageId}.jsonl`);
	}

	static verify(filePath: string): TraceVerifyResult {
		if (!fs.existsSync(filePath)) {
			return { eventCount: 0, valid: false };
		}

		const content = fs.readFileSync(filePath, 'utf-8').trim();
		if (!content) return { eventCount: 0, valid: true };

		const lines = content.split('\n').filter((l) => l.trim().length > 0);
		let previousHash = GENESIS_HASH;

		for (let i = 0; i < lines.length; i++) {
			let event: TraceEvent;
			try {
				event = JSON.parse(lines[i]!) as TraceEvent;
			} catch {
				return { eventCount: i, firstInvalidLine: i + 1, valid: false };
			}

			const { chainHash, ...rest } = event;
			const expected = computeChainHash(previousHash, rest);

			if (chainHash !== expected) {
				return { eventCount: i, firstInvalidLine: i + 1, valid: false };
			}

			previousHash = chainHash;
		}

		return { eventCount: lines.length, valid: true };
	}

	record(kind: TraceEventKind, rawPayload: Record<string, unknown>): void {
		const payload = sanitizeForLogging(rawPayload);
		const partial: Omit<TraceEvent, 'chainHash'> = {
			kind,
			payload,
			sequenceNumber: this.sequence,
			sessionId: this.sessionId,
			stageId: this.stageId,
			timestamp: new Date().toISOString()
		};
		const chainHash = computeChainHash(this.previousHash, partial);
		const event: TraceEvent = { ...partial, chainHash };

		fs.appendFileSync(this.traceFile, JSON.stringify(event) + '\n', 'utf-8');

		this.previousHash = chainHash;
		this.sequence++;
	}
}

function computeChainHash(previousHash: string, event: Omit<TraceEvent, 'chainHash'>): string {
	const payload = JSON.stringify(event);
	return crypto.createHash('sha256').update(`${previousHash}|${payload}`).digest('hex');
}
