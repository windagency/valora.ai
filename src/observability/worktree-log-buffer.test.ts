import { describe, expect, it } from 'vitest';

import type { LogEntry } from './observability.types';
import { WorktreeLogBuffer } from './worktree-log-buffer';

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
	level: 'info',
	message: 'test message',
	timestampMs: Date.now(),
	...overrides
});

describe('WorktreeLogBuffer', () => {
	it('starts empty', () => {
		const buf = new WorktreeLogBuffer();
		expect(buf.all()).toHaveLength(0);
	});

	it('stores pushed entries', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry({ message: 'hello' }));
		expect(buf.all()[0]?.message).toBe('hello');
	});

	it('evicts oldest entries when max size is reached', () => {
		const buf = new WorktreeLogBuffer({ maxEntries: 3 });
		buf.push(makeEntry({ message: 'first' }));
		buf.push(makeEntry({ message: 'second' }));
		buf.push(makeEntry({ message: 'third' }));
		buf.push(makeEntry({ message: 'fourth' }));
		const all = buf.all();
		expect(all).toHaveLength(3);
		expect(all[0]?.message).toBe('second');
		expect(all[2]?.message).toBe('fourth');
	});

	it('tracks total pushed count beyond capacity', () => {
		const buf = new WorktreeLogBuffer({ maxEntries: 2 });
		buf.push(makeEntry());
		buf.push(makeEntry());
		buf.push(makeEntry());
		expect(buf.totalPushed).toBe(3);
	});

	it('clears all entries', () => {
		const buf = new WorktreeLogBuffer();
		buf.push(makeEntry());
		buf.clear();
		expect(buf.all()).toHaveLength(0);
	});

	it('defaults to 5000 max entries', () => {
		const buf = new WorktreeLogBuffer();
		for (let i = 0; i < 5001; i++) buf.push(makeEntry({ message: `m${i}` }));
		expect(buf.all()).toHaveLength(5000);
		expect(buf.totalPushed).toBe(5001);
	});
});
