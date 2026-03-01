/**
 * Unit tests for CursorProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DEFAULT_MAX_TOKENS } from 'config/constants';
import { LLMCompletionOptions } from 'types/llm.types';
import { MCPSamplingService } from 'types/mcp.types';

import { CursorProvider } from './cursor.provider';

// Mock template loader
vi.mock('utils/template-loader', () => ({
	getTemplateLoader: () => ({
		renderTemplate: vi
			.fn()
			.mockResolvedValue(
				'═══════════════════════════════════════════════════════════════════════════\n' +
					'🎯 CURSOR GUIDED COMPLETION MODE (Zero Config!)\n' +
					'═══════════════════════════════════════════════════════════════════════════\n\n' +
					'✨ Good news! You can use your Cursor subscription - no API keys required!\n\n' +
					'VALORA has prepared structured prompts below.\n\n' +
					'═══════════════════════════════════════════════════════════════════════════\n' +
					'📋 SYSTEM INSTRUCTIONS\n' +
					'═══════════════════════════════════════════════════════════════════════════\n\n' +
					'{{systemPrompt}}\n\n' +
					'═══════════════════════════════════════════════════════════════════════════\n' +
					'💬 USER PROMPT\n' +
					'═══════════════════════════════════════════════════════════════════════════\n\n' +
					'{{userPrompt}}'
			)
	})
}));

describe('CursorProvider', () => {
	let provider: CursorProvider;

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
	});

	describe('Configuration', () => {
		it('should not be configured without MCP sampling service', () => {
			provider = new CursorProvider({}, undefined);
			expect(provider.isConfigured()).toBe(false);
		});

		it('should be configured with MCP sampling service', () => {
			const mockMCPSampling: MCPSamplingService = {
				requestSampling: vi.fn()
			};
			provider = new CursorProvider({}, mockMCPSampling);
			expect(provider.isConfigured()).toBe(true);
		});
	});

	describe('Model Validation', () => {
		beforeEach(() => {
			provider = new CursorProvider({}, undefined);
		});

		it('should validate known cursor models', async () => {
			expect(await provider.validateModel('cursor-sonnet-4.5')).toBe(true);
			expect(await provider.validateModel('cursor-gpt-4')).toBe(true);
			expect(await provider.validateModel('cursor-claude-3.5')).toBe(true);
		});

		it('should accept cursor-prefixed models', async () => {
			expect(await provider.validateModel('cursor-custom-model')).toBe(true);
		});

		it('should accept models with hyphens', async () => {
			expect(await provider.validateModel('some-model')).toBe(true);
		});

		it('should reject invalid model names', async () => {
			expect(await provider.validateModel('')).toBe(false);
			expect(await provider.validateModel('invalid')).toBe(false);
		});
	});

	describe('Alternative Models', () => {
		beforeEach(() => {
			provider = new CursorProvider({}, undefined);
		});

		it('should return alternative models', () => {
			const alternatives = provider.getAlternativeModels('cursor-sonnet-4.5');
			expect(alternatives).toBeInstanceOf(Array);
			expect(alternatives.length).toBeGreaterThan(0);
			expect(alternatives).not.toContain('cursor-sonnet-4.5');
		});

		it('should return all models when no current model specified', () => {
			const alternatives = provider.getAlternativeModels();
			expect(alternatives).toBeInstanceOf(Array);
			expect(alternatives.length).toBeGreaterThan(0);
		});
	});

	describe('Completion - Guided Mode (No MCP Sampling)', () => {
		beforeEach(() => {
			provider = new CursorProvider({}, undefined);
		});

		it('should return guided completion when MCP sampling is not available', async () => {
			const options: LLMCompletionOptions = {
				max_tokens: 1000,
				messages: [
					{ content: 'You are a helpful assistant', role: 'system' },
					{ content: 'Hello, how are you?', role: 'user' }
				],
				model: 'claude-sonnet-4.5'
			};

			const result = await provider.complete(options);

			expect(result.finish_reason).toBe('guided_completion');
			expect(result.guidedCompletion).toBeDefined();
			expect(result.guidedCompletion?.mode).toBe('guided');
			expect(result.guidedCompletion?.systemPrompt).toContain('helpful assistant');
			expect(result.guidedCompletion?.userPrompt).toContain('Hello');
			expect(result.content).toContain('CURSOR GUIDED COMPLETION MODE');
			expect(result.content).toContain('Zero Config!');
		});

		it('should include generation parameters in guided completion', async () => {
			const options: LLMCompletionOptions = {
				max_tokens: 2000,
				messages: [{ content: 'Test prompt', role: 'user' }],
				model: 'test-model',
				temperature: 0.5
			};

			const result = await provider.complete(options);

			expect(result.guidedCompletion?.context).toMatchObject({
				maxTokens: 2000,
				model: 'test-model',
				temperature: 0.5,
				useCursorSubscription: true
			});
		});

		it('should handle default values in guided completion', async () => {
			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test', role: 'user' }]
			};

			const result = await provider.complete(options);

			expect(result.guidedCompletion?.context.maxTokens).toBe(DEFAULT_MAX_TOKENS);
			expect(result.guidedCompletion?.context.temperature).toBeUndefined();
			expect(result.guidedCompletion?.mode).toBe('guided');
		});

		it('should format multiple user messages', async () => {
			const options: LLMCompletionOptions = {
				messages: [
					{ content: 'First message', role: 'user' },
					{ content: 'Second message', role: 'user' }
				]
			};

			const result = await provider.complete(options);

			expect(result.guidedCompletion?.userPrompt).toContain('First message');
			expect(result.guidedCompletion?.userPrompt).toContain('Second message');
		});
	});

	describe('Completion - MCP Sampling Mode', () => {
		let mockMCPSampling: MCPSamplingService;

		beforeEach(() => {
			mockMCPSampling = {
				requestSampling: vi.fn()
			};
			provider = new CursorProvider({}, mockMCPSampling);
		});

		it('should use MCP sampling when available and successful', async () => {
			const mockResponse = {
				content: 'Test response from MCP',
				model: 'cursor-model',
				stopReason: 'stop'
			};

			vi.mocked(mockMCPSampling.requestSampling).mockResolvedValue(mockResponse);

			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test prompt', role: 'user' }],
				model: 'claude-sonnet-4.5'
			};

			const result = await provider.complete(options);

			expect(result.content).toBe('Test response from MCP');
			expect(result.finish_reason).toBe('stop');
			expect(result.role).toBe('assistant');
			expect(mockMCPSampling.requestSampling).toHaveBeenCalledTimes(1);
		});

		it('should pass correct parameters to MCP sampling', async () => {
			vi.mocked(mockMCPSampling.requestSampling).mockResolvedValue({
				content: 'Response',
				stopReason: 'stop'
			});

			const options: LLMCompletionOptions = {
				max_tokens: 1500,
				messages: [
					{ content: 'System prompt', role: 'system' },
					{ content: 'User message', role: 'user' }
				],
				model: 'test-model',
				stop: ['STOP'],
				temperature: 0.8
			};

			await provider.complete(options);

			expect(mockMCPSampling.requestSampling).toHaveBeenCalledWith(
				expect.objectContaining({
					maxTokens: 1500,
					messages: [{ content: 'User message', role: 'user' }],
					modelPreferences: expect.objectContaining({
						hints: [{ name: 'test-model' }],
						intelligencePriority: 0.8
					}),
					stopSequences: ['STOP'],
					systemPrompt: 'System prompt',
					temperature: 0.8
				})
			);
		});

		it('should fall back to guided completion when MCP sampling fails with "Method not found"', async () => {
			const mcpError = new Error('MCP error -32601: Method not found');
			vi.mocked(mockMCPSampling.requestSampling).mockRejectedValue(mcpError);

			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test', role: 'user' }]
			};

			const result = await provider.complete(options);

			expect(result.finish_reason).toBe('guided_completion');
			expect(result.guidedCompletion).toBeDefined();
			expect(result.content).toContain('CURSOR GUIDED COMPLETION MODE');
		});

		it('should fall back to guided completion on any MCP sampling error', async () => {
			vi.mocked(mockMCPSampling.requestSampling).mockRejectedValue(new Error('Connection failed'));

			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test', role: 'user' }]
			};

			const result = await provider.complete(options);

			expect(result.finish_reason).toBe('guided_completion');
			expect(result.guidedCompletion).toBeDefined();
		});
	});

	describe('Stream Completion', () => {
		it('should fall back to non-streaming for guided completion', async () => {
			provider = new CursorProvider({}, undefined);
			const chunks: Array<string> = [];

			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test', role: 'user' }]
			};

			const result = await provider.streamComplete(options, (chunk) => {
				chunks.push(chunk);
			});

			expect(result.guidedCompletion).toBeDefined();
			expect(chunks.length).toBe(1);
			expect(chunks[0]).toContain('CURSOR GUIDED COMPLETION MODE');
		});

		it('should call onChunk with full content', async () => {
			provider = new CursorProvider({}, undefined);
			let capturedChunk = '';

			const options: LLMCompletionOptions = {
				messages: [{ content: 'Test', role: 'user' }]
			};

			await provider.streamComplete(options, (chunk) => {
				capturedChunk = chunk;
			});

			expect(capturedChunk).toContain('CURSOR GUIDED COMPLETION MODE');
		});
	});
});
