/**
 * Wires EscalationLedger persistence to the pipeline's existing escalation events.
 * Deliberately zero changes to the escalation decision logic in stage-executor.ts —
 * `PipelineEventEmitter` already emits everything the ledger needs
 * (`emitEscalationTriggered`/`emitEscalationResolved`/`emitEscalationAborted`); nothing
 * previously subscribed to them.
 */

import type { EscalationDecisionType, EscalationRiskLevel } from 'types/escalation.types';

import { getPipelineEmitter, type PipelineEventEmitter } from 'output/pipeline-emitter';
import {
	type EscalationAbortedData,
	type EscalationResolvedData,
	type EscalationTriggeredData,
	PipelineEventType
} from 'types/pipeline.types';

import { type EscalationLedger, getEscalationLedger } from './escalation-ledger';

interface PendingSignal {
	confidence: number;
	confidenceSource: 'defaulted' | 'reported';
	riskLevel: EscalationRiskLevel;
	triggeredCriteria: string[];
}

/**
 * Subscribes a ledger to an emitter's escalation events for the lifetime of the process.
 * A "triggered" event's signal fields are held in memory just long enough to be merged
 * with the "resolved"/"aborted" event for the same stage that follows it.
 */
export function subscribeEscalationLedger(emitter: PipelineEventEmitter, ledger: EscalationLedger): void {
	const pending = new Map<string, PendingSignal>();

	emitter.on(PipelineEventType.ESCALATION_TRIGGERED, (data: EscalationTriggeredData) => {
		pending.set(data.stage, {
			confidence: data.confidence,
			confidenceSource: data.confidenceSource,
			riskLevel: data.riskLevel as EscalationRiskLevel,
			triggeredCriteria: data.triggeredCriteria
		});
	});

	const recordDecision = (stage: string, decision: EscalationDecisionType): void => {
		const signal = pending.get(stage);
		pending.delete(stage);

		ledger.record({
			confidence: signal?.confidence ?? 0,
			confidenceSource: signal?.confidenceSource ?? 'defaulted',
			decision,
			riskLevel: signal?.riskLevel ?? 'medium',
			stage,
			timestamp: new Date().toISOString(),
			triggeredCriteria: signal?.triggeredCriteria ?? []
		});
	};

	emitter.on(PipelineEventType.ESCALATION_RESOLVED, (data: EscalationResolvedData) => {
		recordDecision(data.stage, data.decision);
	});

	emitter.on(PipelineEventType.ESCALATION_ABORTED, (data: EscalationAbortedData) => {
		recordDecision(data.stage, 'abort');
	});
}

let bootstrapped = false;

/**
 * Subscribes the default `EscalationLedger` singleton to the default pipeline emitter
 * singleton, exactly once per process. Safe to call more than once (e.g. if the CLI's
 * startup path runs more than once in a test process) — subsequent calls are no-ops.
 */
export function bootstrapEscalationLedger(): void {
	if (bootstrapped) return;
	bootstrapped = true;
	subscribeEscalationLedger(getPipelineEmitter(), getEscalationLedger());
}

/** Test-only: allow bootstrapEscalationLedger() to be exercised again in isolation. */
export function resetEscalationLedgerBootstrap(): void {
	bootstrapped = false;
}
