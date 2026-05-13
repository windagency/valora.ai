import { describe, expect, it } from 'vitest';

import { assertNoLegacyMemoryKeys, LegacyMemoryConfigError } from './memory-config-guard';

describe('assertNoLegacyMemoryKeys', () => {
	it('accepts a config with no memory block', () => {
		expect(() => assertNoLegacyMemoryKeys({})).not.toThrow();
	});

	it('accepts a config with only the slim {enabled, provider} shape', () => {
		expect(() =>
			assertNoLegacyMemoryKeys({
				memory: { enabled: true, provider: 'vault' }
			})
		).not.toThrow();
	});

	it('throws when memory.backend is present', () => {
		expect(() =>
			assertNoLegacyMemoryKeys({
				memory: { backend: 'vault', enabled: true }
			})
		).toThrow(LegacyMemoryConfigError);
	});

	it('throws when memory.embedding is present', () => {
		expect(() =>
			assertNoLegacyMemoryKeys({
				memory: { embedding: { provider: 'ollama' } }
			})
		).toThrow(LegacyMemoryConfigError);
	});

	it('throws when any half-life knob is present', () => {
		expect(() =>
			assertNoLegacyMemoryKeys({
				memory: { episodic_half_life_days: 14 }
			})
		).toThrow(LegacyMemoryConfigError);
	});

	it('error message points at the migration note and lists every offending key', () => {
		try {
			assertNoLegacyMemoryKeys({
				memory: { backend: 'vault', embedding: {}, recall: {} }
			});
			expect.fail('expected LegacyMemoryConfigError');
		} catch (err) {
			expect(err).toBeInstanceOf(LegacyMemoryConfigError);
			const message = (err as Error).message;
			expect(message).toContain('memory.backend');
			expect(message).toContain('memory.embedding');
			expect(message).toContain('memory.recall');
			expect(message).toContain('plugins.memory-vault');
			expect(message).toContain('2026-05-memory-plugin.md');
		}
	});

	it('is a no-op when rawConfig is null or undefined', () => {
		expect(() => assertNoLegacyMemoryKeys(null)).not.toThrow();
		expect(() => assertNoLegacyMemoryKeys(undefined)).not.toThrow();
	});
});
