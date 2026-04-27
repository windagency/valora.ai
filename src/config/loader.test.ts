/**
 * Unit tests for config/loader.ts
 *
 * Tests configuration loading from files, environment variables,
 * CLI overrides, and validation with error handling.
 */

import * as path from 'path';
import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';
import { ConfigurationError } from 'utils/error-handler';
// Import after mocking
import { ensureDir, fileExists, getAIRoot, readJSON, writeJSON } from 'utils/file-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoader, resetUnknownProviderWarningsForTests } from './loader';
import { CONFIG_SCHEMA, DEFAULT_CONFIG } from './schema';

// Mock dependencies
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		ensureDir: vi.fn(),
		fileExists: vi.fn(),
		getAIRoot: vi.fn(() => '/mock/ai/root'),
		readJSON: vi.fn(),
		writeJSON: vi.fn()
	};
});
vi.mock('./constants');
vi.mock('./schema', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./schema')>();
	return {
		...actual,
		CONFIG_SCHEMA: {
			parse: vi.fn((data) => data) // Mock successful validation
		},
		DEFAULT_CONFIG: {
			defaults: {
				default_provider: 'anthropic',
				dry_run: false,
				dry_run_estimate_tokens: true,
				dry_run_show_diffs: true,
				interactive: false,
				log_level: 'info',
				output_format: 'markdown',
				session_mode: true
			},
			features: {
				agent_selection_analytics: false,
				agent_selection_fallback_reporting: false,
				agent_selection_monitoring: false,
				dynamic_agent_selection: false,
				dynamic_agent_selection_implement_only: true
			},
			logging: {
				cleanup_interval_hours: 24,
				daily_file_max_size_mb: 50,
				dry_run: false,
				enabled: true
			},
			paths: { config_file: 'config.json' },
			providers: {},
			sessions: {
				cleanup_interval_hours: 24,
				dry_run: false,
				enabled: true
			}
		}
	};
});
vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		log: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('llm/registry', () => ({
	getProviderRegistry: vi.fn(() => ({
		getDescriptor: vi.fn(() => undefined)
	}))
}));

const mockWriteJSON = vi.mocked(writeJSON);

const mockFileExists = vi.mocked(fileExists);
const mockReadJSON = vi.mocked(readJSON);
const mockEnsureDir = vi.mocked(ensureDir);
const mockGetAIRoot = vi.mocked(getAIRoot);
const mockConfigSchemaParse = vi.mocked(CONFIG_SCHEMA.parse);

