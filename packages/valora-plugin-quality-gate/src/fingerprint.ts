import type { ConcernCategory } from './scanner.types.js';

export const CONCERN_PATTERNS: Record<ConcernCategory, string[]> = {
	'circuit-breaker': ['CircuitBreaker', 'breaker', 'half-open'],
	'error-boundary': ['try', 'catch', 'throw', 'except', 'Error('],
	logging: ['logger.error', 'log.error', 'console.error', 'console.warn'],
	metrics: ['counter(', 'histogram(', 'gauge(', '.increment('],
	retry: ['retry', 'attempt', 'backoff', 'exponential'],
	timeout: ['AbortController', 'deadline', 'setTimeout', 'timeout']
};

const IMPORT_REGEX = /(?:(?:import|from)\s+['"]|require\s*\(\s*['"])([^'"./][^'"]*)['"]/g;

const REGEX_META = /[.*+?^${}()|[\]\\]/g;
const WORD_EDGE = /[A-Za-z0-9_]/;

/**
 * Build a case-sensitive matcher that only fires on whole tokens. A `\b` anchor
 * is added at each end whose adjacent keyword character is a word character, so
 * `retry` matches `retry()` but not `retryable`, and `Error(` matches
 * `new Error(` but not `TypeError(`.
 */
export function countConcernHits(content: string, keywords: string[]): number {
	let hits = 0;
	for (const keyword of keywords) {
		hits += content.match(buildKeywordMatcher(keyword))?.length ?? 0;
	}
	return hits;
}

export function extractImports(content: string): Set<string> {
	const imports = new Set<string>();
	for (const match of content.matchAll(IMPORT_REGEX)) {
		const raw = match[1];
		if (raw) {
			const rootSegment = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : (raw.split('/')[0] ?? raw);
			imports.add(rootSegment);
		}
	}
	return imports;
}

function buildKeywordMatcher(keyword: string): RegExp {
	const escaped = keyword.replace(REGEX_META, '\\$&');
	const prefix = WORD_EDGE.test(keyword[0] ?? '') ? '\\b' : '';
	const suffix = WORD_EDGE.test(keyword.at(-1) ?? '') ? '\\b' : '';
	return new RegExp(`${prefix}${escaped}${suffix}`, 'g');
}
