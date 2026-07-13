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

import { getAuditSink } from './audit-sink';
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
		const sanitized = { ...tool };

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
			sanitized.description = this.sanitizeDescription(tool.description);
		}

		if (tool.description.length > MAX_DESCRIPTION_LENGTH) {
			issues.push(`Description too long: ${tool.description.length} chars (max ${MAX_DESCRIPTION_LENGTH})`);
			sanitized.description = sanitized.description.slice(0, MAX_DESCRIPTION_LENGTH) + '…';
		}

		// Validate and sanitise schema
		const schemaIssues = this.validateSchema(tool.inputSchema);
		if (schemaIssues.length > 0) {
			issues.push(...schemaIssues);
			sanitized.inputSchema = this.sanitizeSchema(tool.inputSchema);
		}

		if (issues.length > 0) {
			this.logEvent(tool, issues);
		}

		return {
			issues,
			tool: sanitized,
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
	private sanitizeDescription(description: string): string {
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
		const suspiciousParams = this.processSchema(schema).suspicious;
		if (suspiciousParams.length > 0) {
			issues.push(`Suspicious parameter names: ${suspiciousParams.join(', ')}`);
		}

		return issues;
	}

	/**
	 * Measure the nesting depth of an object.
	 */
	private logEvent(tool: ExternalMCPTool, issues: string[]): void {
		const event = createSecurityEvent('tool_definition_suspicious', 'high', {
			issues,
			serverId: tool.serverId,
			toolName: tool.name
		});
		this.events.push(event);
		getAuditSink().append(event);

		const logger = getLogger();
		logger.warn(`[Security] Suspicious tool definition: ${tool.name}`, { issues, serverId: tool.serverId });
	}

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
	 * Return a copy of the schema with any suspicious-named parameter (and its
	 * entry in "required", if present) removed — mirrors sanitizeDescription's
	 * strip-on-flag behaviour, so a caller that only reads `result.tool` (not
	 * `result.issues`/`result.valid`) still gets a schema with the flagged
	 * credential-extraction parameter actually removed, not just logged.
	 */
	private sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
		return this.processSchema(schema).sanitized;
	}

	/**
	 * Single traversal that both detects suspicious parameter names and builds
	 * a sanitised copy with them removed — detection and stripping used to be
	 * two separate recursive methods that only walked `properties`, so a
	 * suspicious parameter hidden behind a JSON Schema composition keyword
	 * (`anyOf`/`oneOf`/`allOf`, an array `items` schema, or a `definitions`/
	 * `$defs` entry) was neither flagged nor stripped. Keeping detection and
	 * sanitisation in one method makes that class of divergence structurally
	 * impossible. Does not follow `$ref` pointers (that requires resolving
	 * against the whole schema document, not just the local subtree) — a
	 * suspicious parameter reachable only via `$ref` is a known limitation.
	 */
	private processSchema(
		schema: Record<string, unknown>,
		path = ''
	): { sanitized: Record<string, unknown>; suspicious: string[] } {
		const suspicious: string[] = [];
		const sanitized: Record<string, unknown> = { ...schema };

		// Named-parameter containers: `properties` entries are real invocation
		// parameters (checked against SUSPICIOUS_PARAM_NAMES and stripped);
		// `definitions`/`$defs` are reusable type definitions (recursed into for
		// nested suspicious properties, but the definition's own name is not a
		// parameter name so it is never itself flagged/stripped).
		for (const dictKey of ['properties', 'definitions', '$defs'] as const) {
			const dict = schema[dictKey];
			if (!dict || typeof dict !== 'object' || Array.isArray(dict)) continue;

			const isParams = dictKey === 'properties';
			const sanitizedDict: Record<string, unknown> = {};
			for (const [name, subSchema] of Object.entries(dict as Record<string, unknown>)) {
				const fullPath = path ? `${path}.${name}` : name;
				if (isParams && SUSPICIOUS_PARAM_NAMES.has(name.toLowerCase())) {
					suspicious.push(fullPath);
					continue;
				}
				if (typeof subSchema === 'object' && subSchema !== null) {
					const child = this.processSchema(subSchema as Record<string, unknown>, fullPath);
					suspicious.push(...child.suspicious);
					sanitizedDict[name] = child.sanitized;
				} else {
					sanitizedDict[name] = subSchema;
				}
			}
			sanitized[dictKey] = sanitizedDict;
		}

		if (Array.isArray(schema['required'])) {
			sanitized['required'] = (schema['required'] as unknown[]).filter(
				(name) => !(typeof name === 'string' && SUSPICIOUS_PARAM_NAMES.has(name.toLowerCase()))
			);
		}

		// `items`: either a single schema (list validation) or an array of
		// per-position schemas (tuple validation).
		const items = schema['items'];
		if (Array.isArray(items)) {
			sanitized['items'] = items.map((sub, index) => {
				if (typeof sub !== 'object' || sub === null) return sub;
				const child = this.processSchema(sub as Record<string, unknown>, `${path}[${index}]`);
				suspicious.push(...child.suspicious);
				return child.sanitized;
			});
		} else if (items && typeof items === 'object') {
			const child = this.processSchema(items as Record<string, unknown>, `${path}[]`);
			suspicious.push(...child.suspicious);
			sanitized['items'] = child.sanitized;
		}

		// `anyOf`/`oneOf`/`allOf`: arrays of alternative or combined schemas —
		// a suspicious parameter under any of them is just as reachable by the
		// caller as one under `properties` directly.
		for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
			const alternatives = schema[key];
			if (!Array.isArray(alternatives)) continue;
			sanitized[key] = alternatives.map((sub) => {
				if (typeof sub !== 'object' || sub === null) return sub;
				const child = this.processSchema(sub as Record<string, unknown>, path);
				suspicious.push(...child.suspicious);
				return child.sanitized;
			});
		}

		return { sanitized, suspicious };
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