describe('ConfigLoader', () => {
	let loader: ConfigLoader;
	let tempDir: string;

	beforeEach(() => {
		tempDir = path.join(process.cwd(), 'test-config');
		// Provide explicit config path to avoid getAIRoot dependency
		loader = new ConfigLoader(path.join(tempDir, 'config.json'));

		// Reset all mocks and their implementations
		vi.resetAllMocks();

		// Default mock implementations
		mockGetAIRoot.mockReturnValue(tempDir);
		mockFileExists.mockReturnValue(false);
		mockReadJSON.mockResolvedValue({});
		mockConfigSchemaParse.mockReturnValue(DEFAULT_CONFIG);

		// Default registry mock: all providers are known (no unknown-provider warnings by default)
		vi.mocked(getProviderRegistry).mockReturnValue({
			getDescriptor: vi.fn(
				() => ({ label: 'mock' }) as ReturnType<ReturnType<typeof getProviderRegistry>['getDescriptor']>
			)
		} as ReturnType<typeof getProviderRegistry>);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('constructor', () => {
		it('should use provided config path', () => {
			const customPath = '/custom/path/config.json';
			const loader = new ConfigLoader(customPath);

			expect(loader).toBeInstanceOf(ConfigLoader);
		});

		it('should use default config path when none provided', () => {
			mockGetAIRoot.mockReturnValue(tempDir);
			const loader = new ConfigLoader();

			expect(loader).toBeInstanceOf(ConfigLoader);
		});
	});

	describe('load', () => {
		it('should return cached config on subsequent calls', async () => {
			mockFileExists.mockReturnValue(false);

			const config1 = await loader.load();
			const firstCallCount = mockFileExists.mock.calls.length;
			const config2 = await loader.load();

			expect(config1).toBe(config2);
			// Second call should not trigger additional fileExists calls (cache hit)
			expect(mockFileExists).toHaveBeenCalledTimes(firstCallCount);
		});

		it('should load config from file when it exists', async () => {
			const fileConfig = {
				defaults: { log_level: 'debug' as const },
				providers: { openai: { apiKey: 'test-key' } }
			};

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);
			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				defaults: { ...DEFAULT_CONFIG.defaults, log_level: 'debug' },
				providers: { ...DEFAULT_CONFIG.providers, openai: { apiKey: 'test-key' } }
			});

			const config = await loader.load();

			expect(mockReadJSON).toHaveBeenCalledWith(path.join(tempDir, 'config.json'));
			expect(config.defaults.log_level).toBe('debug');
			expect(config.providers.openai?.apiKey).toBe('test-key');
		});

		it('should handle missing config file gracefully', async () => {
			mockFileExists.mockReturnValue(false);

			const config = await loader.load();

			expect(config.defaults).toBeDefined();
			expect(config.providers).toBeDefined();
			expect(mockReadJSON).not.toHaveBeenCalled();
		});

		it('should throw ConfigurationError for invalid JSON in config file', async () => {
			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockRejectedValue(new Error('Invalid JSON'));
			mockConfigSchemaParse.mockReturnValue(DEFAULT_CONFIG);

			await expect(loader.load()).rejects.toThrow(ConfigurationError);
			await expect(loader.load()).rejects.toThrow(`Failed to parse config file: ${loader['configPath']}`);
		});

		it('should merge config sources in correct order', async () => {
			const fileConfig = { defaults: { log_level: 'warn' as const } };
			const envConfig = { defaults: { log_level: 'error' as const } }; // Should override file
			const cliOverrides = { defaults: { log_level: 'debug' as const } }; // Should override env

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);

			// Mock environment loading
			const originalEnv = process.env;
			process.env['AI_LOG_LEVEL'] = 'error';

			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				defaults: { ...DEFAULT_CONFIG.defaults, log_level: 'debug' }
			});

			const config = await loader.load(cliOverrides);

			expect(config.defaults.log_level).toBe('debug'); // CLI override wins

			// Restore env
			process.env = originalEnv;
		});

		it('should validate config with schema', async () => {
			const validConfig = {
				...DEFAULT_CONFIG,
				defaults: { ...DEFAULT_CONFIG.defaults, log_level: 'info' as const }
			};
			mockConfigSchemaParse.mockReturnValue(validConfig);

			const config = await loader.load();

			expect(mockConfigSchemaParse).toHaveBeenCalled();
			expect(config).toBe(validConfig);
		});

		it('should handle schema validation errors', async () => {
			const validationError = new Error('Schema validation failed');
			mockFileExists.mockReturnValue(false);
			mockReadJSON.mockResolvedValue({});
			mockConfigSchemaParse.mockImplementation(() => {
				throw validationError;
			});

			const error = await loader.load().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ConfigurationError);
			expect((error as ConfigurationError).message).toBe('Invalid configuration');
			expect((error as ConfigurationError).details).toEqual({ errors: validationError });
		});
	});

	describe('save', () => {
		it('should save config to file', async () => {
			const config = { ...DEFAULT_CONFIG, logging: { level: 'debug' } };

			await loader.save(config);

			expect(mockEnsureDir).toHaveBeenCalled();
			expect(mockWriteJSON).toHaveBeenCalledWith(path.join(tempDir, 'config.json'), config);
		});

		it('should handle save errors', async () => {
			const config = { ...DEFAULT_CONFIG };
			mockEnsureDir.mockResolvedValue(undefined);
			mockWriteJSON.mockRejectedValueOnce(new Error('Write failed'));

			const error = await loader.save(config).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ConfigurationError);
			expect((error as ConfigurationError).message).toContain('Failed to save config');
			expect((error as ConfigurationError).details).toEqual({ error: 'Write failed' });
		});
	});

	describe('reload', () => {
		it('should clear cache and reload config', async () => {
			await loader.load();

			const reloadedConfig = await loader.reload();

			expect(reloadedConfig.defaults).toEqual(DEFAULT_CONFIG.defaults);
		});
	});

	describe('environment variable loading', () => {
		it('should load LLM provider configs from environment', async () => {
			const originalEnv = process.env;

			// Set environment variables
			process.env['OPENAI_API_KEY'] = 'sk-test123';
			process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test456';
			process.env['AI_LOG_LEVEL'] = 'debug';
			process.env['AI_SESSION_TIMEOUT'] = '3600';

			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				defaults: { log_level: 'debug' },
				providers: {
					anthropic: { apiKey: 'sk-ant-test456' },
					openai: { apiKey: 'sk-test123' }
				},
				sessions: { timeout: 3600 }
			});

			const config = await loader.load();

			expect(config.providers.openai.apiKey).toBe('sk-test123');
			expect(config.providers.anthropic.apiKey).toBe('sk-ant-test456');
			expect(config.defaults.log_level).toBe('debug');

			// Restore environment
			process.env = originalEnv;
		});

		it('should handle missing environment variables gracefully', async () => {
			const originalEnv = process.env;

			delete process.env['AI_OPENAI_API_KEY'];
			delete process.env['AI_LOG_LEVEL'];

			const config = await loader.load();

			expect(config.defaults.log_level).toBe('info'); // falls back to DEFAULT_CONFIG value

			process.env = originalEnv;
		});
	});

	describe('CLI override handling', () => {
		it('should apply CLI overrides to config', async () => {
			const cliOverrides = {
				defaults: { log_level: 'debug' as const },
				sessions: { timeout: 7200 }
			};

			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				defaults: { ...DEFAULT_CONFIG.defaults, log_level: 'debug' },
				sessions: { ...DEFAULT_CONFIG.sessions, timeout: 7200 }
			});

			const config = await loader.load(cliOverrides);

			expect(config.defaults.log_level).toBe('debug');
			expect(config.sessions?.timeout).toBe(7200);
		});

		it('should merge CLI overrides with file config', async () => {
			const fileConfig = { defaults: { log_level: 'info' as const } };
			const cliOverrides = { defaults: { log_level: 'error' as const } };

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);
			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				defaults: { ...DEFAULT_CONFIG.defaults, log_level: 'error' }
			});

			const config = await loader.load(cliOverrides);

			expect(config.defaults.log_level).toBe('error'); // CLI override wins
		});
	});

	describe('error handling', () => {
		it('should provide detailed error context', async () => {
			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockRejectedValue(new Error('File corrupted'));

			await expect(loader.load()).rejects.toThrow(ConfigurationError);
		});

		it('should handle file system errors during save', async () => {
			const config = DEFAULT_CONFIG;

			mockEnsureDir.mockRejectedValue(new Error('Permission denied'));

			await expect(loader.save(config)).rejects.toThrow();
		});
	});

	describe('path resolution', () => {
		it('should resolve config path correctly', () => {
			const customPath = '/absolute/path/config.json';
			const loader = new ConfigLoader(customPath);

			expect(loader.getConfigPath()).toBe(customPath);
		});

		it('should handle relative paths', () => {
			const relativePath = 'configs/custom.json';
			const loader = new ConfigLoader(relativePath);

			expect(loader.getConfigPath()).toBe(relativePath);
		});
	});

	describe('caching behavior', () => {
		it('should cache loaded config', async () => {
			const config1 = await loader.load();
			const config2 = await loader.load();

			expect(config1).toBe(config2); // same reference — cache hit
		});

		it('should clear cache on reload', async () => {
			mockFileExists.mockReturnValue(false);

			await loader.load();
			const firstCallCount = mockFileExists.mock.calls.length;
			await loader.reload();

			// Reload should trigger the same number of fileExists calls again
			expect(mockFileExists).toHaveBeenCalledTimes(firstCallCount * 2);
		});
	});

	describe('unknown provider warnings', () => {
		it('emits a one-time warning for a provider key that has no registered descriptor', async () => {
			resetUnknownProviderWarningsForTests();

			const warnMock = vi.fn();
			vi.mocked(getLogger).mockReturnValue({
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				log: vi.fn(),
				warn: warnMock
			} as ReturnType<typeof getLogger>);

			// No descriptor registered for this provider
			vi.mocked(getProviderRegistry).mockReturnValue({
				getDescriptor: vi.fn(() => undefined)
			} as unknown as ReturnType<typeof getProviderRegistry>);

			mockFileExists.mockReturnValue(false);
			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				providers: { myplugin: { apiKey: 'test' } }
			});

			await loader.load();
			loader.warnUnknownProviders();

			expect(warnMock).toHaveBeenCalledWith(
				expect.stringContaining('"myplugin" is configured but no plugin registers it')
			);
		});

		it('emits the warning only once per provider name per process run', async () => {
			resetUnknownProviderWarningsForTests();

			const warnMock = vi.fn();
			vi.mocked(getLogger).mockReturnValue({
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				log: vi.fn(),
				warn: warnMock
			} as ReturnType<typeof getLogger>);

			// No descriptor registered for this provider
			vi.mocked(getProviderRegistry).mockReturnValue({
				getDescriptor: vi.fn(() => undefined)
			} as unknown as ReturnType<typeof getProviderRegistry>);

			mockFileExists.mockReturnValue(false);
			mockConfigSchemaParse.mockReturnValue({
				...DEFAULT_CONFIG,
				providers: { unknownprovider: { apiKey: 'x' } }
			});

			// Load twice (simulating two load calls within the same process)
			await loader.load();
			loader.warnUnknownProviders();
			await loader.reload();
			loader.warnUnknownProviders();

			const warningCalls = warnMock.mock.calls.filter((call) => String(call[0]).includes('"unknownprovider"'));
			expect(warningCalls).toHaveLength(1);
		});
	});
});
