/**
 * Tests for configuration schemas
 */

import { describe, expect, it } from 'vitest';

import {
	AUTO_UPDATE_CONFIG_SCHEMA,
	BUDGETS_CONFIG_SCHEMA,
	CONFIG_SCHEMA,
	DEFAULTS_CONFIG_SCHEMA,
	FEATURE_FLAGS_SCHEMA,
	HOOKS_CONFIG_SCHEMA,
	LOGGING_RETENTION_CONFIG_SCHEMA,
	MEMORY_CONFIG_SCHEMA,
	PLUGIN_SOURCE_SCHEMA,
	PROVIDER_CONFIG_SCHEMA,
	PROVIDERS_CONFIG_SCHEMA,
	SESSION_RETENTION_CONFIG_SCHEMA
} from './schema';

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

	it('rejects a config missing the required top-level "defaults" key', () => {
		const result = CONFIG_SCHEMA.safeParse({ providers: {} });
		expect(result.success).toBe(false);
	});

	it('rejects a config missing the required top-level "providers" key', () => {
		const result = CONFIG_SCHEMA.safeParse({ defaults: {} });
		expect(result.success).toBe(false);
	});
});

describe('DEFAULTS_CONFIG_SCHEMA', () => {
	it('applies documented defaults when every field is omitted', () => {
		const result = DEFAULTS_CONFIG_SCHEMA.parse({});
		expect(result).toMatchObject({
			dry_run: false,
			dry_run_estimate_tokens: true,
			dry_run_show_diffs: true,
			interactive: true,
			log_level: 'info',
			output_format: 'markdown',
			session_mode: true
		});
	});

	it('rejects a log_level outside the enum', () => {
		expect(DEFAULTS_CONFIG_SCHEMA.safeParse({ log_level: 'verbose' }).success).toBe(false);
	});

	it('rejects an output_format outside the enum', () => {
		expect(DEFAULTS_CONFIG_SCHEMA.safeParse({ output_format: 'xml' }).success).toBe(false);
	});

	it('rejects a non-boolean value for a boolean field', () => {
		expect(DEFAULTS_CONFIG_SCHEMA.safeParse({ interactive: 'yes' }).success).toBe(false);
	});
});

describe('MEMORY_CONFIG_SCHEMA — strict mode', () => {
	it('applies its defaults when empty', () => {
		const result = MEMORY_CONFIG_SCHEMA.parse({});
		expect(result).toEqual({ enabled: true, provider: 'vault' });
	});

	it('rejects an unrecognised key — unlike every other passthrough schema, this one is .strict()', () => {
		const result = MEMORY_CONFIG_SCHEMA.safeParse({ enabled: true, half_life_days: 30 });
		expect(result.success).toBe(false);
	});

	it('rejects legacy vault-tuning keys that now belong under plugins.memory-vault.*', () => {
		const result = MEMORY_CONFIG_SCHEMA.safeParse({ decay_rate: 0.5, enabled: true });
		expect(result.success).toBe(false);
	});
});

describe('HOOKS_CONFIG_SCHEMA', () => {
	it('accepts a well-formed PreToolUse hook matcher', () => {
		const result = HOOKS_CONFIG_SCHEMA.safeParse({
			PreToolUse: [{ hooks: [{ command: 'echo hi', type: 'command' }], matcher: 'Bash' }]
		});
		expect(result.success).toBe(true);
	});

	it('rejects a hook matcher with an empty hooks array', () => {
		const result = HOOKS_CONFIG_SCHEMA.safeParse({ PreToolUse: [{ hooks: [], matcher: 'Bash' }] });
		expect(result.success).toBe(false);
	});

	it('rejects a hook command with an empty command string', () => {
		const result = HOOKS_CONFIG_SCHEMA.safeParse({
			PreToolUse: [{ hooks: [{ command: '', type: 'command' }], matcher: 'Bash' }]
		});
		expect(result.success).toBe(false);
	});

	it('rejects a hook command whose type is not the "command" literal', () => {
		const result = HOOKS_CONFIG_SCHEMA.safeParse({
			PreToolUse: [{ hooks: [{ command: 'echo hi', type: 'script' }], matcher: 'Bash' }]
		});
		expect(result.success).toBe(false);
	});

	it('rejects a hook command timeout outside the 100ms-600s range', () => {
		const tooShort = HOOKS_CONFIG_SCHEMA.safeParse({
			PreToolUse: [{ hooks: [{ command: 'echo hi', timeout: 50, type: 'command' }], matcher: 'Bash' }]
		});
		const tooLong = HOOKS_CONFIG_SCHEMA.safeParse({
			PreToolUse: [{ hooks: [{ command: 'echo hi', timeout: 700_000, type: 'command' }], matcher: 'Bash' }]
		});
		expect(tooShort.success).toBe(false);
		expect(tooLong.success).toBe(false);
	});
});

