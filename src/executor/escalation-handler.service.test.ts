import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EscalationContext, EscalationSignal } from 'types/escalation.types';

const { mockPrompt } = vi.hoisted(() => ({ mockPrompt: vi.fn() }));

const identity = (s: string): string => s;
// Tagging (rather than identity) functions for the colors formatConfidence actually
// chooses between, so tests can tell WHICH band was selected, not just that some
// color-wrapped string containing the value was produced. Wrapping is lossless
// (the original text remains a substring), so every pre-existing `.toContain(...)`
// assertion in this file still passes unchanged.
const tag =
	(name: string) =>
	(s: string): string =>
		`${name}(${s})`;

vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: vi.fn(() => ({ prompt: mockPrompt }))
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		bold: identity,
		cyan: tag('CYAN'),
		gray: identity,
		green: tag('GREEN'),
		red: tag('RED'),
		yellow: tag('YELLOW')
	}))
}));

const consoleCalls: { labelValue: Array<[string, string]>; print: string[] } = { labelValue: [], print: [] };

vi.mock('output/console-output', () => ({
	getConsoleOutput: vi.fn(() => ({
		blank: vi.fn(),
		bold: vi.fn(),
		dim: vi.fn(),
		divider: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		labelValue: vi.fn((label: string, value: string) => {
			consoleCalls.labelValue.push([label, value]);
		}),
		print: vi.fn((line: string) => {
			consoleCalls.print.push(line);
		}),
		success: vi.fn()
	}))
}));

vi.mock('output/markdown', () => ({
	getRenderer: vi.fn(() => ({
		box: vi.fn((content: string) => content)
	}))
}));

import { EscalationHandlerService } from './escalation-handler.service';

const makeSignal = (overrides: Partial<EscalationSignal> = {}): EscalationSignal => ({
	confidence: 65,
	confidenceSource: 'reported',
	proposed_action: 'Do the thing',
	reasoning: 'Because reasons',
	requires_escalation: false,
	risk_level: 'medium',
	triggered_criteria: [],
	...overrides
});

const makeContext = (signal: EscalationSignal, overrides: Partial<EscalationContext> = {}): EscalationContext => ({
	agentRole: 'lead',
	allowModify: true,
	escalationCriteria: ['Confidence < 70%'],
	llmResponse: '...',
	signal,
	stageName: 'plan.assess-risks',
	...overrides
});

