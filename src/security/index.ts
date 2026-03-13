/**
 * Security Module
 *
 * Agentic AI security services for detection and prevention of:
 * - Credential leakage
 * - Command injection / exfiltration
 * - Prompt injection via tool results
 * - MCP tool poisoning
 * - Tool-set drift (rug pull attacks)
 */

export { CommandGuard, getCommandGuard, resetCommandGuard } from './command-guard';
export type { CommandValidationResult } from './command-guard';
export { CredentialGuard, getCredentialGuard, resetCredentialGuard } from './credential-guard';
export {
	getPromptInjectionDetector,
	PromptInjectionDetector,
	resetPromptInjectionDetector
} from './prompt-injection-detector';
export type { InjectionScanResult } from './prompt-injection-detector';
export type { SecurityEvent, SecurityEventType, SecuritySeverity } from './security-event.types';
export { createSecurityEvent } from './security-event.types';
export {
	getToolDefinitionValidator,
	resetToolDefinitionValidator,
	ToolDefinitionValidator
} from './tool-definition-validator';
export type { ToolValidationResult } from './tool-definition-validator';
export { getToolIntegrityMonitor, resetToolIntegrityMonitor, ToolIntegrityMonitor } from './tool-integrity-monitor';
export type { IntegrityCheckResult, ToolSetDiff } from './tool-integrity-monitor';
