import { describe, expect, it } from 'vitest';

import { obsidianConfigSchema } from './config.schema.js';

describe('obsidianConfigSchema', () => {
	it('applies default colours when the obsidian block is absent', () => {
		const result = obsidianConfigSchema.parse({});
		expect(result.obsidian.colors.episodic).toBe('#4c9be8');
		expect(result.obsidian.colors.semantic).toBe('#7c3aed');
		expect(result.obsidian.colors.decisions).toBe('#059669');
	});

	it('accepts a valid hex colour override', () => {
		const result = obsidianConfigSchema.parse({
			obsidian: { colors: { episodic: '#ff0000' } }
		});
		expect(result.obsidian.colors.episodic).toBe('#ff0000');
	});

	it('rejects a non-hex colour string', () => {
		expect(() => obsidianConfigSchema.parse({ obsidian: { colors: { episodic: 'red' } } })).toThrow();
	});

	it('accepts an optional vaultDir override', () => {
		const result = obsidianConfigSchema.parse({ obsidian: { vaultDir: '/custom/path' } });
		expect(result.obsidian.vaultDir).toBe('/custom/path');
	});

	it('leaves vaultDir undefined when not provided', () => {
		const result = obsidianConfigSchema.parse({});
		expect(result.obsidian.vaultDir).toBeUndefined();
	});
});
