import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonlAuditSink } from './audit-sink';
import { createSecurityEvent } from './security-event.types';

describe('JsonlAuditSink', () => {
	let dir: string;
	let path: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'valora-audit-sink-'));
		path = join(dir, 'audit.jsonl');
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
});
