import { describe, expect, it } from 'vitest';

import { parseVaultPluginConfig, VAULT_PLUGIN_CONFIG_SCHEMA } from './config-schema.js';

describe('parseVaultPluginConfig', () => {
	it('returns an all-defaults config when the subtree is missing', () => {
		const config = parseVaultPluginConfig(undefined);

		expect(config).toEqual({
			decision_half_life_days: 21,
			episodic_half_life_days: expect.any(Number),
			error_half_life_multiplier: expect.any(Number),
			injection_strength_threshold: expect.any(Number),
			injection_token_budget: 2000,
			max_entries_per_store: 500,
			prune_threshold: 0.05,
			retrieval_boost_days: expect.any(Number),
			semantic_half_life_days: expect.any(Number)
		});
	});

	it('returns an all-defaults config when the subtree is an empty object', () => {
		expect(parseVaultPluginConfig({})).toEqual(parseVaultPluginConfig(undefined));
	});

	it('accepts an explicit, fully-populated config unchanged', () => {
		const config = parseVaultPluginConfig({
			decision_half_life_days: 30,
			embedding: { batch_size: 16, dim: 384, model: 'custom-model', provider: 'ollama' },
			episodic_half_life_days: 7,
			error_half_life_multiplier: 2,
			injection_strength_threshold: 0.5,
			injection_token_budget: 4000,
			max_entries_per_store: 1000,
			prune_threshold: 0.1,
			recall: { co_access_increment: 0.2, seed_k: 10, walk_decay: 0.5, walk_depth: 3 },
			retrieval_boost_days: 5,
			semantic_half_life_days: 90
		});

		expect(config.decision_half_life_days).toBe(30);
		expect(config.embedding).toEqual({ batch_size: 16, dim: 384, model: 'custom-model', provider: 'ollama' });
		expect(config.recall).toEqual({ co_access_increment: 0.2, seed_k: 10, walk_decay: 0.5, walk_depth: 3 });
	});

	it('leaves embedding and recall undefined when omitted, rather than defaulting them', () => {
		const config = parseVaultPluginConfig({});
		expect(config.embedding).toBeUndefined();
		expect(config.recall).toBeUndefined();
	});

	it('applies embedding sub-schema defaults when embedding is provided but incomplete', () => {
		const config = parseVaultPluginConfig({ embedding: {} });
		expect(config.embedding).toEqual({
			batch_size: 32,
			dim: 768,
			model: 'nomic-embed-text',
			provider: 'auto'
		});
	});

	it('applies recall sub-schema defaults when recall is provided but incomplete', () => {
		const config = parseVaultPluginConfig({ recall: {} });
		expect(config.recall?.walk_depth).toBe(2);
	});

	it.each([
		['decision_half_life_days', 0],
		['decision_half_life_days', 366],
		['episodic_half_life_days', 0],
		['error_half_life_multiplier', 0],
		['error_half_life_multiplier', 11],
		['injection_strength_threshold', -0.1],
		['injection_strength_threshold', 1.1],
		['injection_token_budget', 99],
		['injection_token_budget', 10001],
		['max_entries_per_store', 9],
		['max_entries_per_store', 10001],
		['prune_threshold', -0.1],
		['prune_threshold', 1.1],
		['retrieval_boost_days', -1],
		['retrieval_boost_days', 31],
		['semantic_half_life_days', 0]
	])('rejects an out-of-range %s value of %s', (field, value) => {
		expect(() => parseVaultPluginConfig({ [field]: value })).toThrow();
	});

	it.each([
		['batch_size', 0],
		['batch_size', 257],
		['dim', 0]
	])('rejects an out-of-range embedding.%s value of %s', (field, value) => {
		expect(() => parseVaultPluginConfig({ embedding: { [field]: value } })).toThrow();
	});

	it.each([
		['seed_k', 0],
		['seed_k', 101],
		['walk_decay', -0.1],
		['walk_decay', 1.1],
		['walk_depth', -1],
		['walk_depth', 11],
		['co_access_increment', -0.1]
	])('rejects an out-of-range recall.%s value of %s', (field, value) => {
		expect(() => parseVaultPluginConfig({ recall: { [field]: value } })).toThrow();
	});

	it('rejects a non-numeric value for a numeric field', () => {
		expect(() => parseVaultPluginConfig({ decision_half_life_days: 'thirty' })).toThrow();
	});
});

describe('VAULT_PLUGIN_CONFIG_SCHEMA', () => {
	it('is the schema parseVaultPluginConfig delegates to', () => {
		expect(VAULT_PLUGIN_CONFIG_SCHEMA.parse({})).toEqual(parseVaultPluginConfig(undefined));
	});
});
