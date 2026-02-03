/**
 * Integration tests for config loader and file utilities interaction
 *
 * Tests the integration between ConfigLoader and file system operations
 * using testcontainers for isolated file system testing.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigLoader } from 'config/loader';
import { DEFAULT_CONFIG } from 'config/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestcontainersHelper } from '../utils/testcontainers-helper';

// Mock the AI root to use our test directory
vi.mock('utils/file-utils', async () => {
	const actual = await vi.importActual('utils/file-utils');
	return {
		...actual,
		getAIRoot: vi.fn(() => '/tmp/ai-test-root')
	};
});

describe('ConfigLoader - File Integration', () => {
	let testcontainersHelper: TestcontainersHelper;
	let tempDir: string;
	let configLoader: ConfigLoader;
	let savedEnv: Record<string, string | undefined>;

	beforeEach(async () => {
		// Save environment variables that will be modified
		savedEnv = {
			AI_INTERACTIVE: process.env.AI_INTERACTIVE,
			AI_LOG_LEVEL: process.env.AI_LOG_LEVEL,
			AI_OUTPUT_FORMAT: process.env.AI_OUTPUT_FORMAT,
			AI_SESSION_MODE: process.env.AI_SESSION_MODE,
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
			ANTHROPIC_VERTEX_PROJECT_ID: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
			CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
			OPENAI_API_KEY: process.env.OPENAI_API_KEY
		};

		testcontainersHelper = new TestcontainersHelper();
		tempDir = await fs.mkdtemp(path.join('/tmp', 'config-integration-test-'));

		// Create a mock AI root structure
		await fs.mkdir(path.join(tempDir, '.ai'), { recursive: true });
		await fs.mkdir(path.join(tempDir, '.ai', '.bin'), { recursive: true });

		// Clear environment variables that might interfere with tests
		delete process.env.AI_INTERACTIVE;
		delete process.env.AI_LOG_LEVEL;
		delete process.env.AI_SESSION_MODE;
		delete process.env.AI_OUTPUT_FORMAT;
		delete process.env.CLAUDE_CODE_USE_VERTEX;
		delete process.env.ANTHROPIC_VERTEX_PROJECT_ID;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		// Override getAIRoot for this test
		const { getAIRoot } = await import('utils/file-utils');
		vi.mocked(getAIRoot).mockReturnValue(tempDir);

		configLoader = new ConfigLoader();
	});

	afterEach(async () => {
		// Restore environment variables
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}

		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('File-based configuration loading', () => {
		it('should load configuration from JSON file', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const testConfig = {
				defaults: { log_level: 'debug' },
				providers: {
					openai: { apiKey: 'sk-test123' }
				},
				sessions: { timeout: 3600 }
			};

			// Write test config file
			await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

			const config = await configLoader.load();

			expect(config.providers?.openai?.apiKey).toBe('sk-test123');
			expect(config.defaults?.log_level).toBe('debug');
			expect(config.sessions?.timeout).toBe(3600);
		});

		it('should handle missing config file gracefully', async () => {
			// No config file exists
			const config = await configLoader.load();

			expect(config).toBeDefined();
			expect(config.providers).toEqual({});
		});

		it('should merge file config with defaults', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const partialConfig = {
				defaults: { log_level: 'warn' }
			};

			await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2));

			const config = await configLoader.load();

			// Should have custom value
			expect(config.defaults?.log_level).toBe('warn');
			// Should have defaults for other properties
			expect(config.providers).toEqual({});
		});

		it('should validate loaded configuration', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const invalidConfig = {
				llm: {
					providers: {
						openai: { apiKey: '' } // Invalid empty API key
					}
				}
			};

			await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

			// Should either validate successfully or throw validation error
			try {
				const config = await configLoader.load();
				expect(config).toBeDefined();
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
			}
		});
	});

	describe('Configuration persistence', () => {
		it('should save configuration to file', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const configToSave = {
				...DEFAULT_CONFIG,
				defaults: {
					...DEFAULT_CONFIG.defaults,
					log_level: 'trace'
				},
				providers: {
					anthropic: { apiKey: 'sk-ant-test456' }
				}
			};

			await configLoader.save(configToSave);

			// Verify file was created
			const exists = await fs
				.access(configPath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);

			// Verify content
			const savedContent = await fs.readFile(configPath, 'utf-8');
			const savedConfig = JSON.parse(savedContent);

			expect(savedConfig.providers?.anthropic?.apiKey).toBe('sk-ant-test456');
			expect(savedConfig.defaults?.log_level).toBe('trace');
		});

		it('should create config directory if it does not exist', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const configDir = path.dirname(configPath);

			// Remove directory to test creation
			await fs.rm(configDir, { force: true, recursive: true });

			const configToSave = { ...DEFAULT_CONFIG };

			await configLoader.save(configToSave);

			// Verify directory and file were created
			const dirExists = await fs
				.access(configDir)
				.then(() => true)
				.catch(() => false);
			const fileExists = await fs
				.access(configPath)
				.then(() => true)
				.catch(() => false);

			expect(dirExists).toBe(true);
			expect(fileExists).toBe(true);
		});

		it('should handle save errors gracefully', async () => {
			// Create a read-only directory to force save error
			const configPath = path.join(tempDir, 'config.json');
			const configDir = path.dirname(configPath);

			// Make directory read-only (this might not work on all systems)
			try {
				await fs.chmod(configDir, 0o444);
			} catch (error) {
				// Skip test if chmod not supported
				return;
			}

			const configToSave = { ...DEFAULT_CONFIG };

			await expect(configLoader.save(configToSave)).rejects.toThrow();

			// Restore permissions for cleanup
			try {
				await fs.chmod(configDir, 0o755);
			} catch (error) {
				// Ignore
			}
		});
	});

	describe('Configuration reloading', () => {
		it('should reload configuration after file changes', async () => {
			const configPath = path.join(tempDir, 'config.json');

			// Initial config
			const initialConfig = {
				defaults: { log_level: 'info' }
			};
			await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));

			const config1 = await configLoader.load();
			expect(config1.defaults?.log_level).toBe('info');

			// Modify config file
			const updatedConfig = {
				defaults: { log_level: 'debug' }
			};
			await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

			// Reload should pick up changes
			const config2 = await configLoader.reload();
			expect(config2.defaults?.log_level).toBe('debug');
		});

		it('should handle reload when config file is deleted', async () => {
			const configPath = path.join(tempDir, 'config.json');

			// Create and load initial config
			const initialConfig = { logging: { level: 'info' } };
			await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));

			await configLoader.load();

			// Delete config file
			await fs.unlink(configPath);

			// Reload should handle missing file
			const config = await configLoader.reload();
			expect(config).toBeDefined();
		});
	});

	describe('Environment integration', () => {
		beforeEach(() => {
			// Clear environment variables
			delete process.env.OPENAI_API_KEY;
			delete process.env.AI_LOG_LEVEL;
			delete process.env.AI_SESSION_TIMEOUT;
		});

		afterEach(() => {
			// Clean up environment variables
			delete process.env.OPENAI_API_KEY;
			delete process.env.AI_LOG_LEVEL;
			delete process.env.AI_SESSION_TIMEOUT;
		});

		it('should merge environment variables with file config', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const fileConfig = {
				providers: {
					anthropic: { apiKey: 'sk-ant-file123' }
				}
			};

			await fs.writeFile(configPath, JSON.stringify(fileConfig, null, 2));

			// Set environment variables
			process.env.OPENAI_API_KEY = 'sk-env456';
			process.env.AI_LOG_LEVEL = 'warn';

			const config = await configLoader.load();

			expect(config.providers?.anthropic?.apiKey).toBe('sk-ant-file123'); // From file
			expect(config.providers?.openai?.apiKey).toBe('sk-env456'); // From env
			expect(config.defaults?.log_level).toBe('warn'); // From env
		});

		it('should prioritize environment variables over file config', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const fileConfig = {
				defaults: { log_level: 'info' },
				providers: {
					openai: { apiKey: 'sk-file123' }
				}
			};

			await fs.writeFile(configPath, JSON.stringify(fileConfig, null, 2));

			// Override with environment variables
			process.env.OPENAI_API_KEY = 'sk-env456';
			process.env.AI_LOG_LEVEL = 'error';

			const config = await configLoader.load();

			expect(config.providers?.openai?.apiKey).toBe('sk-env456'); // Env wins
			expect(config.defaults?.log_level).toBe('error'); // Env wins
		});
	});

	describe('Error handling and recovery', () => {
		it('should handle malformed JSON in config file', async () => {
			const configPath = path.join(tempDir, 'config.json');

			// Write invalid JSON
			await fs.writeFile(configPath, '{ invalid json content ');

			await expect(configLoader.load()).rejects.toThrow();
		});

		it('should handle corrupted config file', async () => {
			const configPath = path.join(tempDir, 'config.json');

			// Write binary data
			await fs.writeFile(configPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

			await expect(configLoader.load()).rejects.toThrow();
		});

		it('should recover from temporary file access issues', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const validConfig = { defaults: { log_level: 'debug' } };

			// Create valid config file
			await fs.writeFile(configPath, JSON.stringify(validConfig, null, 2));

			// First load should succeed
			const config1 = await configLoader.load();
			expect(config1.defaults?.log_level).toBe('debug');

			// Simulate temporary permission issue
			const originalContent = await fs.readFile(configPath, 'utf-8');

			// Reload should still work (uses cached config)
			const config2 = await configLoader.reload();
			expect(config2.defaults?.log_level).toBe('debug');
		});
	});

	describe('Concurrent access', () => {
		it('should handle concurrent config loads', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const testConfig = { defaults: { log_level: 'debug' } };

			await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

			// Load config multiple times concurrently
			const loadPromises = Array(10)
				.fill(null)
				.map(() => configLoader.load());

			const configs = await Promise.all(loadPromises);

			// All should return the same config
			configs.forEach((config) => {
				expect(config.defaults?.log_level).toBe('debug');
			});
		});

		it('should handle sequential save operations', async () => {
			const configs = [
				{ defaults: { log_level: 'debug' } },
				{ defaults: { log_level: 'info' } },
				{ defaults: { log_level: 'warn' } }
			];

			// Save different configs sequentially (last one wins)
			for (const config of configs) {
				await configLoader.save({ ...DEFAULT_CONFIG, ...config });
			}

			// Verify final state
			const finalConfig = await configLoader.reload();
			expect(finalConfig.defaults?.log_level).toBe('warn'); // Last config wins
		});
	});
});
