import { describe, expect, it, vi } from 'vitest';

import type { EscalationParseResult, EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionOptions, LLMCompletionResult, LLMProvider } from 'types/llm.types';

import { SelfConsistencySamplerService } from './self-consistency-sampler.service';

const makeSignal = (overrides: Partial<EscalationSignal> = {}): EscalationSignal => ({
	confidence: 74,
	confidenceSource: 'reported',
	proposed_action: 'Proceed',
	reasoning: 'Looks fine',
	requires_escalation: false,
	risk_level: 'low',
	triggered_criteria: [],
	...overrides
});

const makeCompletion = (content: string): LLMCompletionResult => ({ content, model: 'test-model', role: 'assistant' });

const makeOptions = (): LLMCompletionOptions => ({ messages: [{ content: 'hi', role: 'user' }] });

function makeProvider(responses: string[]): LLMProvider {
	const complete = vi.fn();
	responses.forEach((content) => complete.mockResolvedValueOnce(makeCompletion(content)));
	return {
		complete,
		getAlternativeModels: () => [],
		isConfigured: () => true,
		name: 'test',
		streamComplete: vi.fn(),
		validateModel: async () => true
	};
}

function makeDetectionService(signals: Array<EscalationSignal | null>): {
	parseResponse: ReturnType<typeof vi.fn>;
	shouldTriggerEscalation: (signal: EscalationSignal | null) => boolean;
} {
	const parseResponse = vi.fn();
	signals.forEach((signal) => {
		parseResponse.mockReturnValueOnce({ cleanedContent: '', signal } satisfies EscalationParseResult);
	});
	return {
		parseResponse,
		shouldTriggerEscalation: (signal) => signal !== null && signal.requires_escalation
	};
}

describe('SelfConsistencySamplerService', () => {
	it('reports agreement (does not disagree) when all samples agree with the original — no escalation needed', async () => {
		const provider = makeProvider(['sample-1', 'sample-2']);
		const detectionService = makeDetectionService([
			makeSignal({ requires_escalation: false }),
			makeSignal({ requires_escalation: false })
		]);
		const sampler = new SelfConsistencySamplerService();

		const result = await sampler.checkAgreement(
			provider,
			makeOptions(),
			makeSignal({ requires_escalation: false }),
			detectionService as never,
			2
		);

		expect(result.disagrees).toBe(false);
	});

	it('disagrees when a majority of samples would trigger escalation while the original did not', async () => {
		const provider = makeProvider(['sample-1', 'sample-2']);
		const detectionService = makeDetectionService([
			makeSignal({ requires_escalation: true }),
			makeSignal({ requires_escalation: true })
		]);
		const sampler = new SelfConsistencySamplerService();

		const result = await sampler.checkAgreement(
			provider,
			makeOptions(),
			makeSignal({ requires_escalation: false }),
			detectionService as never,
			2
		);

		expect(result.disagrees).toBe(true);
	});

	it('does not disagree when only a minority of samples would trigger escalation', async () => {
		const provider = makeProvider(['sample-1', 'sample-2', 'sample-3']);
		const detectionService = makeDetectionService([
			makeSignal({ requires_escalation: true }),
			makeSignal({ requires_escalation: false }),
			makeSignal({ requires_escalation: false })
		]);
		const sampler = new SelfConsistencySamplerService();

		const result = await sampler.checkAgreement(
			provider,
			makeOptions(),
			makeSignal({ requires_escalation: false }),
			detectionService as never,
			3
		);

		expect(result.disagrees).toBe(false);
	});

	it('fails closed (disagrees) when every sample is unparseable — an inconclusive check should not be silently trusted', async () => {
		const provider = makeProvider(['garbage-1', 'garbage-2']);
		const detectionService = makeDetectionService([null, null]);
		const sampler = new SelfConsistencySamplerService();

		const result = await sampler.checkAgreement(
			provider,
			makeOptions(),
			makeSignal({ requires_escalation: false }),
			detectionService as never,
			2
		);

		expect(result.disagrees).toBe(true);
	});

	it('fires exactly sampleCount additional completion calls', async () => {
		const provider = makeProvider(['sample-1', 'sample-2']);
		const detectionService = makeDetectionService([
			makeSignal({ requires_escalation: false }),
			makeSignal({ requires_escalation: false })
		]);
		const sampler = new SelfConsistencySamplerService();

		await sampler.checkAgreement(provider, makeOptions(), makeSignal(), detectionService as never, 2);

		expect(provider.complete).toHaveBeenCalledTimes(2);
	});
});
