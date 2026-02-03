/**
 * Diagnostics Types
 *
 * Type definitions for system diagnostics and health checks.
 * Extracted to types layer to prevent circular dependencies.
 */

export interface DiagnosticResult {
	/** Whether this issue can be automatically fixed */
	autoFixable?: boolean;
	/** Description of the diagnostic result */
	message: string;
	/** Status of the diagnostic check */
	status: DiagnosticStatus;
	/** Suggestion for fixing the issue */
	suggestion?: string;
}

export type DiagnosticStatus = 'fail' | 'pass' | 'warn';
