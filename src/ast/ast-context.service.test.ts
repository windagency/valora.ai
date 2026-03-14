/**
 * AST Context Service Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { ContextDeduplicator, getContextDeduplicator, resetContextDeduplicator } from './ast-context.service';

describe('ContextDeduplicator', () => {
	let dedup: ContextDeduplicator;

	beforeEach(() => {
		resetContextDeduplicator();
		dedup = getContextDeduplicator();
	});

	afterEach(() => {
		resetContextDeduplicator();
	});

	it('should record and check symbol sent status', () => {
		dedup.recordSymbolSent('sym1', 'context', 2);

		const result = dedup.wasSymbolSent('sym1', 2);
		expect(result).not.toBeNull();
		expect(result!.stage).toBe('context');
		expect(result!.level).toBe(2);
	});

	it('should return null for unsent symbols', () => {
		const result = dedup.wasSymbolSent('unknown', 1);
		expect(result).toBeNull();
	});

	it('should check minimum level correctly', () => {
		dedup.recordSymbolSent('sym1', 'context', 1);

		// Level 1 was sent, asking for level 1 should match
		expect(dedup.wasSymbolSent('sym1', 1)).not.toBeNull();

		// Level 1 was sent, asking for level 2 should not match
		expect(dedup.wasSymbolSent('sym1', 2)).toBeNull();
	});

	it('should record and check file sent status', () => {
		dedup.recordFileSent('src/foo.ts', 'plan', 3);

		const result = dedup.wasFileSent('src/foo.ts', 2);
		expect(result).not.toBeNull();
		expect(result!.stage).toBe('plan');
	});

	it('should return null for unsent files', () => {
		const result = dedup.wasFileSent('unknown.ts', 0);
		expect(result).toBeNull();
	});

	it('should reset state', () => {
		dedup.recordSymbolSent('sym1', 'context', 2);
		dedup.recordFileSent('file.ts', 'context', 1);

		dedup.reset();

		expect(dedup.wasSymbolSent('sym1', 0)).toBeNull();
		expect(dedup.wasFileSent('file.ts', 0)).toBeNull();
	});

	it('should return singleton instance', () => {
		const instance1 = getContextDeduplicator();
		const instance2 = getContextDeduplicator();
		expect(instance1).toBe(instance2);
	});
});
