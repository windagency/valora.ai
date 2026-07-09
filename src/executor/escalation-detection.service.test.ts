import { afterEach, describe, expect, it } from 'vitest';

import { EscalationDetectionService } from './escalation-detection.service';

const buildResponse = (escalation: Record<string, unknown>): string =>
	`Some analysis text.\n\n\`\`\`json\n{"_escalation": ${JSON.stringify(escalation)}}\n\`\`\``;

describe('EscalationDetectionService', () => {
	afterEach(() => {
		// Each test constructs its own instance, but guard against any accidental singleton reuse.
	});

	describe('getConfig', () => {
		it('exposes the effective confidence threshold and self-consistency policy, merging overrides with defaults', () => {
			const service = new EscalationDetectionService({ confidenceThreshold: 80 });
			const config = service.getConfig();
			expect(config.confidenceThreshold).toBe(80);
			expect(config.selfConsistency.enabled).toBe(true);
			expect(config.selfConsistency.sampleCount).toBeGreaterThan(0);
		});
	});

	describe('parseResponse', () => {
		it('marks confidence as reported when the model provides a numeric value', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({ confidence: 85, requires_escalation: false, risk_level: 'low', triggered_criteria: [] })
			);
			expect(signal?.confidence).toBe(85);
			expect(signal?.confidenceSource).toBe('reported');
		});

		it('marks confidence as defaulted when the field is missing', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({ requires_escalation: false, risk_level: 'low', triggered_criteria: [] })
			);
			expect(signal?.confidenceSource).toBe('defaulted');
		});

		it('marks confidence as defaulted when the field is non-numeric', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({ confidence: 'high', requires_escalation: false, risk_level: 'low', triggered_criteria: [] })
			);
			expect(signal?.confidenceSource).toBe('defaulted');
		});

		it('returns a null signal when no _escalation block is present', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse('Just some plain response with no escalation block.');
			expect(signal).toBeNull();
		});
	});

	describe('shouldTriggerEscalation', () => {
		it('does not escalate for a null signal', () => {
			const service = new EscalationDetectionService();
			expect(service.shouldTriggerEscalation(null)).toBe(false);
		});

		it('does not escalate when confidence is at or above the threshold with no other risk factors', () => {
			const service = new EscalationDetectionService({ confidenceThreshold: 70 });
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 70,
					reasoning: 'Thoroughly reviewed the change against the acceptance criteria.',
					requires_escalation: false,
					risk_level: 'low',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(false);
		});

		it('escalates when confidence is below the threshold', () => {
			const service = new EscalationDetectionService({ confidenceThreshold: 70 });
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 69,
					reasoning: 'Some uncertainty remains about edge cases.',
					requires_escalation: false,
					risk_level: 'low',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('escalates unconditionally when confidence was defaulted, even above the numeric threshold value', () => {
			// Regression guard: previously a missing/non-numeric confidence silently defaulted to 50,
			// which only escalated by coincidence of the default threshold (70) being higher than 50.
			const service = new EscalationDetectionService({ confidenceThreshold: 10 });
			const { signal } = service.parseResponse(
				buildResponse({ requires_escalation: false, risk_level: 'low', triggered_criteria: [] })
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('escalates when the LLM explicitly requests escalation regardless of confidence', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 99,
					reasoning: 'Explicit escalation requested by the model.',
					requires_escalation: true,
					risk_level: 'low',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('escalates when risk level is high, even with high confidence', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 95,
					reasoning: 'Confident but this touches production credentials.',
					requires_escalation: false,
					risk_level: 'high',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('escalates when triggered_criteria is non-empty', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 95,
					reasoning: 'Adds a new dependency.',
					requires_escalation: false,
					risk_level: 'low',
					triggered_criteria: ['Adding new dependencies']
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('escalates an ungrounded high-confidence claim with no reasoning or proposed action', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 95,
					proposed_action: '',
					reasoning: '',
					requires_escalation: false,
					risk_level: 'low',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(true);
		});

		it('does not flag a high-confidence claim that is backed by reasoning and a proposed action', () => {
			const service = new EscalationDetectionService();
			const { signal } = service.parseResponse(
				buildResponse({
					confidence: 95,
					proposed_action: 'Merge the change as-is.',
					reasoning: 'All acceptance criteria are met and tests pass with full coverage.',
					requires_escalation: false,
					risk_level: 'low',
					triggered_criteria: []
				})
			);
			expect(service.shouldTriggerEscalation(signal)).toBe(false);
		});
	});

	describe('getMissingSignalEscalation', () => {
		it('returns a forced escalation signal when requireExplicitBlock is enabled (the default)', () => {
			const service = new EscalationDetectionService();
			const signal = service.getMissingSignalEscalation('review.assess-risks');
			expect(signal?.requires_escalation).toBe(true);
			expect(signal?.confidenceSource).toBe('defaulted');
			expect(signal?.triggered_criteria).toContain('missing_escalation_block');
			expect(signal?.reasoning).toContain('review.assess-risks');
		});

		it('returns null when requireExplicitBlock is disabled', () => {
			const service = new EscalationDetectionService({ requireExplicitBlock: false });
			expect(service.getMissingSignalEscalation('review.assess-risks')).toBeNull();
		});
	});
});
