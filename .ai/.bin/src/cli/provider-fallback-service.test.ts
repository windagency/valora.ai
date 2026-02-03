/**
 * Unit tests for ProviderFallbackService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ProviderName } from 'config/providers.config';
import { getProviderRegistry } from 'llm/registry';
import { LLMProvider } from 'types/llm.types';
import { MCPSamplingService, ProviderConfig } from 'types/index';

import { ProviderFallbackService } from './provider-fallback-service';
import { CLIProviderResolver } from './provider-resolver';

// Mock dependencies
vi.mock('llm/registry');
vi.mock('./provider-resolver');
vi.mock('llm/providers/cursor.provider', () => ({
	CursorProvider: class MockCursorProvider {
		isConfigured() {
			return false;
		}
	}
}));

describe('ProviderFallbackService', () => {
	let service: ProviderFallbackService;
	let mockProviderResolver: CLIProviderResolver;
	let mockProviderRegistry: ReturnType<typeof getProviderRegistry>;
	let mockProvider: LLMProvider;

	beforeEach(() => {
		// Set up mock provider
		mockProvider = {
			complete: vi.fn(),
			getAlternativeModels: vi.fn(),
			isConfigured: vi.fn().mockReturnValue(true),
			name: 'mock-provider',
			streamComplete: vi.fn(),
			validateModel: vi.fn()
		};

		// Set up mock provider registry
		mockProviderRegistry = {
			createProvider: vi.fn().mockReturnValue(mockProvider),
			getAvailableProviders: vi.fn().mockReturnValue(['anthropic', 'openai', 'google'])
		};
		vi.mocked(getProviderRegistry).mockReturnValue(mockProviderRegistry);

		// Set up mock provider resolver
		mockProviderResolver = {
			getFallbackProvider: vi.fn(),
			resolveProvider: vi.fn(),
			shouldUseGuidedCompletion: vi.fn()
		} as unknown as CLIProviderResolver;

		service = new ProviderFallbackService(mockProviderResolver, mockProviderRegistry);
	});

	afterEach(() => {
		vi.clearAllMocks();
		delete process.env['AI_MCP_ENABLED'];
	});

	describe('Tier 1: MCP Sampling', () => {
		it('should use MCP sampling when provider is cursor and MCP is available', async () => {
			const mockMCPSampling: MCPSamplingService = {
				requestSampling: vi.fn()
			};

			const mockCursorProvider = {
				...mockProvider,
				isConfigured: vi.fn().mockReturnValue(true),
				name: ProviderName.CURSOR
			};

			vi.mocked(mockProviderRegistry.createProvider).mockReturnValue(mockCursorProvider);

			const result = await service.resolveWithFallback(
				{
					inMCPContext: true,
					providerConfig: {},
					providerName: ProviderName.CURSOR
				},
				mockMCPSampling
			);

			expect(result.resolutionPath).toBe('mcp');
			expect(result.providerName).toBe(ProviderName.CURSOR);
			expect(result.provider).toBe(mockCursorProvider);
			expect(mockProviderRegistry.createProvider).toHaveBeenCalledWith(ProviderName.CURSOR, {}, mockMCPSampling);
		});

		it('should fall through to tier 2/3 if cursor provider is not configured', async () => {
			const mockMCPSampling: MCPSamplingService = {
				requestSampling: vi.fn()
			};

			const mockCursorProvider = {
				...mockProvider,
				isConfigured: vi.fn().mockReturnValue(false),
				name: ProviderName.CURSOR
			};

			vi.mocked(mockProviderRegistry.createProvider).mockReturnValue(mockCursorProvider);
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			const result = await service.resolveWithFallback(
				{
					inMCPContext: true,
					providerConfig: {},
					providerName: ProviderName.CURSOR
				},
				mockMCPSampling
			);

			// Should fall to guided mode (tier 2)
			expect(result.resolutionPath).toBe('guided');
		});
	});

	describe('Tier 2: Guided Completion Mode', () => {
		it('should use guided mode in MCP context with no API keys', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			// No fallback provider available (no API keys)
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			const result = await service.resolveWithFallback({
				inMCPContext: true,
				providerConfig: {},
				providerName: ProviderName.ANTHROPIC
			});

			expect(result.resolutionPath).toBe('guided');
			expect(result.providerName).toBe('cursor-guided');
			expect(result.fallbackReason).toBe('mcp_sampling_unavailable_using_guided_mode');
		});

		it('should provide helpful fallback reason for guided mode', async () => {
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			const result = await service.resolveWithFallback({
				inMCPContext: true,
				providerConfig: {},
				providerName: ProviderName.CURSOR
			});

			expect(result.fallbackReason).toContain('guided_mode');
		});
	});

	describe('Tier 3: API Key Fallback', () => {
		it('should use API fallback in MCP context when API keys are configured', async () => {
			const mockFallbackConfig: ProviderConfig = {
				apiKey: 'test-key',
				default_model: 'claude-sonnet-4.5'
			};

			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue({
				config: mockFallbackConfig,
				model: 'claude-sonnet-4.5',
				name: ProviderName.ANTHROPIC
			});

			const result = await service.resolveWithFallback({
				inMCPContext: true,
				providerConfig: {},
				providerName: ProviderName.CURSOR
			});

			expect(result.resolutionPath).toBe('api_fallback');
			expect(result.providerName).toBe(ProviderName.ANTHROPIC);
			expect(result.fallbackReason).toBe('mcp_sampling_unavailable_using_api_keys');
			expect(mockProviderRegistry.createProvider).toHaveBeenCalledWith(
				ProviderName.ANTHROPIC,
				mockFallbackConfig,
				undefined
			);
		});

		it('should pass MCP sampling service to API fallback provider', async () => {
			const mockMCPSampling: MCPSamplingService = {
				requestSampling: vi.fn()
			};

			const mockFallbackConfig: ProviderConfig = {
				apiKey: 'test-key'
			};

			// Make Tier 1 (MCP Sampling) fail by returning isConfigured: false
			const unconfiguredCursorProvider = {
				...mockProvider,
				isConfigured: vi.fn().mockReturnValue(false),
				name: ProviderName.CURSOR
			};

			// First call (Tier 1 MCP) returns unconfigured provider
			// Second call (Tier 3 API fallback) returns the configured mock provider
			vi.mocked(mockProviderRegistry.createProvider)
				.mockReturnValueOnce(unconfiguredCursorProvider)
				.mockReturnValueOnce(mockProvider);

			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue({
				config: mockFallbackConfig,
				model: 'gpt-4',
				name: ProviderName.OPENAI
			});

			// Use cursor as providerName to trigger fallback resolution
			// When in MCP context with cursor provider but MCP not configured,
			// getFallbackProvider() returns the best available provider (openai in this case)
			await service.resolveWithFallback(
				{
					inMCPContext: true,
					providerConfig: {},
					providerName: ProviderName.CURSOR
				},
				mockMCPSampling
			);

			// The implementation uses getFallbackProvider() which returns 'openai' as the best available provider
			expect(mockProviderRegistry.createProvider).toHaveBeenCalledWith(
				ProviderName.OPENAI,
				mockFallbackConfig,
				mockMCPSampling
			);
		});
	});

	describe('Non-MCP Context', () => {
		it('should use traditional provider resolution outside MCP context', async () => {
			const providerConfig = {
				apiKey: 'direct-key',
				default_model: 'test-model'
			};

			const result = await service.resolveWithFallback({
				inMCPContext: false,
				providerConfig,
				providerName: ProviderName.ANTHROPIC
			});

			expect(result.resolutionPath).toBe('api_fallback');
			expect(result.providerName).toBe(ProviderName.ANTHROPIC);
			expect(result.fallbackReason).toBeUndefined();
			expect(mockProviderRegistry.createProvider).toHaveBeenCalledWith(
				ProviderName.ANTHROPIC,
				providerConfig,
				undefined
			);
		});
	});

	describe('shouldUseGuidedCompletion', () => {
		it('should return false when not in MCP context', async () => {
			process.env['AI_MCP_ENABLED'] = 'false';
			const result = await service.shouldUseGuidedCompletion();
			expect(result).toBe(false);
		});

		it('should return false when in MCP context with API keys', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue({
				config: { apiKey: 'key' } as ProviderConfig,
				name: ProviderName.ANTHROPIC
			});

			const result = await service.shouldUseGuidedCompletion();
			expect(result).toBe(false);
		});

		it('should return true when in MCP context without API keys', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';
			vi.mocked(mockProviderResolver.getFallbackProvider).mockResolvedValue(null);

			const result = await service.shouldUseGuidedCompletion();
			expect(result).toBe(true);
		});
	});

	describe('getResolutionPathDescription', () => {
		it('should return description for MCP path', () => {
			const description = service.getResolutionPathDescription('mcp');
			expect(description).toContain('MCP Sampling');
			expect(description).toContain('native Cursor');
		});

		it('should return description for guided path', () => {
			const description = service.getResolutionPathDescription('guided');
			expect(description).toContain('Guided Completion');
			expect(description).toContain('no API keys');
		});

		it('should return description for API fallback path', () => {
			const description = service.getResolutionPathDescription('api_fallback');
			expect(description).toContain('API Key');
			expect(description).toContain('external provider');
		});
	});
});
