/**
 * Tests for Anthropic provider prompt caching functionality
 */

import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { AnthropicProvider } from './anthropic.provider';

/**
 * Helper to create a provider with given config
 */
function createProvider(config: Record<string, unknown> = {}): AnthropicProvider {
	return new AnthropicProvider(config);
}

describe('AnthropicProvider', () => {
	describe('applyCacheBreakpoints', () => {
		it('should not modify params when prompt_caching is disabled', () => {
			const provider = createProvider({ apiKey: 'test-key' });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: 'You are a helpful assistant.'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// System should remain a plain string
			expect(typeof params.system).toBe('string');
		});

		it('should not modify params when prompt_caching is not set', () => {
			const provider = createProvider({ apiKey: 'test-key' });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: 'You are a helpful assistant.'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			expect(typeof params.system).toBe('string');
		});

		it('should convert system prompt to TextBlockParam[] with cache_control when above threshold', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			// Create a system prompt that exceeds MIN_CACHEABLE_TOKENS (1024 tokens ~= 4096 chars)
			const longSystem = 'A'.repeat(5000);
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: longSystem
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			expect(Array.isArray(params.system)).toBe(true);
			const systemBlocks = params.system as Anthropic.TextBlockParam[];
			expect(systemBlocks).toHaveLength(1);
			expect(systemBlocks[0].type).toBe('text');
			expect(systemBlocks[0].text).toBe(longSystem);
			expect(systemBlocks[0].cache_control).toEqual({ type: 'ephemeral' });
		});

		it('should skip system prompt caching when below minimum token threshold', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			// Short system prompt below threshold
			const shortSystem = 'Be helpful.';
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: shortSystem
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// Should remain a string since it's below threshold
			expect(typeof params.system).toBe('string');
			expect(params.system).toBe(shortSystem);
		});

		it('should add cache_control to the last tool definition', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const tools = [
				{
					description: 'First tool',
					input_schema: { properties: {}, type: 'object' as const },
					name: 'tool_a'
				},
				{
					description: 'Second tool',
					input_schema: { properties: {}, type: 'object' as const },
					name: 'tool_b'
				}
			];
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				tools
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// First tool should NOT have cache_control
			expect((tools[0] as Record<string, unknown>)['cache_control']).toBeUndefined();
			// Last tool should have cache_control
			expect((tools[1] as Record<string, unknown>)['cache_control']).toEqual({ type: 'ephemeral' });
		});

		it('should add cache_control to the last user message before the final turn', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [
					{ content: 'First user message', role: 'user' as const },
					{ content: 'Assistant response', role: 'assistant' as const },
					{ content: 'Second user message', role: 'user' as const },
					{ content: 'Another assistant response', role: 'assistant' as const },
					{ content: 'Final user message', role: 'user' as const }
				],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// The second-to-last user message (index 2) should be converted to have cache_control
			const cachedMsg = params.messages[2];
			expect(Array.isArray(cachedMsg.content)).toBe(true);
			const blocks = cachedMsg.content as Anthropic.TextBlockParam[];
			expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
			expect(blocks[0].text).toBe('Second user message');

			// The final user message (index 4) should remain unchanged
			expect(typeof params.messages[4].content).toBe('string');
		});

		it('should handle array content in user messages when adding cache_control', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [
					{
						content: [
							{ text: 'Part one', type: 'text' as const },
							{ text: 'Part two', type: 'text' as const }
						],
						role: 'user' as const
					},
					{ content: 'Final message', role: 'user' as const }
				],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// The first message (before final) should have cache_control on last block
			const firstMsg = params.messages[0];
			const blocks = firstMsg.content as Anthropic.TextBlockParam[];
			expect((blocks[1] as Record<string, unknown>)['cache_control']).toEqual({ type: 'ephemeral' });
			// First block should not have cache_control
			expect((blocks[0] as Record<string, unknown>)['cache_control']).toBeUndefined();
		});

		it('should not add message cache when there is only one message', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Only message', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// Single message should remain unchanged
			expect(typeof params.messages[0].content).toBe('string');
		});

		it('should handle empty tools array without error', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				tools: []
			} as Anthropic.MessageCreateParamsNonStreaming;

			// Should not throw
			provider.applyCacheBreakpoints(params);
			expect(params.tools).toEqual([]);
		});
	});
});
