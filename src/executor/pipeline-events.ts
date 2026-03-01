/**
 * Event system for pipeline execution
 *
 * This module re-exports pipeline event types and emitter for backward compatibility.
 * - Type definitions are in types/pipeline.types.ts
 * - Event emitter implementation is in output/pipeline-emitter.ts
 *
 * @deprecated Import directly from:
 * - 'types/pipeline.types' for type definitions
 * - 'output/pipeline-emitter' for the event emitter
 */

// Re-export all types for backward compatibility
export type {
	AgentThinkingData,
	EscalationAbortedData,
	EscalationResolvedData,
	EscalationTriggeredData,
	LLMRequestData,
	LLMResponseData,
	PipelineEventData,
	PipelineStartData,
	SessionInfoData,
	StageCompleteData,
	StageProgressData,
	StageStartData,
	ToolHookBlockedData,
	ToolHookPostData,
	ToolHookTriggeredData,
	WorktreeInfoData
} from 'types/pipeline.types';
export { PipelineEventType } from 'types/pipeline.types';

// Re-export emitter from output layer
export { getPipelineEmitter, PipelineEventEmitter, setPipelineEmitter } from 'output/pipeline-emitter';