describe('LOGGING_RETENTION_CONFIG_SCHEMA / SESSION_RETENTION_CONFIG_SCHEMA', () => {
	it('rejects cleanup_interval_hours outside the 1-168 range', () => {
		expect(LOGGING_RETENTION_CONFIG_SCHEMA.safeParse({ cleanup_interval_hours: 0 }).success).toBe(false);
		expect(LOGGING_RETENTION_CONFIG_SCHEMA.safeParse({ cleanup_interval_hours: 200 }).success).toBe(false);
		expect(SESSION_RETENTION_CONFIG_SCHEMA.safeParse({ cleanup_interval_hours: 0 }).success).toBe(false);
	});

	it('rejects a negative max_files / max_count', () => {
		expect(LOGGING_RETENTION_CONFIG_SCHEMA.safeParse({ max_files: -1 }).success).toBe(false);
		expect(SESSION_RETENTION_CONFIG_SCHEMA.safeParse({ max_count: -1 }).success).toBe(false);
	});

	it('rejects a non-integer session timeout', () => {
		expect(SESSION_RETENTION_CONFIG_SCHEMA.safeParse({ timeout: 12.5 }).success).toBe(false);
	});

	it('applies documented defaults when every optional field is omitted', () => {
		const result = LOGGING_RETENTION_CONFIG_SCHEMA.parse({});
		expect(result.cleanup_interval_hours).toBeGreaterThan(0);
		expect(typeof result.enabled).toBe('boolean');
	});
});

describe('AUTO_UPDATE_CONFIG_SCHEMA', () => {
	it('rejects a mode outside the enum', () => {
		expect(AUTO_UPDATE_CONFIG_SCHEMA.safeParse({ mode: 'always' }).success).toBe(false);
	});

	it('rejects a frequencyDays outside 1-365 or non-integer', () => {
		expect(AUTO_UPDATE_CONFIG_SCHEMA.safeParse({ frequencyDays: 0 }).success).toBe(false);
		expect(AUTO_UPDATE_CONFIG_SCHEMA.safeParse({ frequencyDays: 400 }).success).toBe(false);
		expect(AUTO_UPDATE_CONFIG_SCHEMA.safeParse({ frequencyDays: 1.5 }).success).toBe(false);
	});

	it('applies its documented defaults when omitted', () => {
		expect(AUTO_UPDATE_CONFIG_SCHEMA.parse({})).toEqual({ frequencyDays: 1, mode: 'reminder' });
	});
});

describe('BUDGETS_CONFIG_SCHEMA', () => {
	it('rejects a non-positive per_command_usd/per_session_usd', () => {
		expect(BUDGETS_CONFIG_SCHEMA.safeParse({ per_command_usd: 0 }).success).toBe(false);
		expect(BUDGETS_CONFIG_SCHEMA.safeParse({ per_session_usd: -5 }).success).toBe(false);
	});

	it('rejects a non-positive-integer per_stage_tokens', () => {
		expect(BUDGETS_CONFIG_SCHEMA.safeParse({ per_stage_tokens: 0 }).success).toBe(false);
		expect(BUDGETS_CONFIG_SCHEMA.safeParse({ per_stage_tokens: 100.5 }).success).toBe(false);
	});

	it('rejects a policy outside the enum', () => {
		expect(BUDGETS_CONFIG_SCHEMA.safeParse({ policy: 'lenient' }).success).toBe(false);
	});

	it('defaults policy to "strict" when omitted', () => {
		expect(BUDGETS_CONFIG_SCHEMA.parse({}).policy).toBe('strict');
	});
});

describe('PLUGIN_SOURCE_SCHEMA', () => {
	it('rejects a type outside the enum', () => {
		expect(PLUGIN_SOURCE_SCHEMA.safeParse({ type: 'ftp' }).success).toBe(false);
	});

	it('rejects a malformed url', () => {
		expect(PLUGIN_SOURCE_SCHEMA.safeParse({ type: 'git', url: 'not-a-url' }).success).toBe(false);
	});

	it('requires a type — the only mandatory field', () => {
		expect(PLUGIN_SOURCE_SCHEMA.safeParse({}).success).toBe(false);
	});
});

describe('PROVIDER_CONFIG_SCHEMA', () => {
	it('rejects a malformed baseUrl', () => {
		expect(PROVIDER_CONFIG_SCHEMA.safeParse({ baseUrl: 'not-a-url' }).success).toBe(false);
	});

	it('rejects max_retries outside 0-10', () => {
		expect(PROVIDER_CONFIG_SCHEMA.safeParse({ max_retries: -1 }).success).toBe(false);
		expect(PROVIDER_CONFIG_SCHEMA.safeParse({ max_retries: 11 }).success).toBe(false);
	});

	it('rejects a negative timeout_ms', () => {
		expect(PROVIDER_CONFIG_SCHEMA.safeParse({ timeout_ms: -1 }).success).toBe(false);
	});
});

describe('FEATURE_FLAGS_SCHEMA', () => {
	it('defaults every flag to false except dynamic_agent_selection_implement_only, which defaults true', () => {
		const result = FEATURE_FLAGS_SCHEMA.parse({});
		expect(result).toEqual({
			agent_selection_analytics: false,
			agent_selection_fallback_reporting: false,
			agent_selection_monitoring: false,
			dynamic_agent_selection: false,
			dynamic_agent_selection_implement_only: true
		});
	});

	it('rejects a non-boolean flag value', () => {
		expect(FEATURE_FLAGS_SCHEMA.safeParse({ dynamic_agent_selection: 'yes' }).success).toBe(false);
	});
});
