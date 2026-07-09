import { describe, expect, it } from 'vitest';

import { ProcessingFeedback } from './processing-feedback';

/**
 * `formatValue` is private — accessed directly here because it's a small pure
 * formatter with no side effects, and constructing a fake terminal/color adapter
 * just to observe printed output would test far more than this bug touches.
 */
interface ProcessingFeedbackInternals {
	formatValue(key: string, value: unknown): string;
}

const asInternals = (feedback: ProcessingFeedback): ProcessingFeedbackInternals =>
	feedback as unknown as ProcessingFeedbackInternals;

describe('ProcessingFeedback confidence formatting', () => {
	it('formats a 0-1 scale confidence (e.g. agent-selection/task-classifier scores) as a percentage', () => {
		const feedback = new ProcessingFeedback();
		expect(asInternals(feedback).formatValue('confidence', 0.74)).toBe('confidence: 74%');
	});

	it('formats an already-0-100 scale confidence (e.g. escalation signals) without double-scaling', () => {
		const feedback = new ProcessingFeedback();
		expect(asInternals(feedback).formatValue('confidence', 74)).toBe('confidence: 74%');
	});

	it('formats boundary value 1 as 100% (0-1 scale full confidence)', () => {
		const feedback = new ProcessingFeedback();
		expect(asInternals(feedback).formatValue('confidence', 1)).toBe('confidence: 100%');
	});

	it('formats 100 (0-100 scale full confidence) as 100%, not 10000%', () => {
		const feedback = new ProcessingFeedback();
		expect(asInternals(feedback).formatValue('confidence', 100)).toBe('confidence: 100%');
	});

	it('formats zero confidence as 0% regardless of assumed scale', () => {
		const feedback = new ProcessingFeedback();
		expect(asInternals(feedback).formatValue('confidence', 0)).toBe('confidence: 0%');
	});
});
