/**
 * Provider resolution type definitions
 *
 * These types are used across multiple layers for provider resolution and fallback logic.
 */

/**
 * Provider resolution path constants
 * Indicates which tier of the fallback system was used
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- PascalCase for const enum object following TypeScript enum pattern
export const ResolutionPath = {
	API_FALLBACK: 'api_fallback',
	GUIDED: 'guided',
	MCP: 'mcp'
} as const;

export type ProviderResolutionPath = (typeof ResolutionPath)[keyof typeof ResolutionPath];

/**
 * Guided completion mode constant
 * Used when provider cannot complete directly and needs user guidance
 */
export const GUIDED_MODE = 'guided' as const;
export type GuidedMode = typeof GUIDED_MODE;
