/**
 * Unit tests for SessionContextManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionContextManager } from './context';
import type { Session } from 'types/session.types';
import { SessionError } from 'utils/error-handler';

function makeSession(): Session {
	return {
		commands: [],
		context: {},
		created_at: new Date().toISOString(),
		current_command: undefined,
		id: 'test-session',
		last_command: undefined,
		metadata: {},
		project_path: '/tmp',
		status: 'active',
		updated_at: new Date().toISOString(),
		version: '1.0.0'
	} as unknown as Session;
}

describe('SessionContextManager', () => {
	let manager: SessionContextManager;

	beforeEach(() => {
		manager = new SessionContextManager(makeSession());
	});

	describe('hasContext', () => {
		it('returns true for top-level key that exists', () => {
			manager.updateContext('foo', 'bar');
			expect(manager.hasContext('foo')).toBe(true);
		});

		it('returns false for top-level key that does not exist', () => {
			expect(manager.hasContext('missing')).toBe(false);
		});

		it('returns true for dot-notation nested key that exists', () => {
			manager.updateContext('user.preferences.theme', 'dark');
			expect(manager.hasContext('user.preferences.theme')).toBe(true);
			expect(manager.hasContext('user.preferences')).toBe(true);
			expect(manager.hasContext('user')).toBe(true);
		});

		it('returns false for dot-notation nested key that does not exist', () => {
			manager.updateContext('user.name', 'Alice');
			expect(manager.hasContext('user.preferences')).toBe(false);
			expect(manager.hasContext('user.name.first')).toBe(false);
		});
	});

	describe('updateContext / getContext', () => {
		it('sets and gets a top-level value', () => {
			manager.updateContext('key', 42);
			expect(manager.getContext('key')).toBe(42);
		});

		it('creates intermediate objects for nested keys', () => {
			manager.updateContext('a.b.c', 'deep');
			expect(manager.getContext('a.b.c')).toBe('deep');
			expect(manager.getContext('a.b')).toEqual({ c: 'deep' });
			expect(manager.getContext('a')).toEqual({ b: { c: 'deep' } });
		});

		it('overwrites an existing nested value', () => {
			manager.updateContext('a.b', 'first');
			manager.updateContext('a.b', 'second');
			expect(manager.getContext('a.b')).toBe('second');
		});
	});

	describe('mergeContext', () => {
		it('adds new keys', () => {
			manager.updateContext('existing', 1);
			manager.mergeContext({ newKey: 2 } as never);
			expect(manager.getContext('existing')).toBe(1);
			expect(manager.getContext('newKey')).toBe(2);
		});

		it('deep-merges nested objects without dropping sibling keys', () => {
			manager.updateContext('config.a', 1);
			manager.updateContext('config.b', 2);
			manager.mergeContext({ config: { c: 3 } } as never);
			expect(manager.getContext('config.a')).toBe(1);
			expect(manager.getContext('config.b')).toBe(2);
			expect(manager.getContext('config.c')).toBe(3);
		});

		it('replaces non-object values at the same key', () => {
			manager.updateContext('count', 1);
			manager.mergeContext({ count: 99 } as never);
			expect(manager.getContext('count')).toBe(99);
		});
	});

	describe('clearContext', () => {
		it('deletes a top-level key', () => {
			manager.updateContext('foo', 'bar');
			manager.clearContext('foo');
			expect(manager.hasContext('foo')).toBe(false);
		});

		it('deletes a nested key without affecting siblings', () => {
			manager.updateContext('user.name', 'Alice');
			manager.updateContext('user.age', 30);
			manager.clearContext('user.name');
			expect(manager.hasContext('user.name')).toBe(false);
			expect(manager.getContext('user.age')).toBe(30);
		});

		it('is a no-op for a non-existent key', () => {
			expect(() => manager.clearContext('does.not.exist')).not.toThrow();
		});
	});

	describe('validateContext', () => {
		it('passes when all required keys exist (top-level and nested)', () => {
			manager.updateContext('name', 'Alice');
			manager.updateContext('address.city', 'London');
			expect(() => manager.validateContext(['name', 'address.city'])).not.toThrow();
		});

		it('throws SessionError listing missing keys', () => {
			manager.updateContext('present', true);
			expect(() => manager.validateContext(['present', 'missing.key'])).toThrow(SessionError);
		});
	});

	describe('getFilteredContext', () => {
		beforeEach(() => {
			manager.updateContext('user.name', 'Alice');
			manager.updateContext('user.age', 30);
			manager.updateContext('user.preferences.theme', 'dark');
			manager.updateContext('other.value', 'unrelated');
		});

		it('returns empty object for empty key list', () => {
			expect(manager.getFilteredContext([])).toEqual({});
		});

		it('returns only the requested top-level key', () => {
			const result = manager.getFilteredContext(['other']);
			expect(result).toEqual({ other: { value: 'unrelated' } });
		});

		it('returns only the requested subtree for a nested key (not the entire root)', () => {
			const result = manager.getFilteredContext(['user.preferences']);
			// Must NOT include user.name or user.age
			expect(result).toEqual({ user: { preferences: { theme: 'dark' } } });
		});

		it('merges multiple requested paths correctly', () => {
			const result = manager.getFilteredContext(['user.name', 'user.age']);
			expect(result).toEqual({ user: { name: 'Alice', age: 30 } });
		});
	});

	describe('extractContextReferences (static)', () => {
		it('extracts $CONTEXT_* variable names from a string', () => {
			const refs = SessionContextManager.extractContextReferences('Hello $CONTEXT_name!');
			expect(refs).toEqual(new Set(['name']));
		});

		it('handles nested paths (e.g. $CONTEXT_user.prefs)', () => {
			const refs = SessionContextManager.extractContextReferences('Theme is $CONTEXT_user.prefs.theme');
			expect(refs).toEqual(new Set(['user.prefs.theme']));
		});

		it('returns empty set when no references found', () => {
			const refs = SessionContextManager.extractContextReferences('no variables here');
			expect(refs.size).toBe(0);
		});
	});
});
