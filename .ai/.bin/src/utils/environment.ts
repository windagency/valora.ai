/**
 * Environment detection utilities
 *
 * Provides functions to detect various runtime environments and their constraints.
 */

import { accessSync, constants } from 'fs';

/**
 * Check if we're running in a sandboxed environment
 * Sandboxed environments have restricted access to file system and network
 */
export function isSandboxedEnvironment(): boolean {
	// MCP/Cursor environment
	if (process.env['AI_MCP_ENABLED'] === 'true') {
		return true;
	}

	// Test environment - tests need actual errors for validation
	// if (process.env['NODE_ENV'] === 'test') {
	// 	return true;
	// }

	// CI environment
	if (process.env['CI'] === 'true') {
		return true;
	}

	// Check for restricted file system access (common in containers/sandboxes)
	try {
		accessSync('/tmp', constants.W_OK);
	} catch {
		return true; // Can't write to /tmp, likely sandboxed
	}

	return false;
}

/**
 * Check if we're in a test environment where we want strict error handling
 * (as opposed to production sandboxed environments where we want graceful degradation)
 */
export function isTestEnvironment(): boolean {
	return (
		process.env['NODE_ENV'] === 'test' ||
		process.env['VITEST'] === 'true' ||
		process.argv.some((arg) => arg.includes('vitest')) ||
		process.argv.some((arg) => arg.includes('jest'))
	);
}

/**
 * Check if we should gracefully handle file system errors
 * (test environments should throw errors for proper testing)
 */
export function shouldGracefullyHandleFileErrors(): boolean {
	return isSandboxedEnvironment() && !isTestEnvironment();
}

/**
 * Check if network access is restricted
 */
export function isNetworkRestricted(): boolean {
	return (
		isSandboxedEnvironment() ||
		process.env['AI_NETWORK_RESTRICTED'] === 'true' ||
		(!process.env['AI_OPENAI_API_KEY'] && !process.env['AI_ANTHROPIC_API_KEY'] && !process.env['AI_GOOGLE_API_KEY'])
	);
}

/**
 * Check if we're in a development environment
 */
export function isDevelopmentEnvironment(): boolean {
	return process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === undefined; // Default to development
}

/**
 * Check if we're in a production environment
 */
export function isProductionEnvironment(): boolean {
	return process.env['NODE_ENV'] === 'production';
}

/**
 * Get environment summary for logging/debugging
 */
export function getEnvironmentSummary(): Record<string, unknown> {
	return {
		ci: process.env['CI'] === 'true',
		development: isDevelopmentEnvironment(),
		hasApiKeys: !!(
			process.env['AI_OPENAI_API_KEY'] ??
			process.env['AI_ANTHROPIC_API_KEY'] ??
			process.env['AI_GOOGLE_API_KEY']
		),
		mcp: process.env['AI_MCP_ENABLED'] === 'true',
		networkRestricted: isNetworkRestricted(),
		nodeEnv: process.env['NODE_ENV'],
		production: isProductionEnvironment(),
		sandboxed: isSandboxedEnvironment()
	};
}