describe('EscalationHandlerService', () => {
	beforeEach(() => {
		consoleCalls.labelValue = [];
		consoleCalls.print = [];
		mockPrompt.mockReset();
	});

	describe('formatConfidence color banding', () => {
		it.each([
			[100, 'GREEN'],
			[80, 'GREEN'],
			[79, 'YELLOW'],
			[60, 'YELLOW'],
			[59, 'RED'],
			[0, 'RED']
		] as const)('confidence=%s is displayed in the %s band', async (confidence, band) => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal({ confidence, confidenceSource: 'reported' })));

			const confidenceCall = consoleCalls.labelValue.find(([label]) => label === 'Confidence');
			expect(confidenceCall?.[1]).toContain(`${band}(${confidence}%)`);
		});
	});

	describe('formatConfidence display via displayEscalationInfo', () => {
		it.each([
			[85, 'reported'],
			[60, 'reported'],
			[10, 'reported']
		] as const)('formats confidence=%s with the underlying value visible', async (confidence, source) => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal({ confidence, confidenceSource: source })));

			const confidenceCall = consoleCalls.labelValue.find(([label]) => label === 'Confidence');
			expect(confidenceCall?.[1]).toContain(`${confidence}%`);
		});

		it('annotates the confidence value when it was defaulted rather than reported by the model', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal({ confidence: 0, confidenceSource: 'defaulted' })));

			const confidenceCall = consoleCalls.labelValue.find(([label]) => label === 'Confidence');
			expect(confidenceCall?.[1]).toContain('not reported by model');
		});

		it('does not annotate the confidence value when it was actually reported by the model', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal({ confidence: 85, confidenceSource: 'reported' })));

			const confidenceCall = consoleCalls.labelValue.find(([label]) => label === 'Confidence');
			expect(confidenceCall?.[1]).not.toContain('not reported by model');
		});
	});

	describe('handleEscalation decision handling', () => {
		it('returns shouldAbort=true and shouldProceed=false when the user chooses to abort', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'abort' });
			const service = new EscalationHandlerService();
			const result = await service.handleEscalation(makeContext(makeSignal()));

			expect(result.shouldAbort).toBe(true);
			expect(result.shouldProceed).toBe(false);
			expect(result.decision.decision).toBe('abort');
		});

		it('returns shouldProceed=true when the user chooses to proceed', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			const result = await service.handleEscalation(makeContext(makeSignal()));

			expect(result.shouldProceed).toBe(true);
			expect(result.shouldAbort).toBe(false);
		});

		it('carries the guidance text through as modifiedGuidance when the user chooses to modify', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'modify' }).mockResolvedValueOnce({ guidance: 'Add more tests' });
			const service = new EscalationHandlerService();
			const result = await service.handleEscalation(makeContext(makeSignal()));

			expect(result.shouldAbort).toBe(false);
			expect(result.shouldProceed).toBe(false);
			expect(result.modifiedGuidance).toBe('Add more tests');
		});

		it('offers a "Modify" choice when the context allows it', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal(), { allowModify: true }));

			const questions = mockPrompt.mock.calls[0]?.[0] as Array<{ choices: Array<{ value: string }> }>;
			const values = questions[0]?.choices.map((c) => c.value);
			expect(values).toContain('modify');
		});

		it('omits the "Modify" choice when the context does not allow it, so the human is never offered a no-op', async () => {
			mockPrompt.mockResolvedValueOnce({ decision: 'proceed' });
			const service = new EscalationHandlerService();
			await service.handleEscalation(makeContext(makeSignal(), { allowModify: false }));

			const questions = mockPrompt.mock.calls[0]?.[0] as Array<{ choices: Array<{ value: string }> }>;
			const values = questions[0]?.choices.map((c) => c.value);
			expect(values).not.toContain('modify');
		});

		it('defaults to abort when the decision is not one of proceed/modify/abort (fail-closed safety fallback)', async () => {
			// The prompt adapter is fully mocked, so an upstream bug that returns an
			// unrecognised `decision` value must still resolve to the same
			// fail-closed outcome as an explicit abort — never silently proceed.
			mockPrompt.mockResolvedValueOnce({ decision: 'something-unexpected' });
			const service = new EscalationHandlerService();
			const result = await service.handleEscalation(makeContext(makeSignal()));

			expect(result.shouldAbort).toBe(true);
			expect(result.shouldProceed).toBe(false);
			expect(result.decision.decision).toBe('abort');
		});
	});

	describe('displayEscalationSummary', () => {
		it('prints the stage name, risk level, decision, and timestamp', () => {
			const service = new EscalationHandlerService();
			const context = makeContext(makeSignal({ risk_level: 'high' }), { stageName: 'plan.assess-risks' });
			const result = {
				decision: { decision: 'proceed' as const, timestamp: 0 },
				handled: true,
				shouldAbort: false,
				shouldProceed: true
			};

			service.displayEscalationSummary(context, result);

			expect(consoleCalls.print).toContain('  Stage: plan.assess-risks');
			expect(consoleCalls.print).toContain('  Risk: high');
			expect(consoleCalls.print.some((line) => line.includes('GREEN(PROCEEDED)'))).toBe(true);
			expect(consoleCalls.print.some((line) => line.includes(new Date(0).toISOString()))).toBe(true);
		});

		it('labels an aborted decision in red and a modified decision in cyan', () => {
			const service = new EscalationHandlerService();
			const context = makeContext(makeSignal());

			service.displayEscalationSummary(context, {
				decision: { decision: 'abort', timestamp: 0 },
				handled: true,
				shouldAbort: true,
				shouldProceed: false
			});
			service.displayEscalationSummary(context, {
				decision: { decision: 'modify', timestamp: 0 },
				handled: true,
				modifiedGuidance: 'more tests',
				shouldAbort: false,
				shouldProceed: false
			});

			expect(consoleCalls.print.some((line) => line.includes('RED(ABORTED)'))).toBe(true);
			expect(consoleCalls.print.some((line) => line.includes('CYAN(MODIFIED)'))).toBe(true);
		});
	});
});
