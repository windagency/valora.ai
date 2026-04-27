import { describe, expect, it } from 'vitest';

import { PLUGIN_CLI_ENTRY_SCHEMA } from './plugin-manifest.schema';

describe('PLUGIN_CLI_ENTRY_SCHEMA', () => {
	describe('name validation', () => {
		it('accepts a single lowercase kebab-case word', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: 'obsidian', description: 'desc' })).not.toThrow();
		});

		it('accepts two lowercase kebab-case words separated by a space', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: 'obsidian open', description: 'desc' })).not.toThrow();
		});

		it('rejects a name with three or more space-separated parts', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: 'obsidian vault open', description: 'desc' })).toThrow(
				'CLI entry name must be one or two lowercase kebab-case words'
			);
		});

		it('rejects an empty name', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: '', description: 'desc' })).toThrow();
		});

		it('rejects uppercase characters', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: 'Obsidian', description: 'desc' })).toThrow();
		});

		it('rejects a name starting with a digit', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: '1open', description: 'desc' })).toThrow();
		});

		it('accepts kebab-case words with hyphens', () => {
			expect(() => PLUGIN_CLI_ENTRY_SCHEMA.parse({ name: 'vault-open my-cmd', description: 'desc' })).not.toThrow();
		});
	});
});
