import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPipelineEmitter, PipelineEventEmitter } from 'output/pipeline-emitter';

import type { EscalationLedgerRecord } from './escalation-ledger';
import {
	bootstrapEscalationLedger,
	resetEscalationLedgerBootstrap,
	subscribeEscalationLedger
} from './escalation-ledger-subscriber';

const makeLedger = (): { record: ReturnType<typeof vi.fn> } => ({ record: vi.fn() });

describe('subscribeEscalationLedger', () => {
	it('records a resolved escalation with the signal fields from the triggered event and the decision from the resolved event', () => {
		const emitter = new PipelineEventEmitter();
		const ledger = makeLedger();
		subscribeEscalationLedger(emitter, ledger as never);

		emitter.emitEscalationTriggered({
			agentRole: 'lead',
			confidence: 65,
			confidenceSource: 'reported',
			riskLevel: 'medium',
			stage: 'plan.assess-risks',
			triggeredCriteria: ['Confidence < 70%']
		});
		emitter.emitEscalationResolved({ decision: 'proceed', stage: 'plan.assess-risks' });

		expect(ledger.record).toHaveBeenCalledTimes(1);
		const record = ledger.record.mock.calls[0]?.[0] as EscalationLedgerRecord;
		expect(record).toMatchObject({
			confidence: 65,
			confidenceSource: 'reported',
			decision: 'proceed',
			riskLevel: 'medium',
			stage: 'plan.assess-risks',
			triggeredCriteria: ['Confidence < 70%']
		});
	});

	it('records an aborted escalation with decision "abort"', () => {
		const emitter = new PipelineEventEmitter();
		const ledger = makeLedger();
		subscribeEscalationLedger(emitter, ledger as never);

		emitter.emitEscalationTriggered({
			agentRole: 'lead',
			confidence: 20,
			confidenceSource: 'reported',
			riskLevel: 'high',
			stage: 'plan.assess-risks',
			triggeredCriteria: []
		});
		emitter.emitEscalationAborted({ reason: 'User aborted after escalation review', stage: 'plan.assess-risks' });

		expect(ledger.record).toHaveBeenCalledTimes(1);
		expect(ledger.record.mock.calls[0]?.[0]).toMatchObject({ decision: 'abort', stage: 'plan.assess-risks' });
	});

	it('correlates by stage name so two different stages triggering concurrently do not cross-contaminate', () => {
		const emitter = new PipelineEventEmitter();
		const ledger = makeLedger();
		subscribeEscalationLedger(emitter, ledger as never);

		emitter.emitEscalationTriggered({
			agentRole: 'lead',
			confidence: 40,
			confidenceSource: 'reported',
			riskLevel: 'high',
			stage: 'stage-a',
			triggeredCriteria: []
		});
		emitter.emitEscalationTriggered({
			agentRole: 'lead',
			confidence: 90,
			confidenceSource: 'reported',
			riskLevel: 'low',
			stage: 'stage-b',
			triggeredCriteria: []
		});
		emitter.emitEscalationResolved({ decision: 'proceed', stage: 'stage-b' });
		emitter.emitEscalationAborted({ reason: 'x', stage: 'stage-a' });

		expect(ledger.record).toHaveBeenCalledTimes(2);
		const byStage = new Map(
			ledger.record.mock.calls.map((call) => [
				(call[0] as EscalationLedgerRecord).stage,
				call[0] as EscalationLedgerRecord
			])
		);
		expect(byStage.get('stage-a')).toMatchObject({ confidence: 40, decision: 'abort' });
		expect(byStage.get('stage-b')).toMatchObject({ confidence: 90, decision: 'proceed' });
	});

	it('does not throw and still records (with fallback fields) if a resolved event arrives with no matching triggered event', () => {
		const emitter = new PipelineEventEmitter();
		const ledger = makeLedger();
		subscribeEscalationLedger(emitter, ledger as never);

		expect(() => emitter.emitEscalationResolved({ decision: 'proceed', stage: 'unknown-stage' })).not.toThrow();
		expect(ledger.record).toHaveBeenCalledWith(
			expect.objectContaining({ decision: 'proceed', stage: 'unknown-stage' })
		);
	});
});

describe('bootstrapEscalationLedger', () => {
	afterEach(() => {
		resetEscalationLedgerBootstrap();
	});

	it('subscribes the default emitter singleton so escalation events are recorded', () => {
		bootstrapEscalationLedger();

		const emitter = getPipelineEmitter();
		const listenerCountBefore = emitter.listenerCount('escalation:triggered');
		expect(listenerCountBefore).toBeGreaterThan(0);
	});

	it('is idempotent — calling it twice does not double-subscribe', () => {
		bootstrapEscalationLedger();
		const countAfterFirst = getPipelineEmitter().listenerCount('escalation:triggered');

		bootstrapEscalationLedger();
		const countAfterSecond = getPipelineEmitter().listenerCount('escalation:triggered');

		expect(countAfterSecond).toBe(countAfterFirst);
	});
});
