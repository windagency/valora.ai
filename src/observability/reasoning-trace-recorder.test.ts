import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReasoningTraceRecorder } from './reasoning-trace-recorder';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-trace-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { force: true, recursive: true });
});

function makeRecorder(sessionId = 'sess-001', stageId = 'coder.write-code'): ReasoningTraceRecorder {
	return new ReasoningTraceRecorder(sessionId, stageId, tmpDir);
}

describe('ReasoningTraceRecorder', () => {
	describe('record()', () => {
		it('creates the session directory and trace file on first record', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { model: 'claude-3' });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			expect(fs.existsSync(traceFile)).toBe(true);
		});

		it('writes a valid JSON line per event', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { model: 'claude-3' });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const line = fs.readFileSync(traceFile, 'utf-8').trim();
			const parsed = JSON.parse(line) as Record<string, unknown>;

			expect(parsed['kind']).toBe('llm_request');
			expect(parsed['sessionId']).toBe('sess-001');
			expect(parsed['stageId']).toBe('coder.write-code');
			expect(parsed['sequenceNumber']).toBe(0);
			expect(typeof parsed['timestamp']).toBe('string');
			expect(typeof parsed['chainHash']).toBe('string');
		});

		it('increments sequence number for each event', () => {
			const rec = makeRecorder();
			rec.record('llm_request', {});
			rec.record('llm_response', {});
			rec.record('stage_complete', {});

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const lines = fs.readFileSync(traceFile, 'utf-8').trim().split('\n');
			const events = lines.map((l) => JSON.parse(l) as { sequenceNumber: number });

			expect(events[0]!.sequenceNumber).toBe(0);
			expect(events[1]!.sequenceNumber).toBe(1);
			expect(events[2]!.sequenceNumber).toBe(2);
		});

		it('each chain hash differs from the previous', () => {
			const rec = makeRecorder();
			rec.record('llm_request', {});
			rec.record('llm_response', {});

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const lines = fs.readFileSync(traceFile, 'utf-8').trim().split('\n');
			const events = lines.map((l) => JSON.parse(l) as { chainHash: string });

			expect(events[0]!.chainHash).not.toBe(events[1]!.chainHash);
		});

		it('redacts credential-like values in the payload', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { api_key: 'sk-1234567890abcdef', model: 'claude-3' });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const content = fs.readFileSync(traceFile, 'utf-8');

			expect(content).not.toContain('sk-1234567890abcdef');
			expect(content).toContain('claude-3');
		});

		it('appends to existing file rather than overwriting it', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { iteration: 1 });
			rec.record('llm_response', { iteration: 1 });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const lines = fs.readFileSync(traceFile, 'utf-8').trim().split('\n');
			expect(lines).toHaveLength(2);
		});
	});

	describe('verify()', () => {
		it('returns valid=true for an unmodified trace', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { model: 'claude-3' });
			rec.record('tool_call', { tool: 'read_file' });
			rec.record('tool_result', { result: 'ok' });
			rec.record('stage_complete', { success: true });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const result = ReasoningTraceRecorder.verify(traceFile);

			expect(result.valid).toBe(true);
			expect(result.eventCount).toBe(4);
		});

		it('returns valid=false when a line is tampered with', () => {
			const rec = makeRecorder();
			rec.record('llm_request', { model: 'claude-3' });
			rec.record('llm_response', { content: 'original' });

			const traceFile = path.join(tmpDir, 'sess-001', 'coder.write-code.jsonl');
			const lines = fs.readFileSync(traceFile, 'utf-8').trim().split('\n');

			// Tamper with the second line's payload
			const second = JSON.parse(lines[1]!) as Record<string, unknown>;
			second['payload'] = { content: 'tampered' };
			lines[1] = JSON.stringify(second);
			fs.writeFileSync(traceFile, lines.join('\n') + '\n');

			const result = ReasoningTraceRecorder.verify(traceFile);
			expect(result.valid).toBe(false);
			expect(result.firstInvalidLine).toBe(2);
		});

		it('returns valid=false for a non-existent file', () => {
			const result = ReasoningTraceRecorder.verify('/tmp/nonexistent-trace.jsonl');
			expect(result.valid).toBe(false);
			expect(result.eventCount).toBe(0);
		});

		it('returns valid=true for an empty trace file', () => {
			const traceFile = path.join(tmpDir, 'empty.jsonl');
			fs.writeFileSync(traceFile, '');
			const result = ReasoningTraceRecorder.verify(traceFile);
			expect(result.valid).toBe(true);
			expect(result.eventCount).toBe(0);
		});
	});
});
