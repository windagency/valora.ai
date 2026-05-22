import { describe, expect, it } from 'vitest';

import { CONCERN_PATTERNS, countConcernHits, extractImports } from './fingerprint.js';

describe('extractImports', () => {
	it('extracts bare module specifiers from ES import statements', () => {
		const content = `import { Client } from 'nats';
import { retry } from './local.js';
import path from 'node:path';`;
		const result = extractImports(content);
		expect(result.has('nats')).toBe(true);
		expect(result.has('node:path')).toBe(true);
		expect(result.has('./local.js')).toBe(false);
	});

	it('extracts only the root segment of deep import paths', () => {
		const result = extractImports("import x from 'nats/connection';");
		expect(result.has('nats')).toBe(true);
		expect(result.has('nats/connection')).toBe(false);
	});

	it('handles CommonJS require() calls', () => {
		const result = extractImports("const x = require('axios');");
		expect(result.has('axios')).toBe(true);
	});

	it('returns an empty set when content has no imports', () => {
		expect(extractImports('const x = 1 + 1;').size).toBe(0);
	});

	it('deduplicates the same module imported multiple times', () => {
		const content = "import a from 'lodash'; import b from 'lodash/fp';";
		const result = extractImports(content);
		expect(result.size).toBe(1);
		expect(result.has('lodash')).toBe(true);
	});
});

describe('countConcernHits', () => {
	it('counts occurrences of each keyword in the content', () => {
		const content = 'try { } catch (e) { throw new Error("fail"); }';
		const hits = countConcernHits(content, CONCERN_PATTERNS['error-boundary']);
		expect(hits).toBeGreaterThan(0);
	});

	it('returns 0 when no keywords are present', () => {
		expect(countConcernHits('const x = 1;', CONCERN_PATTERNS['retry'])).toBe(0);
	});

	it('counts multiple occurrences of the same keyword independently', () => {
		expect(countConcernHits('retry(); retry(); retry();', ['retry'])).toBe(3);
	});

	it('counts overlapping keywords separately', () => {
		const hits = countConcernHits('CircuitBreaker half-open breaker', CONCERN_PATTERNS['circuit-breaker']);
		expect(hits).toBe(3);
	});
});

describe('CONCERN_PATTERNS', () => {
	it('defines patterns for all six built-in categories', () => {
		const expected = ['error-boundary', 'retry', 'circuit-breaker', 'timeout', 'logging', 'metrics'];
		for (const cat of expected) {
			expect(CONCERN_PATTERNS).toHaveProperty(cat);
		}
	});
});
