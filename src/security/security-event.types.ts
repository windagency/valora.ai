/**
 * Security Event Types
 *
 * Shared types for the agentic AI security module.
 * Used across all security services for consistent event reporting.
 */

export interface SecurityEvent {
	details: Record<string, unknown>;
	severity: SecuritySeverity;
	timestamp: Date;
	type: SecurityEventType;
}

export type SecurityEventType =
	| 'command_blocked'
	| 'credential_redacted'
	| 'mcp_arg_credential_detected'
	| 'prompt_injection_detected'
	| 'sensitive_file_blocked'
	| 'tool_definition_suspicious'
	| 'tool_set_changed';

export type SecuritySeverity = 'critical' | 'high' | 'low' | 'medium';

/**
 * Create a security event with current timestamp
 */
export function createSecurityEvent(
	type: SecurityEventType,
	severity: SecuritySeverity,
	details: Record<string, unknown>
): SecurityEvent {
	return { details, severity, timestamp: new Date(), type };
}
