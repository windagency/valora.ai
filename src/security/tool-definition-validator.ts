/**
 * Tool Definition Validator
 *
 * Validates MCP tool definitions to prevent tool poisoning attacks:
 * - Name validation (no impersonation of built-in tools)
 * - Description sanitisation (strip injection-like language)
 * - Schema validation (depth/size limits, suspicious params)
 */

import type { ExternalMCPTool } from 'types/mcp-client.types';

import { getLogger } from 'output/logger';

import { createSecurityEvent, type SecurityEvent } from './security-event.types';

/**
 * Built-in tool names that external tools must not impersonate.
 */
const BUILTIN_TOOL_NAMES = new Set([
	'codebase_search',
	'delete_file',
	'glob_file_search',
	'grep',
	'list_dir',
	'query_session',
	'read_file',
	'run_terminal_cmd',
	'search_replace',
	'write'
]);

/**
 * Valid tool name pattern.
 */
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum description length (chars).
 */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Injection-like patterns in tool descriptions.
 */
const DESCRIPTION_INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(?:all\s+)?previous/i,
	/disregard\s+(?:all\s+)?(?:above|previous)/i,
	/new\s+instructions?\s*:/i,
	/you\s+(?:must|should)\s+(?:always|never)/i,
	/override\s+(?:your\s+)?(?:instructions?|rules?)/i,
	/before\s+(?:running|calling|using)\s+(?:any|other)\s+tools?/i,
	/(?:first|always)\s+(?:run|call|use)\s+this\s+tool/i,
	/<\|system\|>/i,
	/\[SYSTEM\]/i,
	/<system>/i
];

/**
 * Suspicious parameter names that might be used to extract credentials.
 */
const SUSPICIOUS_PARAM_NAMES = new Set([
	'access_key',
	'api_key',
	'api_token',
	'apikey',
	'auth',
	'authorization',
	'credential',
	'credentials',
	'password',
	'private_key',
	'secret',
	'secret_key',
	'token'
]);

/**
 * Maximum schema depth.
 */
const MAX_SCHEMA_DEPTH = 5;

export interface ToolValidationResult {
	issues: string[];
	tool: ExternalMCPTool;
	valid: boolean;
}

export class ToolDefinitionValidator {
	private events: SecurityEvent[] = [];

	/**
	 * Validate and sanitise an MCP tool definition.
	 * Returns a sanitised copy of the tool with any issues noted.
	 */
	validateToolDefinition(tool: ExternalMCPTool): ToolValidationResult {
		const issues: string[] = [];
		const sanitised = { ...tool };

		// Validate name
		if (!VALID_NAME_PATTERN.test(tool.name)) {
			issues.push(`Invalid tool name: "${tool.name}" — must match ${VALID_NAME_PATTERN.source}`);
		}

		if (BUILTIN_TOOL_NAMES.has(tool.name)) {
			issues.push(`Tool name impersonates built-in tool: "${tool.name}"`);
		}

		// Validate and sanitise description
		const descIssues = this.validateDescription(tool.description);
		if (descIssues.length > 0) {
			issues.push(...descIssues);
			// Strip injection-like content from description
			sanitised.description = this.sanitiseDescription(tool.description);
		}

		if (tool.description.length > MAX_DESCRIPTION_LENGTH) {
			issues.push(`Description too long: ${tool.description.length} chars (max ${MAX_DESCRIPTION_LENGTH})`);
			sanitised.description = sanitised.description.slice(0, MAX_DESCRIPTION_LENGTH) + '…';
		}

		// Validate schema
		const schemaIssues = this.validateSchema(tool.inputSchema);
		if (schemaIssues.length > 0) {
			issues.push(...schemaIssues);
		}

		if (issues.length > 0) {
			this.logEvent(tool, issues);
		}

		return {
			issues,
			tool: sanitised,
			valid: issues.length === 0
		};
	}

	/**
	 * Get recorded security events.
	 */
	getEvents(): SecurityEvent[] {
		return [...this.events];
	}

	/**
	 * Clear recorded events.
	 */
	clearEvents(): void {
		this.events = [];
	}

	/**
	 * Check description for injection-like patterns.
	 */
	private validateDescription(description: string): string[] {
		const issues: string[] = [];

		for (const pattern of DESCRIPTION_INJECTION_PATTERNS) {
			if (pattern.test(description)) {
				issues.push(`Description contains injection-like language: ${pattern.source}`);
			}
		}

		return issues;
	}

	/**
	 * Remove injection-like content from a description.
	 */
	private sanitiseDescription(description: string): string {
		let result = description;
		for (const pattern of DESCRIPTION_INJECTION_PATTERNS) {
			result = result.replace(new RegExp(pattern.source, pattern.flags + 'g'), '[REMOVED]');
		}
		return result;
	}

	/**
	 * Validate tool input schema for depth, size, and suspicious params.
	 */
	private validateSchema(schema: Record<string, unknown>): string[] {
		const issues: string[] = [];

		// Check depth
		const depth = this.measureDepth(schema);
		if (depth > MAX_SCHEMA_DEPTH) {
			issues.push(`Schema too deep: ${depth} levels (max ${MAX_SCHEMA_DEPTH})`);
		}

		// Check for suspicious parameter names
		const suspiciousParams = this.findSuspiciousParams(schema);
		if (suspiciousParams.length > 0) {
			issues.push(`Suspicious parameter names: ${suspiciousParams.join(', ')}`);
		}

		return issues;
	}

	/**
	 * Measure the nesting depth of an object.
	 */
	private measureDepth(obj: unknown, current = 0): number {
		if (current > MAX_SCHEMA_DEPTH + 1) return current; // Short-circuit

		if (typeof obj !== 'object' || obj === null) return current;

		let maxDepth = current;
		for (const value of Object.values(obj as Record<string, unknown>)) {
			const childDepth = this.measureDepth(value, current + 1);
			if (childDepth > maxDepth) maxDepth = childDepth;
		}

		return maxDepth;
	}

	/**
	 * Find parameter names that look like credential extraction.
	 */
	private findSuspiciousParams(schema: Record<string, unknown>, path = ''): string[] {
		const suspicious: string[] = [];

		const properties = schema['properties'] as Record<string, unknown> | undefined;
		if (properties && typeof properties === 'object') {
			for (const [name, propSchema] of Object.entries(properties)) {
				const fullPath = path ? `${path}.${name}` : name;

				if (SUSPICIOUS_PARAM_NAMES.has(name.toLowerCase())) {
					suspicious.push(fullPath);
				}

				// Recurse into nested schemas
				if (typeof propSchema === 'object' && propSchema !== null) {
					suspicious.push(...this.findSuspiciousParams(propSchema as Record<string, unknown>, fullPath));
				}
			}
		}

		return suspicious;
	}

	private logEvent(tool: ExternalMCPTool, issues: string[]): void {
		const event = createSecurityEvent('tool_definition_suspicious', 'high', {
			issues,
			serverId: tool.serverId,
			toolName: tool.name
		});
		this.events.push(event);

		const logger = getLogger();
		logger.warn(`[Security] Suspicious tool definition: ${tool.name}`, { issues, serverId: tool.serverId });
	}
}

/**
 * Singleton instance
 */
let instance: null | ToolDefinitionValidator = null;

export function getToolDefinitionValidator(): ToolDefinitionValidator {
	instance ??= new ToolDefinitionValidator();
	return instance;
}

export function resetToolDefinitionValidator(): void {
	instance = null;
}
