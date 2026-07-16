/**
 * Security Event Types
 *
 * Shared types for the agentic AI security module.
 * Used across all security services for consistent event reporting.
 */

import { randomUUID } from 'node:crypto';

export interface SecurityEvent {
	details: Record<string, unknown>;
	id?: string;
	severity: SecuritySeverity;
	timestamp: Date;
	type: SecurityEventType;
}

export type SecurityEventType =
	| 'command_blocked'
	| 'credential_redacted'
	| 'mcp_arg_credential_detected'
	| 'memory_purged'
	| 'plugin_code_changed'
	| 'prompt_injection_detected'
	| 'sensitive_file_blocked'
	| 'tool_definition_suspicious'
	| 'tool_set_changed';

export type SecuritySeverity = 'critical' | 'high' | 'low' | 'medium';

/**
 * Create a security event with current timestamp and a unique id.
 *
 * The id allows the JSONL audit sink to deduplicate when the same event is
 * appended more than once (e.g. by a guard that keeps an in-memory array AND
 * writes to disk) and lets the export aggregator merge memory + disk sources
 * without double-counting.
 */
export function createSecurityEvent(
	type: SecurityEventType,
	severity: SecuritySeverity,
	details: Record<string, unknown>
): SecurityEvent {
	return { details, id: randomUUID(), severity, timestamp: new Date(), type };
}
