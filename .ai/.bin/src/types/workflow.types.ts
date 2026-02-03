/**
 * Workflow type definitions
 */

import type { Status, WorkflowNextPhase } from './common.types';

export type WorkflowPhase =
	| 'commit-pr'
	| 'feedback'
	| 'implementation'
	| 'initialization'
	| 'planning'
	| 'review'
	| 'task-preparation'
	| 'validation';

// WorkflowStatus is now replaced by the common Status type

export interface WorkflowCommand {
	agent: string;
	command: string;
	description: string;
	optional?: boolean;
}

export interface WorkflowDecisionPoint {
	actions: {
		no: string;
		yes: string;
	};
	criteria: string;
	name: string;
}

export interface WorkflowDefinition {
	description: string;
	entry_points: {
		[key: string]: WorkflowPhase;
	};
	name: string;
	phases: WorkflowPhaseDefinition[];
	version: string;
}

export interface WorkflowExecutionOptions {
	entryPoint?: string;
	interactive?: boolean;
	resumeFromPhase?: WorkflowPhase;
	sessionId?: string;
}

export interface WorkflowExecutionResult {
	completed_phases: WorkflowPhase[];
	duration_ms: number;
	error?: string;
	final_phase: WorkflowPhase;
	session_id: string;
	success: boolean;
	workflow_id: string;
}

export interface WorkflowPhaseDefinition {
	commands: WorkflowCommand[];
	decision_points?: WorkflowDecisionPoint[];
	description: string;
	next_phase?: WorkflowNextPhase | WorkflowPhase;
	phase: WorkflowPhase;
}

export interface WorkflowState {
	completed_phases: WorkflowPhase[];
	current_phase: WorkflowPhase;
	decisions: Record<string, boolean>;
	loop_count: Record<string, number>;
	phase_outputs: Record<string, unknown>;
	session_id: string;
	started_at: string;
	status: Status;
	updated_at: string;
	workflow_id: string;
}
