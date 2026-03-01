/**
 * MCP Request Handler Types
 *
 * Inferred types from actual usage patterns to eliminate index signature access
 */

/**
 * Command execution flags
 * Inferred from buildFlags() method usage
 *
 * Extends Record<string, string | boolean | undefined> to be compatible with CommandExecutionOptions.flags
 * while maintaining type safety for known properties.
 * The undefined is necessary because optional properties are typed as T | undefined.
 */
export interface CommandFlags extends Record<string, boolean | string | undefined> {
	model?: string;
	needsSetup?: boolean;
	provider?: string;
	requestId?: string;
	sessionId?: string;
}

/**
 * MCP Server CLI overrides
 * Inferred from parseMCPArgs() function usage
 */
export interface MCPServerOverrides {
	logLevel?: string;
	output?: string;
	port?: number;
	quiet?: boolean;
	transport?: string;
	verbose?: boolean;
}
