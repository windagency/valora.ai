/**
 * Tests for configuration schemas
 */

import { describe, expect, it } from 'vitest';

import { CONFIG_SCHEMA, PROVIDERS_CONFIG_SCHEMA } from './schema';

describe('PROVIDERS_CONFIG_SCHEMA — dynamic provider keys', () => {
	it('accepts a known provider key without error', () => {
		const result = PROVIDERS_CONFIG_SCHEMA.safeParse({ anthropic: { apiKey: 'x' } });
		expect(result.success).toBe(true);
	});

	it('accepts openrouter (formerly explicit, now dynamic) without error', () => {
		const result = PROVIDERS_CONFIG_SCHEMA.safeParse({ openrouter: { apiKey: 'y' } });
		expect(result.success).toBe(true);
	});

	it('accepts an unknown plugin provider key with extra fields without error', () => {
		const result = PROVIDERS_CONFIG_SCHEMA.safeParse({
			myplugin: { apiKey: 'z', custom_field: 'extra' }
		});
		expect(result.success).toBe(true);
	});

	it('round-trips a providers object with both known and unknown keys without losing data', () => {
		const input = {
			anthropic: { apiKey: 'ant-key' },
			openai: { apiKey: 'oai-key' },
			ollama: { baseUrl: 'http://localhost:11434', custom_opt: true }
		};
		const result = PROVIDERS_CONFIG_SCHEMA.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data['anthropic']?.apiKey).toBe('ant-key');
			expect(result.data['openai']?.apiKey).toBe('oai-key');
			expect(result.data['ollama']?.baseUrl).toBe('http://localhost:11434');
			expect((result.data['ollama'] as Record<string, unknown>)?.['custom_opt']).toBe(true);
		}
	});

	it('preserves provider-specific extra keys like httpReferer through parse', () => {
		const input = {
			openrouter: { apiKey: 'y', httpReferer: 'https://example.com' }
		};
		const result = PROVIDERS_CONFIG_SCHEMA.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect((result.data['openrouter'] as Record<string, unknown>)?.['httpReferer']).toBe('https://example.com');
		}
	});
});

describe('CONFIG_SCHEMA — unknown key stripping', () => {
	it('strips unknown top-level keys from parsed config', () => {
		const result = CONFIG_SCHEMA.safeParse({
			defaults: {},
			providers: {},
			obsidian: { vaultDir: '/custom-vault' }
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect('obsidian' in result.data).toBe(false);
		}
	});
});
