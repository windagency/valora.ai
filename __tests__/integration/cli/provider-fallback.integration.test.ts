/**
 * Integration tests for Provider Fallback Flow
 *
 * Uses real CommandLoader, CLIProviderResolver, ProviderFallbackService, CommandResolver,
 * and ConfigLoader against real temp files on disk. Only `output/logger` (a true infra
 * boundary with no assertable behavior) and `utils/paths`'s global/project config directory
 * resolution (redirected to nonexistent paths, so the test never depends on or reads the
 * real machine's/project's ambient ~/.valora or .valora config) are mocked.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getConfigLoader } from 'config/loader';
import { BuiltinProviders } from 'config/providers.config';
import { CommandLoader } from 'executor/command-loader';
import { getResourceResolver, resetResourceResolver } from 'utils/resource-resolver';

import { CommandResolver } from 'cli/command-resolver';
import { ResolutionPath } from 'cli/provider-fallback-service';
import { CLIProviderResolver } from 'cli/provider-resolver';

// Import providers to trigger self-registration with the LLM registry
import 'llm/providers';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		always: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

// Real ConfigLoader still merges a global (~/.valora/config.json) and project (.valora/config.json)
// layer on top of the explicit package-level path given to getConfigLoader() below — redirect both
// to nonexistent directories so the test's provider config is exactly what each test writes, never
// whatever happens to exist on the machine running the suite.
vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return {
		...actual,
		getGlobalConfigDir: () => '/nonexistent-global-config-dir',
		getProjectConfigDir: () => null
	};
});

// Every env var `ConfigLoader.loadProvidersFromEnv()` reads — must be cleared per test so
// resolution only ever depends on what each test explicitly writes to the real config file,
// never on whatever happens to be set in the environment running the suite (e.g. this
// devcontainer sets a real LOCAL_BASE_URL, which would otherwise silently inject a 'local'
// provider and change which provider auto-migration selects).
const PROVIDER_ENV_KEYS = [
	'ANTHROPIC_API_KEY',
	'ANTHROPIC_DEFAULT_MODEL',
	'ANTHROPIC_VERTEX_PROJECT_ID',
	'CLAUDE_CODE_USE_VERTEX',
	'CLOUD_ML_REGION',
	'GOOGLE_API_KEY',
	'GOOGLE_DEFAULT_MODEL',
	'LOCAL_BASE_URL',
	'LOCAL_DEFAULT_MODEL',
	'MOONSHOT_API_KEY',
	'MOONSHOT_DEFAULT_MODEL',
	'OPENAI_API_KEY',
	'OPENAI_DEFAULT_MODEL',
	'XAI_API_KEY',
	'XAI_DEFAULT_MODEL'
] as const;

function commandMarkdown(model: string): string {
	return `---
name: test
description: Test command for integration tests
model: ${model}
agent: tech-lead
allowed-tools:
  - read
prompts:
  pipeline: []
---
Test command content.
`;
}

describe('Provider Fallback Integration Tests', () => {
	let commandsDir: string;
	let configDir: string;
	let configPath: string;
	let commandFilePath: string;
	let commandLoader: CommandLoader;
	let providerResolver: CLIProviderResolver;
	let commandResolver: CommandResolver;

	beforeAll(() => {
		commandsDir = mkdtempSync(join(tmpdir(), 'valora-provider-fallback-commands-'));
		configDir = mkdtempSync(join(tmpdir(), 'valora-provider-fallback-config-'));
		configPath = join(configDir, 'config.json');
		commandFilePath = join(commandsDir, 'test.md');

		// Registers commandsDir as an allowed command-discovery root (command-discovery's
		// validateCommandsDirectory() rejects any directory outside the package data dir,
		// project config dir, or a registered plugin dir).
		getResourceResolver().registerPluginDir(commandsDir);

		writeFileSync(configPath, JSON.stringify({ providers: {} }), 'utf8');
		// Establishes the ConfigLoader singleton pointed at our real temp config file — only the
		// first call's path takes effect (getConfigLoader caches), so this must run once, here.
		getConfigLoader(configPath);
	});

	afterAll(() => {
		resetResourceResolver();
		rmSync(commandsDir, { recursive: true, force: true });
		rmSync(configDir, { recursive: true, force: true });
	});

	async function setProviderConfig(config: { providers: Record<string, unknown> }): Promise<void> {
		writeFileSync(configPath, JSON.stringify(config), 'utf8');
		await getConfigLoader().reload();
	}

	let savedProviderEnv: Record<string, string | undefined>;

	beforeEach(async () => {
		savedProviderEnv = Object.fromEntries(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]));
		for (const key of PROVIDER_ENV_KEYS) delete process.env[key];

		writeFileSync(commandFilePath, commandMarkdown('claude-sonnet-4.5'), 'utf8');
		await setProviderConfig({ providers: {} });

		commandLoader = new CommandLoader(commandsDir);
		providerResolver = new CLIProviderResolver();
		commandResolver = new CommandResolver(commandLoader, providerResolver);
	});

	afterEach(() => {
		delete process.env['AI_MCP_ENABLED'];
		for (const key of PROVIDER_ENV_KEYS) {
			if (savedProviderEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedProviderEnv[key];
		}
	});

	describe('MCP Context → Guided Completion (No API Keys)', () => {
		it('should route to guided completion when no API keys are configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe('cursor-guided');
			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);
			expect(result.provider).toBeDefined();
		});

		it('should load and return the real command definition', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			// Proves CommandLoader parsed the real command markdown file from disk
			expect(result.command.name).toBe('test');
			expect(result.command.description).toBe('Test command for integration tests');
			expect(result.command.agent).toBe('tech-lead');
		});

		it('should skip model validation for guided mode', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			// Even though 'claude-sonnet-4.5' wouldn't validate against a cursor-guided provider,
			// guided mode bypasses validateModelAvailability entirely.
			await expect(commandResolver.resolveCommand('test', { args: [], flags: {} })).resolves.toMatchObject({
				resolutionPath: ResolutionPath.GUIDED
			});
		});
	});

	describe('MCP Context → API Fallback (Anthropic)', () => {
		it('should fall back to Anthropic when an API key is configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			await setProviderConfig({
				providers: {
					anthropic: { apiKey: 'sk-ant-test-key', default_model: 'claude-sonnet-4.5' }
				}
			});

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
			expect(result.provider).toBeDefined();
		});
	});

	describe('MCP Context → API Fallback (OpenAI, Anthropic not configured)', () => {
		it('should fall back to OpenAI when only OpenAI is configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			// Command uses a GPT model so OpenAI's validateModel accepts it
			writeFileSync(commandFilePath, commandMarkdown('gpt-4'), 'utf8');
			await setProviderConfig({
				providers: {
					openai: { apiKey: 'sk-openai-test-key', default_model: 'gpt-4' }
				}
			});

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.OPENAI);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});

		it('should prefer Anthropic over OpenAI when both are configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			await setProviderConfig({
				providers: {
					anthropic: { apiKey: 'sk-ant-key', default_model: 'claude-sonnet-4.5' },
					openai: { apiKey: 'sk-openai-key', default_model: 'gpt-4' }
				}
			});

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Non-MCP Context (Traditional Provider Resolution)', () => {
		it('should resolve provider from model name when not in MCP context', async () => {
			process.env['AI_MCP_ENABLED'] = 'false';
			await setProviderConfig({
				providers: {
					anthropic: { apiKey: 'sk-ant-direct', default_model: 'claude-sonnet-4.5' }
				}
			});

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			// 'claude-sonnet-4.5' maps to Anthropic via keyword matching
			expect(result.providerName).toBe(BuiltinProviders.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Explicit Provider Override', () => {
		it('should use the explicitly requested provider over cursor auto-selection', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			writeFileSync(commandFilePath, commandMarkdown('gpt-4'), 'utf8');
			await setProviderConfig({
				providers: {
					openai: { apiKey: 'sk-openai-explicit', default_model: 'gpt-4' }
				}
			});

			// --provider=openai bypasses cursor auto-selection in MCP context
			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: { provider: BuiltinProviders.OPENAI }
			});

			expect(result.providerName).toBe(BuiltinProviders.OPENAI);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Error Handling', () => {
		it('should throw when provider is not configured in non-MCP context', async () => {
			process.env['AI_MCP_ENABLED'] = 'false';
			// No providers configured — resolution must fail

			await expect(commandResolver.resolveCommand('test', { args: [], flags: {} })).rejects.toThrow(/not configured/i);
		});

		it('should throw when the command file cannot be loaded', async () => {
			rmSync(commandFilePath, { force: true });

			await expect(commandResolver.resolveCommand('test', { args: [], flags: {} })).rejects.toThrow(
				'Failed to load command: test'
			);
		});
	});

	describe('Complete Guided Completion Flow', () => {
		it('should produce a valid guided completion result when calling provider.complete()', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			const result = await commandResolver.resolveCommand('test', {
				args: ['Add user authentication'],
				flags: {}
			});

			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);

			const completion = await result.provider.complete({
				messages: [
					{ content: 'You are a tech lead', role: 'system' },
					{ content: 'Add user authentication', role: 'user' }
				]
			});

			expect(completion.guidedCompletion).toBeDefined();
			expect(completion.content).toContain('CURSOR GUIDED COMPLETION MODE');
			expect(completion.guidedCompletion?.systemPrompt).toContain('tech lead');
			expect(completion.guidedCompletion?.userPrompt).toContain('authentication');
		});
	});
});
