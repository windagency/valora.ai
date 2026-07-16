/**
 * Tests for validation helpers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptFn = vi.hoisted(() => vi.fn());
const mockGetProviderMetadata = vi.hoisted(() =>
	vi.fn<
		[string],
		ReturnType<ReturnType<(typeof import('config/provider-catalog'))['getProviderCatalog']>['getProviderMetadata']>
	>()
);

vi.mock('config/provider-catalog', () => ({
	getProviderCatalog: () => ({ getProviderMetadata: mockGetProviderMetadata })
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		cyan: (s: string) => s,
		gray: (s: string) => s,
		red: (s: string) => s,
		green: (s: string) => s
	})
}));

vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({
		prompt: mockPromptFn,
		promptCancellable: (questions: unknown, initialAnswers?: unknown) => ({
			cancel: () => {},
			promise: mockPromptFn(questions, initialAnswers)
		})
	})
}));

import { BuiltinProviders } from './providers.config';
import {
	configureDefaults,
	configureProvider,
	DEFAULT_MODELS,
	filterValidProviders,
	PROVIDER_LABELS,
	sortProviderKeysForDisplay,
	validateApiKey
} from './validation-helpers';

function makePluginDescriptor(overrides: Partial<{ requiresApiKey: boolean; helpText: string }> = {}) {
	return {
		defaultModel: 'plugin-default-model',
		description: 'A plugin-contributed provider',
		helpText: overrides.helpText,
		label: 'My Plugin',
		modelModes: [{ mode: 'default', model: 'plugin-default-model' }],
		requiresApiKey: overrides.requiresApiKey ?? true
	};
}

describe('validation-helpers', () => {
	describe('PROVIDER_LABELS', () => {
		it('should include Cursor provider', () => {
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.CURSOR);
			expect(PROVIDER_LABELS[BuiltinProviders.CURSOR]).toBe('Cursor');
		});

		it('should include all standard providers', () => {
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.ANTHROPIC);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.OPENAI);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.GOOGLE);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.XAI);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.MOONSHOT);
		});
	});

	describe('DEFAULT_MODELS', () => {
		it('should include Cursor with correct default model', () => {
			expect(DEFAULT_MODELS).toHaveProperty(BuiltinProviders.CURSOR);
			expect(DEFAULT_MODELS[BuiltinProviders.CURSOR]).toBe('cursor-sonnet-4.6');
		});

		it('should include xAI with its frontier default model', () => {
			expect(DEFAULT_MODELS).toHaveProperty(BuiltinProviders.XAI);
			expect(DEFAULT_MODELS[BuiltinProviders.XAI]).toBe('grok-4.3');
		});

		it('should have default models for all providers', () => {
			expect(DEFAULT_MODELS[BuiltinProviders.ANTHROPIC]).toBe('claude-fable-5');
			expect(DEFAULT_MODELS[BuiltinProviders.GOOGLE]).toBe('gemini-3.5-flash');
			expect(DEFAULT_MODELS[BuiltinProviders.MOONSHOT]).toBe('kimi-k2.6');
			expect(DEFAULT_MODELS[BuiltinProviders.OPENAI]).toBe('gpt-5.5');
		});
	});

	describe('sortProviderKeysForDisplay', () => {
		const labels: Record<string, string> = {
			anthropic: 'Anthropic',
			google: 'Google',
			local: 'Local',
			'my-plugin': 'My Plugin',
			openai: 'OpenAI',
			xai: 'xAI'
		};
		const labelOf = (key: string) => labels[key] ?? key;

		it('sorts providers alphabetically by label (case-insensitive)', () => {
			expect(sortProviderKeysForDisplay(['openai', 'anthropic', 'google'], labelOf)).toEqual([
				'anthropic',
				'google',
				'openai'
			]);
		});

		it('always places Local last, even when alphabetically earlier', () => {
			const sorted = sortProviderKeysForDisplay(['local', 'anthropic', 'xai'], labelOf);
			expect(sorted).toEqual(['anthropic', 'xai', 'local']);
		});

		it('sorts plugin-contributed providers alongside built-ins, Local still last', () => {
			const sorted = sortProviderKeysForDisplay(['openai', 'my-plugin', 'local', 'anthropic'], labelOf);
			expect(sorted).toEqual(['anthropic', 'my-plugin', 'openai', 'local']);
		});
	});
});

describe('configureProvider', () => {
	beforeEach(() => {
		vi.spyOn(console, 'group').mockImplementation(() => undefined);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('configures an API-key provider contributed by a plugin', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === 'myplugin' ? makePluginDescriptor() : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ apiKey: 'sk-test-123', defaultModel: 'plugin-default-model' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider('myplugin', config as never);

		expect(config.providers['myplugin']).toEqual({ apiKey: 'sk-test-123', default_model: 'plugin-default-model' });
	});

	it('configures a no-API-key provider contributed by a plugin', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === 'myplugin' ? makePluginDescriptor({ requiresApiKey: false }) : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ defaultModel: 'plugin-default-model' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider('myplugin', config as never);

		expect(config.providers['myplugin']).toEqual({ apiKey: '', default_model: 'plugin-default-model' });
	});

	it('throws Unknown provider when the provider is not in the catalog', async () => {
		mockGetProviderMetadata.mockImplementation(() => undefined);

		const config = { providers: {}, defaults: {} };
		await expect(configureProvider('nonexistent', config as never)).rejects.toThrow('Unknown provider: nonexistent');
	});

	it('configures the local provider by prompting for a base URL and default model, applying fallbacks on blank input', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === BuiltinProviders.LOCAL ? makePluginDescriptor({ requiresApiKey: false }) : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ baseUrl: '  ', defaultModel: '  ' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider(BuiltinProviders.LOCAL, config as never);

		expect(config.providers[BuiltinProviders.LOCAL]).toEqual({
			baseUrl: 'http://localhost:8080/v1',
			default_model: 'plugin-default-model'
		});
	});

	it('configures the local provider with the user-provided base URL and model when given', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === BuiltinProviders.LOCAL ? makePluginDescriptor({ requiresApiKey: false }) : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.1' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider(BuiltinProviders.LOCAL, config as never);

		expect(config.providers[BuiltinProviders.LOCAL]).toEqual({
			baseUrl: 'http://localhost:11434/v1',
			default_model: 'llama3.1'
		});
	});

	it('configures Anthropic via Vertex AI when the user opts in, skipping the standard API-key prompt', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === BuiltinProviders.ANTHROPIC ? makePluginDescriptor() : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ useVertex: true }).mockResolvedValueOnce({
			defaultModel: 'claude-vertex-model',
			vertexProjectId: 'my-project',
			vertexRegion: 'us-central1'
		});

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider(BuiltinProviders.ANTHROPIC, config as never);

		expect(config.providers[BuiltinProviders.ANTHROPIC]).toEqual({
			default_model: 'claude-vertex-model',
			vertexAI: true,
			vertexProjectId: 'my-project',
			vertexRegion: 'us-central1'
		});
		expect(mockPromptFn).toHaveBeenCalledTimes(2);
	});

	it('falls through to the standard API-key prompt for Anthropic when the user declines Vertex AI', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === BuiltinProviders.ANTHROPIC ? makePluginDescriptor() : undefined
		);
		mockPromptFn
			.mockResolvedValueOnce({ useVertex: false })
			.mockResolvedValueOnce({ apiKey: 'sk-ant-real-key', defaultModel: 'claude-fable-5' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider(BuiltinProviders.ANTHROPIC, config as never);

		expect(config.providers[BuiltinProviders.ANTHROPIC]).toEqual({
			apiKey: 'sk-ant-real-key',
			default_model: 'claude-fable-5'
		});
	});
});

describe('validateApiKey', () => {
	it('rejects an empty string', () => {
		expect(validateApiKey('')).toBe('API key is required');
	});

	it('rejects a whitespace-only string', () => {
		expect(validateApiKey('   ')).toBe('API key is required');
	});

	it('accepts a non-empty key', () => {
		expect(validateApiKey('sk-ant-real-key')).toBe(true);
	});
});

describe('filterValidProviders', () => {
	it('removes the __skip__ sentinel while preserving order of the rest', () => {
		expect(filterValidProviders(['anthropic', '__skip__', 'openai'])).toEqual(['anthropic', 'openai']);
	});

	it('returns an empty array when every entry is the sentinel', () => {
		expect(filterValidProviders(['__skip__'])).toEqual([]);
	});

	it('returns the input unchanged when there is no sentinel present', () => {
		expect(filterValidProviders(['anthropic', 'openai'])).toEqual(['anthropic', 'openai']);
	});
});

describe('configureDefaults', () => {
	beforeEach(() => {
		vi.spyOn(console, 'group').mockImplementation(() => undefined);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('preserves existing fields on config.defaults such as default_provider', async () => {
		mockPromptFn.mockResolvedValueOnce({
			interactive: true,
			log_level: 'info',
			output_format: 'markdown',
			session_mode: true
		});

		const config = {
			defaults: { default_provider: 'ollama' },
			providers: {}
		};

		await configureDefaults(config as never);

		expect((config.defaults as Record<string, unknown>)['default_provider']).toBe('ollama');
	});
});
