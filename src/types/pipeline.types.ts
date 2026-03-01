/**
 * Pipeline Event Types
 *
 * Type definitions for pipeline execution events.
 * These types are used by both the executor and output layers.
 */

import type { HookEventName } from './hook.types';

export enum PipelineEventType {
	AGENT_THINKING = 'agent:thinking',
	ESCALATION_ABORTED = 'escalation:aborted',
	ESCALATION_RESOLVED = 'escalation:resolved',
	ESCALATION_TRIGGERED = 'escalation:triggered',
	LLM_REQUEST = 'llm:request',
	LLM_RESPONSE = 'llm:response',
	PIPELINE_COMPLETE = 'pipeline:complete',
	PIPELINE_ERROR = 'pipeline:error',
	PIPELINE_START = 'pipeline:start',
	STAGE_COMPLETE = 'stage:complete',
	STAGE_ERROR = 'stage:error',
	STAGE_PROGRESS = 'stage:progress',
	STAGE_START = 'stage:start',
	TOOL_HOOK_BLOCKED = 'tool:hook:blocked',
	TOOL_HOOK_POST = 'tool:hook:post',
	TOOL_HOOK_TRIGGERED = 'tool:hook:triggered'
}

export interface AgentThinkingData {
	agent: string;
	thought: string;
}

export interface EscalationAbortedData {
	reason: string;
	stage: string;
}

export interface EscalationResolvedData {
	decision: 'abort' | 'modify' | 'proceed';
	guidance?: string;
	stage: string;
}

export interface EscalationTriggeredData {
	agentRole: string;
	confidence: number;
	riskLevel: string;
	stage: string;
	triggeredCriteria: string[];
}

export interface LLMRequestData {
	model?: string;
	stage: string;
	tokenCount?: number;
}

export interface LLMResponseData {
	duration: number;
	model?: string;
	/** Output/completion tokens generated */
	outputTokens?: number;
	/** Prompt/context tokens used */
	promptTokens?: number;
	stage: string;
	tokenCount?: number;
}

/**
 * Session information for pipeline events
 */
export interface SessionInfoData {
	/** Whether this is a resumed session (vs newly created) */
	isResumed: boolean;
	/** The session ID */
	sessionId: string;
}

export interface WorktreeInfoData {
	branch: string;
	commit: string;
	path: string;
}

/**
 * Session information for pipeline events
 */
export interface PipelineEventData {
	agent?: string;
	commandName?: string;
	duration?: number;
	error?: string;
	isParallel?: boolean;
	message?: string;
	metadata?: Record<string, unknown>;
	model?: string;
	/** Output/completion tokens generated */
	outputTokens?: number;
	progress?: number;
	/** Prompt/context tokens used */
	promptTokens?: number;
	/** Session information for tracking execution mode */
	sessionInfo?: SessionInfoData;
	stage?: string;
	timestamp: number;
	tokenCount?: number;
	type: PipelineEventType;
	worktreeInfo?: WorktreeInfoData;
}

export interface PipelineStartData {
	agent: string;
	commandName: string;
	model?: string;
	/** Session information for tracking execution mode */
	sessionInfo?: SessionInfoData;
	stageCount: number;
}

export interface StageCompleteData {
	duration: number;
	stage: string;
	success: boolean;
}

export interface StageProgressData {
	message?: string;
	progress: number; // 0-100
	stage: string;
}

export interface StageStartData {
	index: number;
	isParallel?: boolean;
	stage: string;
	totalStages: number;
	worktreeInfo?: WorktreeInfoData;
}

export interface ToolHookBlockedData {
	reason: string;
	toolName: string;
}

export interface ToolHookPostData {
	hookCommand: string;
	success: boolean;
	toolName: string;
}

export interface ToolHookTriggeredData {
	eventName: HookEventName;
	hookCommand: string;
	toolName: string;
}
