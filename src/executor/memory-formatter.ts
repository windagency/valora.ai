/**
 * Memory formatter — formats memory query results for injection into agent prompts.
 *
 * Groups entries by confidence tier (verified → observed → inferred) so agents
 * can weight memories by reliability. Respects a token budget to avoid context
 * window overflow.
 */

import type { MemoryQueryResult } from 'types/memory.types';

const TOKEN_ESTIMATE_CHARS = 4; // approximate chars per token

/**
 * Format memory query results into a markdown block for system message injection.
 *
 * Groups entries by confidence tier: VERIFIED first, then OBSERVED, then INFERRED.
 * Respects a token budget — stops adding entries once the budget (90% safety margin)
 * is reached. Stale entries are excluded entirely.
 *
 * Returns null if there are no non-stale entries to include.
 *
 * @param results - Memory query results to format
 * @param tokenBudget - Maximum tokens to use (default 2000)
 */
export function formatMemoryForInjection(results: MemoryQueryResult[], tokenBudget = 2000): null | string {
	// Filter out stale entries
	const active = results.filter((r) => r.entry.confidence !== 'stale');
	if (active.length === 0) {
		return null;
	}

	const header = [
		'## AGENT MEMORY (LEARNED PATTERNS & DECISIONS)',
		'',
		'Memories from previous sessions, grouped by confidence.',
		'Weight decisions accordingly: VERIFIED > OBSERVED > INFERRED.',
		''
	].join('\n');

	const grouped = {
		inferred: active.filter((r) => r.entry.confidence === 'inferred'),
		observed: active.filter((r) => r.entry.confidence === 'observed'),
		verified: active.filter((r) => r.entry.confidence === 'verified')
	};

	const effectiveBudget = Math.floor(tokenBudget * 0.9) * TOKEN_ESTIMATE_CHARS;
	let usedChars = header.length;
	const sections: string[] = [header];

	for (const tier of ['verified', 'observed', 'inferred'] as const) {
		const tierResults = grouped[tier];
		if (tierResults.length === 0) continue;

		const tierHeader = `### ${tier.toUpperCase()} MEMORIES\n\n`;
		if (usedChars + tierHeader.length > effectiveBudget) break;
		usedChars += tierHeader.length;

		const tierLines: string[] = [tierHeader];
		for (const result of tierResults) {
			const { entry } = result;
			const pathSuffix =
				entry.relatedPaths.length > 0 ? ` _(files: ${entry.relatedPaths.slice(0, 3).join(', ')})_` : '';
			const line = `- **[${entry.category}]** ${entry.content}${pathSuffix}\n  _Tags: ${entry.tags.join(', ')}_\n\n`;
			if (usedChars + line.length > effectiveBudget) break;
			usedChars += line.length;
			tierLines.push(line);
		}
		sections.push(tierLines.join(''));
	}

	sections.push('---\n');
	return sections.join('');
}
