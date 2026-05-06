import { describe, expect, it } from 'vitest';

import type { LogEntry } from './observability.types';
import { LogQueryService } from './log-query.service';
import { WorktreeLogBuffer } from './worktree-log-buffer';

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
	level: 'info',
	message: 'test',
	service: 'core',
	timestampMs: 1000,
	...overrides
});

describe('LogQueryService', () => {
	it('returns all entries when no filters', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ message: 'a' }));
		buf.push(makeEntry({ message: 'b' }));
		const svc = new LogQueryService(buf);
		expect(svc.query({})).toHaveLength(2);
	});

	it('filters by level', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ level: 'error', message: 'err' }));
		buf.push(makeEntry({ level: 'info', message: 'inf' }));
		const svc = new LogQueryService(buf);
		expect(svc.query({ level: 'error' })).toHaveLength(1);
	});

	it('filters by service', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ service: 'api' }));
		buf.push(makeEntry({ service: 'db' }));
		const svc = new LogQueryService(buf);
		expect(svc.query({ service: 'api' })).toHaveLength(1);
	});

	it('filters by case-insensitive pattern', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ message: 'Token limit exceeded' }));
		buf.push(makeEntry({ message: 'Normal response' }));
		const svc = new LogQueryService(buf);
		expect(svc.query({ pattern: 'token' })).toHaveLength(1);
	});

	it('filters by time range', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ timestampMs: 500 }));
		buf.push(makeEntry({ timestampMs: 1500 }));
		buf.push(makeEntry({ timestampMs: 2500 }));
		const svc = new LogQueryService(buf);
		const results = svc.query({ sinceMs: 1000, untilMs: 2000 });
		expect(results).toHaveLength(1);
		expect(results[0]?.timestampMs).toBe(1500);
	});

	it('respects limit', () => {
		const buf = new WorktreeLogBuffer();
		for (let i = 0; i < 10; i++) buf.push(makeEntry({ message: `m${i}` }));
		const svc = new LogQueryService(buf);
		expect(svc.query({ limit: 3 })).toHaveLength(3);
	});
});
