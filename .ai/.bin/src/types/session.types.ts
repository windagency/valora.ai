/**
 * Session type definitions
 */

import type { Status } from './common.types';

export interface ContextWindowUsage {
	/** Context window size for current model (in tokens) */
	context_window_size: number;
	/** Current model being used */
	model: string;
	/** Tokens used in context (prompt tokens) */
	tokens_used: number;
	/** Utilization percentage (0-100) */
	utilization_percent: number;
}

/**
 * Optimization metrics for workflow tracking
 */
export interface OptimizationMetrics {
	/** Complexity score calculated during planning (0-10) */
	complexity_score?: number;
	/** Confidence score that triggered early exit (8.5-10) */
	early_exit_confidence?: number;
	/** Whether early exit was triggered in review phase */
	early_exit_triggered?: boolean;
	/** Initial confidence score before review iterations */
	initial_confidence?: number;
	/** Pattern detected during planning (e.g., 'REST_API', 'REACT_COMPONENT') */
	pattern_detected?: string;
	/** Confidence level of pattern detection (0-1) */
	pattern_confidence?: number;
	/** Planning mode used: 'express' | 'template' | 'standard' */
	planning_mode?: 'express' | 'standard' | 'template';
	/** Template used for plan generation */
	template_used?: string;
	/** Estimated time saved by optimization in minutes */
	time_saved_minutes?: number;
}

/**
 * Quality metrics for code validation and review
 */
export interface QualityMetrics {
	/** Number of auto-fixes applied during real-time linting */
	auto_fixes_applied?: number;
	/** Number of files generated during implementation */
	files_generated?: number;
	/** Number of review iterations before approval */
	iterations?: number;
	/** Linter errors found in assert phase */
	lint_errors_assert?: number;
	/** Linter errors found during real-time validation */
	lint_errors_realtime?: number;
	/** Whether plan was approved */
	plan_approved?: boolean;
	/** Review quality score (0-100) */
	review_score?: number;
	/** Number of test failures in assert phase */
	test_failures?: number;
	/** Number of test passes in assert phase */
	test_passes?: number;
}

export interface Session extends Record<string, unknown>, SessionMetadata {
	commands: SessionCommand[];
	context: SessionContext;
}

export interface SessionCommand {
	args: string[];
	command: string;
	duration_ms: number;
	error?: string;
	flags: Record<string, boolean | string | undefined>;
	/** Optimization metrics for workflow tracking */
	optimization_metrics?: OptimizationMetrics;
	outputs: Record<string, unknown>;
	/** Quality metrics for code validation */
	quality_metrics?: QualityMetrics;
	success: boolean;
	timestamp: string;
	tokens_used?: number;
}

export interface SessionContext {
	[key: string]: unknown;
}

export interface SessionCreateOptions {
	initialContext?: SessionContext;
	sessionId?: string;
}

export interface SessionMetadata {
	/** Context window usage tracking */
	context_window?: ContextWindowUsage;
	created_at: string;
	current_command?: string;
	last_command?: string;
	session_id: string;
	status: Status;
	total_tokens_used?: number;
	updated_at: string;
}

export interface SessionResumeOptions {
	resetContext?: boolean;
	sessionId: string;
}

export interface SessionSummary {
	command_count: number;
	/** Context window usage tracking */
	context_window?: ContextWindowUsage;
	created_at: string;
	current_command?: string;
	file_changes?: {
		created: number;
		deleted: number;
		modified: number;
	};
	last_active: string;
	last_command?: string;
	session_id: string;
	size_bytes: number;
	status: Status;
	total_tokens_used?: number;
	updated_at: string;
}
