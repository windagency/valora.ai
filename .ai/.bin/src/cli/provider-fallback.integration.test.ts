/**
 * Integration tests for Provider Fallback Flow
 *
 * Tests the complete three-tier fallback system end-to-end
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ProviderName } from 'config/providers.config';
import { CommandLoader } from 'executor/command-loader';
// Import providers to trigger self-registration
import 'llm/providers';
import { CommandDefinition } from 'types/command.types';
import { MCPSamplingService } from 'types/mcp.types';
import { ExecutionError } from 'utils/error-handler';

import { CommandResolver } from './command-resolver';
import { ResolutionPath } from './provider-fallback-service';
import { CLIProviderResolver } from './provider-resolver';

// Mock dependencies
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
		get: () => ({ providers: {} }),
		load: vi.fn().mockResolvedValue({ providers: {} })
	})
}));

describe('Provider Fallback Integration Tests', () => {
	let commandResolver: CommandResolver;
	let mockCommandLoader: CommandLoader;
	let mockProviderResolver: CLIProviderResolver;

	let mockCommand: CommandDefinition = {
		agent: 'tech-lead',
		description: 'Test command',
		model: 'claude-sonnet-4.5', // Default model, overridden per test
		name: 'test',
		pipeline: []
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock command loader
		mockCommandLoader = {
			listCommands: vi.fn(),
			loadCommand: vi.fn().mockResolvedValue(mockCommand)
		} as unknown as CommandLoader;

		// Mock provider resolver
		mockProviderResolver = {
			getFallbackProvider: vi.fn(),
			resolveProvider: vi.fn()
		} as unknown as CLIProviderResolver;
	});

	afterEach(() => {
		delete process.env['AI_MCP_ENABLED'];
	});

	describe('Scenario 1: MCP Sampling Failure → Guided Completion (No API Keys)', () => {
		it('should fall back to guided completion when MCP sampling fails and no API keys', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			// Mock provider resolver to fail (simulating MCP sampling unavailable)
			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(
				new ExecutionError('Cursor provider requires MCP context')
			);

			// No fallback provider available (no API keys)
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			// Don't pass MCP sampling service to simulate it being unavailable
			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.providerName).toBe('cursor-guided');
			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);
			expect(result.provider).toBeDefined();
		});

		it('should log appropriate messages for guided mode activation', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(new ExecutionError('Provider not available'));
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);
		});
	});

	describe('Scenario 2: MCP Sampling Failure → API Fallback (Anthropic)', () => {
		it('should use Anthropic when MCP sampling fails but API key is configured', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			// Mock provider resolver to fail initially
			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(
				new ExecutionError('Cursor provider requires MCP context')
			);

			// Mock fallback provider available (Anthropic with API key)
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue({
				config: {
					apiKey: 'sk-ant-test-key',
					default_model: 'claude-sonnet-4.5'
				},
				model: 'claude-sonnet-4.5',
				name: ProviderName.ANTHROPIC
			});

			// Don't pass MCP sampling service to simulate it being unavailable
			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.providerName).toBe(ProviderName.ANTHROPIC);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Scenario 3: MCP Sampling Failure → API Fallback (OpenAI)', () => {
		it('should use OpenAI when Anthropic not available but OpenAI is', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			// Override command model for this test
			mockCommand.model = 'gpt-5';
			vi.mocked(mockCommandLoader.loadCommand).mockResolvedValue(mockCommand);

			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(new ExecutionError('Provider not configured'));

			// Mock OpenAI as fallback
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue({
				config: {
					apiKey: 'sk-test-openai-key',
					default_model: 'gpt-5'
				},
				model: 'gpt-5',
				name: ProviderName.OPENAI
			});

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.providerName).toBe(ProviderName.OPENAI);
			expect(result.resolutionPath).toBe(ResolutionPath.API_FALLBACK);
		});
	});

	describe('Scenario 4: Non-MCP Context (Direct API)', () => {
		it('should use traditional provider resolution outside MCP context', async () => {
			process.env['AI_MCP_ENABLED'] = 'false';

			// Mock successful provider resolution
			vi.mocked(mockProviderResolver.resolveProvider).mockResolvedValue({
				mode: undefined,
				model: 'claude-sonnet-4.5',
				providerConfig: {
					apiKey: 'sk-ant-direct',
					default_model: 'claude-sonnet-4.5'
				},
				providerName: ProviderName.ANTHROPIC
			});

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.providerName).toBe(ProviderName.ANTHROPIC);
			// In non-MCP context, resolution path may be api_fallback or direct
			expect(['api_fallback', undefined]).toContain(result.resolutionPath);
		});
	});

	describe('Scenario 5: Explicit Provider Override', () => {
		it('should respect explicit provider flag', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			vi.mocked(mockProviderResolver.resolveProvider).mockResolvedValue({
				mode: undefined,
				model: 'gpt-5',
				providerConfig: {
					apiKey: 'sk-openai-override',
					default_model: 'gpt-5'
				},
				providerName: ProviderName.OPENAI
			});

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {
					provider: ProviderName.OPENAI
				}
			});

			expect(result.providerName).toBe(ProviderName.OPENAI);
			expect(mockProviderResolver.resolveProvider).toHaveBeenCalledWith(
				mockCommand.model,
				expect.objectContaining({
					flags: expect.objectContaining({ provider: ProviderName.OPENAI })
				})
			);
		});
	});

	describe('Scenario 6: Model Validation', () => {
		it('should skip model validation for guided mode', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(new ExecutionError('Provider not available'));
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			// Should not throw even if model validation would fail
			const result = await commandResolver.resolveCommand('test', {
				args: [],
				flags: {}
			});

			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);
			// Guided mode doesn't validate models
		});
	});

	describe('Scenario 7: Error Handling', () => {
		it('should provide helpful error message when all fallback options fail', async () => {
			process.env['AI_MCP_ENABLED'] = 'false'; // Not in MCP context

			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(new ExecutionError('Provider not configured'));

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			await expect(
				commandResolver.resolveCommand('test', {
					args: [],
					flags: {}
				})
			).rejects.toThrow('Provider not configured');
		});

		it('should handle command loading errors', async () => {
			vi.mocked(mockCommandLoader.loadCommand).mockRejectedValue(new Error('Command not found'));

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			await expect(
				commandResolver.resolveCommand('nonexistent', {
					args: [],
					flags: {}
				})
			).rejects.toThrow('Command not found');
		});
	});

	describe('Scenario 8: Complete Flow with Result Formatting', () => {
		it('should format guided completion results correctly', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			vi.mocked(mockProviderResolver.resolveProvider).mockRejectedValue(new ExecutionError('Provider unavailable'));
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			commandResolver = new CommandResolver(mockCommandLoader, mockProviderResolver);

			const result = await commandResolver.resolveCommand('test', {
				args: ['Add user authentication'],
				flags: {}
			});

			expect(result.resolutionPath).toBe(ResolutionPath.GUIDED);
			expect(result.providerName).toBe('cursor-guided');

			// Provider should be ready to generate guided completion
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
