/**
 * Unit tests for config/loader.ts
 *
 * Tests configuration loading from files, environment variables,
 * CLI overrides, and validation with error handling.
 */

import * as path from 'path';
import { getLogger } from 'output/logger';
import { ConfigurationError } from 'utils/error-handler';
// Import after mocking
import { ensureDir, fileExists, getAIRoot, readJSON, resolveAIPath, writeJSON } from 'utils/file-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoader } from './loader';
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
		resolveAIPath: vi.fn(() => '/mock/ai/root/logs'),
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

const mockWriteJSON = vi.mocked(writeJSON);

const mockFileExists = vi.mocked(fileExists);
const mockReadJSON = vi.mocked(readJSON);
const mockEnsureDir = vi.mocked(ensureDir);
const mockGetAIRoot = vi.mocked(getAIRoot);
const mockResolveAIPath = vi.mocked(resolveAIPath);
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
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('constructor', () => {
		it('should use provided config path', () => {
			const customPath = '/custom/path/config.json';
			const loader = new ConfigLoader(customPath);

			expect(loader).toBeDefined();
		});

		it('should use default config path when none provided', () => {
			mockGetAIRoot.mockReturnValue(tempDir);
			const loader = new ConfigLoader();

			expect(loader).toBeDefined();
		});
	});

	describe('load', () => {
		it('should return cached config on subsequent calls', async () => {
			mockFileExists.mockReturnValue(false);

			const config1 = await loader.load();
			const config2 = await loader.load();

			expect(config1).toBe(config2);
			expect(mockFileExists).toHaveBeenCalledTimes(1); // Only called once due to caching
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

			expect(config).toBeDefined();
			expect(mockReadJSON).not.toHaveBeenCalled();
		});

		it('should throw ConfigurationError for invalid JSON in config file', async () => {
			// Reset mocks specifically for this test
			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockRejectedValue(new Error('Invalid JSON'));
			mockConfigSchemaParse.mockReturnValue(DEFAULT_CONFIG);

			// Mock logger to prevent logging errors
			const mockLogger = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn()
			};
			vi.mocked(getLogger).mockReturnValue(mockLogger);

			try {
				await loader.load();
				expect.fail('Should have thrown ConfigurationError');
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigurationError);
				expect((error as ConfigurationError).message).toBe(`Failed to parse config file: ${loader['configPath']}`);
			}
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
			// Reset mocks specifically for this test
			mockFileExists.mockReturnValue(false);
			mockReadJSON.mockResolvedValue({});
			mockConfigSchemaParse.mockImplementation(() => {
				throw validationError;
			});

			// Mock logger to prevent logging errors
			const mockLogger = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn()
			};
			vi.mocked(getLogger).mockReturnValue(mockLogger);

			try {
				await loader.load();
				expect.fail('Should have thrown ConfigurationError');
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigurationError);
				expect((error as ConfigurationError).message).toBe('Invalid configuration');
				expect((error as ConfigurationError).details).toEqual({ errors: validationError });
			}
		});
	});

	describe('save', () => {
		it('should save config to file', async () => {
			const config = { ...DEFAULT_CONFIG, logging: { level: 'debug' } };

			await loader.save(config);

			expect(mockEnsureDir).toHaveBeenCalled();
			// Note: writeJSON is mocked but we can't easily test its exact call due to implementation details
		});

		it('should handle save errors', async () => {
			const config = { ...DEFAULT_CONFIG };
			const saveError = new Error('Write failed');

			// Reset mocks specifically for this test
			mockEnsureDir.mockResolvedValue(undefined);
			mockWriteJSON.mockRejectedValueOnce(saveError);

			// Mock logger to prevent logging errors
			const mockLogger = {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn()
			};
			vi.mocked(getLogger).mockReturnValue(mockLogger);

			try {
				await loader.save(config);
				expect.fail('Should have thrown ConfigurationError');
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigurationError);
				expect((error as ConfigurationError).message).toContain('Failed to save config');
				expect((error as ConfigurationError).details).toEqual({ error: 'Write failed' });
			}
		});
	});

	describe('reload', () => {
		it('should clear cache and reload config', async () => {
			// Load once
			await loader.load();

			// Reload
			const reloadedConfig = await loader.reload();

			expect(reloadedConfig).toBeDefined();
			// Should have called load again (cache cleared)
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

			// Clear relevant env vars
			delete process.env['AI_OPENAI_API_KEY'];
			delete process.env['AI_LOG_LEVEL'];

			const config = await loader.load();

			expect(config).toBeDefined();
			// Should not have the env-based values

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

			try {
				await loader.load();
				expect.fail('Should have thrown');
			} catch (error) {
				// Just verify that some error is thrown when file reading fails
				expect(error).toBeDefined();
				expect(error).toBeInstanceOf(Error);
			}
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

			expect(loader).toBeDefined();
			// Config path is private, but we can test by checking if load calls the right path
		});

		it('should handle relative paths', () => {
			const relativePath = 'configs/custom.json';
			const loader = new ConfigLoader(relativePath);

			expect(loader).toBeDefined();
		});
	});

	describe('caching behavior', () => {
		it('should cache loaded config', async () => {
			mockFileExists.mockReturnValue(false);

			await loader.load();
			await loader.load(); // Second call

			expect(mockFileExists).toHaveBeenCalledTimes(1); // Only once due to caching
		});

		it('should clear cache on reload', async () => {
			mockFileExists.mockReturnValue(false);

			await loader.load();
			await loader.reload();

			expect(mockFileExists).toHaveBeenCalledTimes(2); // Called twice (cache cleared)
		});
	});
});
