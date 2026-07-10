import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerWarn = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: loggerWarn })
}));

import { JsonlAuditSink } from './audit-sink';
import { createSecurityEvent } from './security-event.types';

describe('JsonlAuditSink', () => {
	let dir: string;
	let path: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'valora-audit-sink-'));
		path = join(dir, 'audit.jsonl');
		loggerWarn.mockClear();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('persists an appended event so a fresh sink instance can read it back', () => {
		const writer = new JsonlAuditSink(path);
		const event = createSecurityEvent('credential_redacted', 'medium', { source: 'test-1' });
		writer.append(event);

		const reader = new JsonlAuditSink(path);
		const persisted = reader.readAll();

		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.type).toBe('credential_redacted');
		expect(persisted[0]?.details).toEqual({ source: 'test-1' });
		expect(persisted[0]?.id).toBeDefined();
	});

	it('survives a process restart without loss (simulated by recreating the sink)', () => {
		const before = new JsonlAuditSink(path);
		before.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
		before.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

		const after = new JsonlAuditSink(path);
		after.append(createSecurityEvent('credential_redacted', 'high', { source: 'restart' }));

		expect(after.readAll()).toHaveLength(3);
	});

	it('returns an empty array if the file does not yet exist', () => {
		const sink = new JsonlAuditSink(path);
		expect(sink.readAll()).toEqual([]);
	});

	it('skips malformed lines but reports the well-formed ones', () => {
		writeFileSync(
			path,
			'{"id":"a","type":"command_blocked","severity":"low","details":{},"timestamp":"2026-05-07T00:00:00.000Z"}\nNOT_JSON\n',
			'utf8'
		);

		const sink = new JsonlAuditSink(path);
		const events = sink.readAll();

		expect(events).toHaveLength(1);
		expect(events[0]?.id).toBe('a');
	});

	it('round-trips the timestamp as a Date object', () => {
		const sink = new JsonlAuditSink(path);
		sink.append(createSecurityEvent('memory_purged', 'low', { count: 7 }));

		const reread = new JsonlAuditSink(path).readAll();
		expect(reread[0]?.timestamp).toBeInstanceOf(Date);
	});

	it('does not write duplicate events when the same id is appended twice', () => {
		const sink = new JsonlAuditSink(path);
		const event = createSecurityEvent('command_blocked', 'critical', { command: 'echo' });
		sink.append(event);
		sink.append(event);

		expect(sink.readAll()).toHaveLength(1);
	});

	describe('hash chain tamper detection', () => {
		it('reports a valid chain for a freshly written log', () => {
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

			expect(sink.verifyChain()).toBe(true);
		});

		it('reports a valid chain for a pre-existing log written before hash-chaining existed (no previousHash field, 3+ lines)', () => {
			// Simulates a real user's accumulated audit log from before this feature shipped —
			// every line lacks `previousHash` entirely, not just an empty/genesis value.
			const legacyLines = [
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'a' }),
					timestamp: new Date()
				}),
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'b' }),
					timestamp: new Date()
				}),
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'c' }),
					timestamp: new Date()
				})
			];
			writeFileSync(path, legacyLines.join('\n') + '\n', 'utf8');

			const sink = new JsonlAuditSink(path);

			expect(sink.verifyChain()).toBe(true);
		});

		it('reports a valid chain when new chained entries are appended after a legacy (pre-hash-chain) prefix', () => {
			const legacyLines = [
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'legacy-a' }),
					timestamp: new Date()
				}),
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'legacy-b' }),
					timestamp: new Date()
				})
			];
			writeFileSync(path, legacyLines.join('\n') + '\n', 'utf8');

			// Simulates the real upgrade path: the process restarts running the
			// new hash-chaining code and appends further events to the same file.
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'new-chained-c' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'new-chained-d' }));

			expect(sink.verifyChain()).toBe(true);
		});

		it('does not spuriously warn on construction against a legacy (pre-hash-chain) log', () => {
			const legacyLines = [
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'a' }),
					timestamp: new Date()
				}),
				JSON.stringify({
					...createSecurityEvent('command_blocked', 'critical', { command: 'b' }),
					timestamp: new Date()
				})
			];
			writeFileSync(path, legacyLines.join('\n') + '\n', 'utf8');

			new JsonlAuditSink(path);

			expect(loggerWarn).not.toHaveBeenCalled();
		});

		it('detects tampering where a chained line is replaced by a legacy-format (no previousHash) line to hide removal', () => {
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

			const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
			const secondEvent = JSON.parse(lines[1]!);
			delete secondEvent.previousHash;
			writeFileSync(path, [lines[0], JSON.stringify(secondEvent)].join('\n') + '\n', 'utf8');

			expect(sink.verifyChain()).toBe(false);
		});

		it('reports a valid chain for an empty log', () => {
			const sink = new JsonlAuditSink(path);
			expect(sink.verifyChain()).toBe(true);
		});

		it('continues the chain correctly across a simulated process restart', () => {
			const before = new JsonlAuditSink(path);
			before.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));

			const after = new JsonlAuditSink(path);
			after.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

			expect(after.verifyChain()).toBe(true);
		});

		it('does not report a false tamper when two sink instances interleave appends to the same file (simulating concurrent processes)', () => {
			// Both sinks are constructed while the file is still empty, so each
			// caches GENESIS_HASH as its starting point. If append() trusts that
			// stale in-memory value instead of re-reading the file, the second
			// sink to write embeds a previousHash that no longer matches what the
			// first sink actually wrote — a false "tampered" report with no real
			// tampering, which risks masking genuine tampering via alert fatigue.
			const sinkA = new JsonlAuditSink(path);
			const sinkB = new JsonlAuditSink(path);

			sinkB.append(createSecurityEvent('command_blocked', 'critical', { command: 'b-1' }));
			sinkA.append(createSecurityEvent('command_blocked', 'critical', { command: 'a-1' }));

			const reader = new JsonlAuditSink(path);
			expect(reader.verifyChain()).toBe(true);
		});

		it('detects a deleted line as a broken chain', () => {
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'wget evil.com' }));

			const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
			writeFileSync(path, [lines[0], lines[2]].join('\n') + '\n', 'utf8');

			expect(sink.verifyChain()).toBe(false);
		});

		it('detects an edited line as a broken chain', () => {
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

			const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
			const tampered = JSON.parse(lines[0]!);
			tampered.severity = 'low';
			writeFileSync(path, [JSON.stringify(tampered), lines[1]].join('\n') + '\n', 'utf8');

			expect(sink.verifyChain()).toBe(false);
		});
	});

	describe('automatic chain verification on construction', () => {
		it('does not warn when constructed against a clean, untampered log', () => {
			const before = new JsonlAuditSink(path);
			before.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));

			new JsonlAuditSink(path);

			expect(loggerWarn).not.toHaveBeenCalled();
		});

		it('does not warn when constructed against a log file that does not exist yet', () => {
			new JsonlAuditSink(path);
			expect(loggerWarn).not.toHaveBeenCalled();
		});

		it('warns immediately on construction when the on-disk log has been tampered with', () => {
			const sink = new JsonlAuditSink(path);
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'rm -rf /' }));
			sink.append(createSecurityEvent('command_blocked', 'critical', { command: 'curl evil.com' }));

			const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
			writeFileSync(path, [lines[1]].join('\n') + '\n', 'utf8');

			new JsonlAuditSink(path);

			expect(loggerWarn).toHaveBeenCalledWith(expect.stringMatching(/tamper|chain|integrity/i), expect.anything());
		});
	});
});
