/**
 * Integration tests for Provider Fallback Flow
 *
 * Uses real CommandLoader, CLIProviderResolver, ProviderFallbackService, and CommandResolver.
 * Only system boundaries are mocked: file I/O (utils/file-utils), config loader, and logger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuiltinProviders } from 'config/providers.config';
import { CommandLoader } from 'executor/command-loader';
import { fileExists, readFile } from 'utils/file-utils';

import { CommandResolver } from 'cli/command-resolver';
import { ResolutionPath } from 'cli/provider-fallback-service';
import { CLIProviderResolver } from 'cli/provider-resolver';

// Import providers to trigger self-registration with the LLM registry
import 'llm/providers';

// --- Mutable config controlled per test ---
let mockProviderConfig: { providers: Record<string, unknown> } = { providers: {} };

// --- System boundary mocks ---

vi.mock('output/logger', () => ({
	getLogger: () => ({
		always: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('config/loader', () => ({
	getConfigLoader: () => ({
		get: () => mockProviderConfig,
		load: () => Promise.resolve(mockProviderConfig)
	})
}));

vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		fileExists: vi.fn().mockReturnValue(true),
		readFile: vi.fn().mockResolvedValue(makeCommandMarkdown('claude-sonnet-4.5'))
	};
});

function makeCommandMarkdown(model: string): string {
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
	let commandLoader: CommandLoader;
	let providerResolver: CLIProviderResolver;
	let commandResolver: CommandResolver;

	beforeEach(() => {
		vi.clearAllMocks();
		mockProviderConfig = { providers: {} };
		// Return command markdown for command .md files; throw for anything else (e.g. templates)
		// so CursorProvider's formatGuidedPrompt activates its inline fallback format.
		vi.mocked(readFile).mockImplementation(async (filePath: string) => {
			if (String(filePath).endsWith('test.md')) return makeCommandMarkdown('claude-sonnet-4.5');
			throw new Error(`readFile: unexpected path in test: ${filePath}`);
		});
		vi.mocked(fileExists).mockReturnValue(true);

		commandLoader = new CommandLoader();
		providerResolver = new CLIProviderResolver();
		commandResolver = new CommandResolver(commandLoader, providerResolver);
	});

	afterEach(() => {
		delete process.env['AI_MCP_ENABLED'];
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

			// Proves CommandLoader parsed the real mock markdown rather than receiving a pre-built object
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
			mockProviderConfig = {
				providers: {
					anthropic: { apiKey: 'sk-ant-test-key', default_model: 'claude-sonnet-4.5' }
				}
			};

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
			vi.mocked(readFile).mockResolvedValue(makeCommandMarkdown('gpt-4'));
			mockProviderConfig = {
				providers: {
					openai: { apiKey: 'sk-openai-test-key', default_model: 'gpt-4' }
				}
			};

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.OPENAI);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});

		it('should prefer Anthropic over OpenAI when both are configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			mockProviderConfig = {
				providers: {
					anthropic: { apiKey: 'sk-ant-key', default_model: 'claude-sonnet-4.5' },
					openai: { apiKey: 'sk-openai-key', default_model: 'gpt-4' }
				}
			};

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Non-MCP Context (Traditional Provider Resolution)', () => {
		it('should resolve provider from model name when not in MCP context', async () => {
			process.env['AI_MCP_ENABLED'] = 'false';
			mockProviderConfig = {
				providers: {
					anthropic: { apiKey: 'sk-ant-direct', default_model: 'claude-sonnet-4.5' }
				}
			};

			const result = await commandResolver.resolveCommand('test', { args: [], flags: {} });

			// 'claude-sonnet-4.5' maps to Anthropic via keyword matching
			expect(result.providerName).toBe(BuiltinProviders.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Explicit Provider Override', () => {
		it('should use the explicitly requested provider over cursor auto-selection', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			vi.mocked(readFile).mockResolvedValue(makeCommandMarkdown('gpt-4'));
			mockProviderConfig = {
				providers: {
					openai: { apiKey: 'sk-openai-explicit', default_model: 'gpt-4' }
				}
			};

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
			vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: file not found'));

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
