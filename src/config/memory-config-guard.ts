/**
 * Hard-break guard for the legacy `memory.*` configuration shape.
 *
 * memory-as-plugin migration moved every vault-tuning knob
 * (`backend`, half-lives, `embedding`, `recall`, thresholds, …) from the
 * host's `memory.*` namespace to `plugins.memory-vault.*`. Strict Zod parsing
 * would already reject the old shape, but its error message is opaque. This
 * guard runs against the merged raw config before validation and surfaces a
 * targeted message pointing at the migration note.
 */

const LEGACY_MEMORY_KEYS = new Set<string>([
	'backend',
	'decision_half_life_days',
	'embedding',
	'episodic_half_life_days',
	'error_half_life_multiplier',
	'injection_strength_threshold',
	'injection_token_budget',
	'max_entries_per_store',
	'prune_threshold',
	'recall',
	'retrieval_boost_days',
	'semantic_half_life_days'
]);

const MIGRATION_NOTE = 'documentation/migrations/2026-05-memory-plugin.md';

export class LegacyMemoryConfigError extends Error {
	constructor(public readonly offendingKeys: readonly string[]) {
		const keyList = offendingKeys.map((k) => `  - memory.${k}`).join('\n');
		super(
			`Configuration uses legacy \`memory.*\` keys that were removed in the ` +
				`memory-as-plugin migration:\n${keyList}\n\n` +
				`Move them under \`plugins.memory-vault.*\` and keep only ` +
				`\`memory.{enabled, provider}\` at the top level.\n` +
				`See ${MIGRATION_NOTE} for a fix-it diff.`
		);
		this.name = 'LegacyMemoryConfigError';
	}
}

/**
 * Inspect a raw merged config and throw {@link LegacyMemoryConfigError} when
 * any of the moved-or-removed `memory.*` keys are present. No-op when the
 * config has no `memory` block or only the allowed `{enabled, provider}`
 * fields.
 */
export function assertNoLegacyMemoryKeys(rawConfig: unknown): void {
	if (rawConfig === null || typeof rawConfig !== 'object') return;
	const memory = (rawConfig as { memory?: unknown }).memory;
	if (memory === null || typeof memory !== 'object') return;

	const offending = Object.keys(memory).filter((key) => LEGACY_MEMORY_KEYS.has(key));
	if (offending.length > 0) {
		throw new LegacyMemoryConfigError(offending);
	}
}
