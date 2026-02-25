/**
 * Hook system type definitions
 *
 * Types for the PreToolUse/PostToolUse hook mechanism that allows
 * users to intercept tool calls with custom shell commands.
 */

export interface HookCommand {
	async?: boolean;
	command: string;
	statusMessage?: string;
	timeout?: number; // ms, default 10000
	type: 'command';
}

export type HookEventName = 'PostToolUse' | 'PreToolUse';

export interface HookExecutionResult {
	allowed: boolean;
	blockReason?: string;
	errors: string[];
	hooksExecuted: number;
	updatedArgs?: Record<string, unknown>;
}

export interface HookInput {
	cwd: string;
	hook_event_name: HookEventName;
	session_id: string | undefined;
	tool_input: Record<string, unknown>;
	tool_name: string;
	tool_result?: string; // PostToolUse only: tool output
}

export interface HookMatcher {
	hooks: HookCommand[];
	matcher: string; // regex pattern against tool name
}

export interface HookOutput {
	hookSpecificOutput?: {
		hookEventName: HookEventName;
		permissionDecision?: HookPermissionDecision;
		permissionDecisionReason?: string;
		updatedInput?: Record<string, unknown>;
	};
}

export type HookPermissionDecision = 'allow' | 'deny';

export interface HooksConfig {
	PostToolUse?: HookMatcher[];
	PreToolUse?: HookMatcher[];
}
