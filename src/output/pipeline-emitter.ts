/**
 * Pipeline Event Emitter
 *
 * Provides an event-based communication channel for pipeline execution status.
 * Located in output layer since it's primarily used for providing user feedback.
 */

import { EventEmitter } from 'events';
import {
	type AgentThinkingData,
	type EscalationAbortedData,
	type EscalationResolvedData,
	type EscalationTriggeredData,
	type LLMRequestData,
	type LLMResponseData,
	type PipelineEventData,
	PipelineEventType,
	type PipelineStartData,
	type StageCompleteData,
	type StageProgressData,
	type StageStartData,
	type ToolHookBlockedData,
	type ToolHookPostData,
	type ToolHookTriggeredData
} from 'types/pipeline.types';

export class PipelineEventEmitter extends EventEmitter {
	/**
	 * Emit pipeline start event
	 */
	emitPipelineStart(data: PipelineStartData): void {
		this.emit(PipelineEventType.PIPELINE_START, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.PIPELINE_START
		} as PipelineEventData);
	}

	/**
	 * Emit pipeline complete event
	 */
	emitPipelineComplete(commandName: string, duration: number, success: boolean): void {
		this.emit(PipelineEventType.PIPELINE_COMPLETE, {
			commandName,
			duration,
			metadata: { success },
			timestamp: Date.now(),
			type: PipelineEventType.PIPELINE_COMPLETE
		} as PipelineEventData);
	}

	/**
	 * Emit pipeline error event
	 */
	emitPipelineError(commandName: string, error: string): void {
		this.emit(PipelineEventType.PIPELINE_ERROR, {
			commandName,
			error,
			timestamp: Date.now(),
			type: PipelineEventType.PIPELINE_ERROR
		} as PipelineEventData);
	}

	/**
	 * Emit stage start event
	 */
	emitStageStart(data: StageStartData): void {
		this.emit(PipelineEventType.STAGE_START, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.STAGE_START
		} as PipelineEventData);
	}

	/**
	 * Emit stage progress event
	 */
	emitStageProgress(data: StageProgressData): void {
		this.emit(PipelineEventType.STAGE_PROGRESS, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.STAGE_PROGRESS
		} as PipelineEventData);
	}

	/**
	 * Emit stage complete event
	 */
	emitStageComplete(data: StageCompleteData): void {
		this.emit(PipelineEventType.STAGE_COMPLETE, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.STAGE_COMPLETE
		} as PipelineEventData);
	}

	/**
	 * Emit stage error event
	 */
	emitStageError(stage: string, error: string): void {
		this.emit(PipelineEventType.STAGE_ERROR, {
			error,
			stage,
			timestamp: Date.now(),
			type: PipelineEventType.STAGE_ERROR
		} as PipelineEventData);
	}

	/**
	 * Emit agent thinking event
	 */
	emitAgentThinking(data: AgentThinkingData): void {
		this.emit(PipelineEventType.AGENT_THINKING, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.AGENT_THINKING
		} as PipelineEventData);
	}

	/**
	 * Emit LLM request event
	 */
	emitLLMRequest(data: LLMRequestData): void {
		this.emit(PipelineEventType.LLM_REQUEST, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.LLM_REQUEST
		} as PipelineEventData);
	}

	/**
	 * Emit LLM response event
	 */
	emitLLMResponse(data: LLMResponseData): void {
		this.emit(PipelineEventType.LLM_RESPONSE, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.LLM_RESPONSE
		} as PipelineEventData);
	}

	/**
	 * Emit escalation triggered event
	 */
	emitEscalationTriggered(data: EscalationTriggeredData): void {
		this.emit(PipelineEventType.ESCALATION_TRIGGERED, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.ESCALATION_TRIGGERED
		} as PipelineEventData);
	}

	/**
	 * Emit escalation resolved event
	 */
	emitEscalationResolved(data: EscalationResolvedData): void {
		this.emit(PipelineEventType.ESCALATION_RESOLVED, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.ESCALATION_RESOLVED
		} as PipelineEventData);
	}

	/**
	 * Emit escalation aborted event
	 */
	emitEscalationAborted(data: EscalationAbortedData): void {
		this.emit(PipelineEventType.ESCALATION_ABORTED, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.ESCALATION_ABORTED
		} as PipelineEventData);
	}

	/**
	 * Emit tool hook triggered event
	 */
	emitToolHookTriggered(data: ToolHookTriggeredData): void {
		this.emit(PipelineEventType.TOOL_HOOK_TRIGGERED, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.TOOL_HOOK_TRIGGERED
		} as PipelineEventData);
	}

	/**
	 * Emit tool hook blocked event
	 */
	emitToolHookBlocked(data: ToolHookBlockedData): void {
		this.emit(PipelineEventType.TOOL_HOOK_BLOCKED, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.TOOL_HOOK_BLOCKED
		} as PipelineEventData);
	}

	/**
	 * Emit tool hook post event
	 */
	emitToolHookPost(data: ToolHookPostData): void {
		this.emit(PipelineEventType.TOOL_HOOK_POST, {
			...data,
			timestamp: Date.now(),
			type: PipelineEventType.TOOL_HOOK_POST
		} as PipelineEventData);
	}

	/**
	 * Subscribe to all events
	 */
	onAny(handler: (event: PipelineEventData) => void): void {
		Object.values(PipelineEventType).forEach((eventType) => {
			this.on(eventType, handler);
		});
	}

	/**
	 * Unsubscribe from all events
	 */
	offAny(handler: (event: PipelineEventData) => void): void {
		Object.values(PipelineEventType).forEach((eventType) => {
			this.off(eventType, handler);
		});
	}
}

/**
 * Singleton instance
 */
let emitterInstance: null | PipelineEventEmitter = null;

export function getPipelineEmitter(): PipelineEventEmitter {
	emitterInstance ??= new PipelineEventEmitter();
	return emitterInstance;
}

export function setPipelineEmitter(emitter: PipelineEventEmitter): void {
	emitterInstance = emitter;
}
