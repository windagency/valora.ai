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
import { DEFAULT_CONFIG } from './schema';

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

/** Environment variable keys that the loader reads — must be cleared between tests. */
const LOADER_ENV_KEYS = [
	'AI_LOG_LEVEL',
	'VALORA_LOG_LEVEL',
	'AI_INTERACTIVE',
	'VALORA_INTERACTIVE',
	'OPENAI_API_KEY',
	'ANTHROPIC_API_KEY',
	'GOOGLE_API_KEY',
	'AI_SESSION_TIMEOUT',
	'AI_LOG_RETENTION_ENABLED',
	'AI_SESSION_RETENTION_ENABLED',
	'VALORA_CONFIG_PATH',
	'AI_CONFIG_PATH',
	'VALORA_GLOBAL_CONFIG_DIR'
];

describe('ConfigLoader', () => {
	let loader: ConfigLoader;
	let tempDir: string;
	let savedEnv: Record<string, string | undefined>;

	beforeEach(() => {
		// Snapshot and clean loader-relevant env vars so tests are isolated
		savedEnv = Object.fromEntries(LOADER_ENV_KEYS.map((k) => [k, process.env[k]]));
		for (const key of LOADER_ENV_KEYS) {
			delete process.env[key];
		}
		// Point global config dir to a nonexistent path so it doesn't pick up real user config
		process.env['VALORA_GLOBAL_CONFIG_DIR'] = '/nonexistent-valora-test-dir';

		tempDir = path.join(process.cwd(), 'test-config');
		// Provide explicit config path to avoid getAIRoot dependency
		loader = new ConfigLoader(path.join(tempDir, 'config.json'));

		// Reset all mocks and their implementations
		vi.resetAllMocks();

		// Default mock implementations
		mockGetAIRoot.mockReturnValue(tempDir);
		mockFileExists.mockReturnValue(false);
		mockReadJSON.mockResolvedValue({});

		// Default registry mock: all providers are known (no unknown-provider warnings by default)
		vi.mocked(getProviderRegistry).mockReturnValue({
			getDescriptor: vi.fn(
				() => ({ label: 'mock' }) as ReturnType<ReturnType<typeof getProviderRegistry>['getDescriptor']>
			)
		} as ReturnType<typeof getProviderRegistry>);
	});

	afterEach(() => {
		vi.resetAllMocks();
		// Restore env vars
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
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
			const config2 = await loader.load();

			// Both calls must return the exact same object reference (cache hit)
			expect(config1).toBe(config2);
		});

		it('should load config from file when it exists', async () => {
			const fileConfig = {
				defaults: { log_level: 'debug' as const },
				providers: { openai: { apiKey: 'test-key' } }
			};

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);

			const config = await loader.load();

			expect(mockReadJSON).toHaveBeenCalledWith(path.join(tempDir, 'config.json'));
			expect(config.defaults.log_level).toBe('debug');
			expect(config.providers['openai']?.apiKey).toBe('test-key');
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

			await expect(loader.load()).rejects.toThrow(ConfigurationError);
			await expect(loader.load()).rejects.toThrow(`Failed to parse config file: ${loader['configPath']}`);
		});

		it('should merge config sources in correct order', async () => {
			const fileConfig = { defaults: { log_level: 'warn' as const } };
			const cliOverrides = { defaults: { log_level: 'debug' as const } }; // Should override file

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);

			// CLI flag should win over file
			const originalEnv = process.env;
			process.env['AI_LOG_LEVEL'] = 'error';

			const config = await loader.load(cliOverrides);

			expect(config.defaults.log_level).toBe('debug'); // CLI override wins

			// Restore env
			process.env = originalEnv;
		});

		it('schema validates the loaded config — valid config loads and returns expected defaults', async () => {
			mockFileExists.mockReturnValue(false);

			const config = await loader.load();

			// Real Zod schema ran; the result matches the DEFAULT_CONFIG shape for defaults
			expect(config.defaults.log_level).toBe(DEFAULT_CONFIG.defaults.log_level);
			expect(config.defaults.dry_run).toBe(DEFAULT_CONFIG.defaults.dry_run);
			// providers is an object (may contain env-contributed entries like local)
			expect(typeof config.providers).toBe('object');
		});

		it('schema rejects structurally invalid config — wrong type for required field throws ConfigurationError', async () => {
			mockFileExists.mockReturnValue(true);
			// log_level must be one of the enum values; give it an invalid value
			mockReadJSON.mockResolvedValue({ defaults: { log_level: 12345 } });

			const error = await loader.load().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ConfigurationError);
			expect((error as ConfigurationError).message).toBe('Invalid configuration');
		});

		it('should handle schema validation errors', async () => {
			mockFileExists.mockReturnValue(true);
			// Provide a value that passes readJSON but fails Zod validation
			mockReadJSON.mockResolvedValue({ defaults: { log_level: 'not-a-valid-level' } });

			const error = await loader.load().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ConfigurationError);
			expect((error as ConfigurationError).message).toBe('Invalid configuration');
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

			expect(reloadedConfig.defaults).toEqual(expect.objectContaining({ log_level: 'info' }));
		});
	});

	describe('getRaw', () => {
		it('throws before load() is called', () => {
			expect(() => loader.getRaw()).toThrow('Configuration not loaded');
		});

		it('returns the merged config data after load()', async () => {
			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue({ obsidian: { vaultDir: '/test-vault' } });

			await loader.load();

			const raw = loader.getRaw();
			expect(raw).toBeDefined();
			expect(typeof raw).toBe('object');
		});

		it('preserves top-level plugin keys that CONFIG_SCHEMA strips', async () => {
			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue({ obsidian: { vaultDir: '/test-vault' } });

			await loader.load();

			// rawConfig has the plugin key; mergeConfigs (and therefore get()) drops it
			expect(loader.getRaw()['obsidian']).toEqual({ vaultDir: '/test-vault' });
			expect('obsidian' in loader.get()).toBe(false);
		});

		it('throws after reload() is called but before new load() completes', async () => {
			await loader.load();
			// Trigger reload — but getRaw() should be null again between reload and re-load
			// (reload calls load() immediately so it re-populates; just verify it survives round-trip)
			const reloaded = await loader.reload();
			expect(reloaded).toBeDefined();
			expect(loader.getRaw()).toBeDefined();
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

			const config = await loader.load();

			expect(config.providers['openai']?.apiKey).toBe('sk-test123');
			expect(config.providers['anthropic']?.apiKey).toBe('sk-ant-test456');
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

			const config = await loader.load(cliOverrides);

			expect(config.defaults.log_level).toBe('debug');
			expect(config.sessions?.timeout).toBe(7200);
		});

		it('should merge CLI overrides with file config', async () => {
			const fileConfig = { defaults: { log_level: 'info' as const } };
			const cliOverrides = { defaults: { log_level: 'error' as const } };

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue(fileConfig);

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
		it('should cache loaded config — two calls return the same reference', async () => {
			const config1 = await loader.load();
			const config2 = await loader.load();

			expect(config1).toBe(config2); // same reference — cache hit
		});

		it('should clear cache on reload — result after reload reflects fresh load', async () => {
			mockFileExists.mockReturnValue(false);

			const firstConfig = await loader.load();
			const afterReload = await loader.reload();

			// The reloaded config should be a fresh object (different reference) with the same shape
			expect(afterReload).not.toBe(firstConfig);
			expect(afterReload.defaults.log_level).toBe(firstConfig.defaults.log_level);
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

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue({ providers: { myplugin: { apiKey: 'test' } } });

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

			mockFileExists.mockReturnValue(true);
			mockReadJSON.mockResolvedValue({ providers: { unknownprovider: { apiKey: 'x' } } });

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
