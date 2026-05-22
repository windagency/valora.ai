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

export function countConcernHits(content: string, keywords: string[]): number {
	let hits = 0;
	for (const keyword of keywords) {
		let pos = 0;
		while ((pos = content.indexOf(keyword, pos)) !== -1) {
			hits++;
			pos += keyword.length;
		}
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
