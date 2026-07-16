import type { EscalationSignal } from 'types/escalation.types';
import type { LLMCompletionOptions, LLMProvider } from 'types/llm.types';

/**
 * Minimal shape this service needs from EscalationDetectionService — kept narrow so
 * tests can pass a lightweight fake instead of constructing the real singleton.
 */
export interface EscalationSignalDetector {
	parseResponse(content: string): { signal: EscalationSignal | null };
	shouldTriggerEscalation(signal: EscalationSignal | null): boolean;
}

export interface SelfConsistencyResult {
	/** Fraction of successfully-parsed samples that agreed with the original's escalation verdict. */
	agreementRatio: number;
	/**
	 * True when the original's "no escalation needed" self-report should not be trusted —
	 * either a majority of independent samples disagreed, or none could be parsed at all
	 * (an inconclusive check fails closed rather than silently trusting the original).
	 */
	disagrees: boolean;
}

/**
 * Independently checks a borderline confidence report by re-asking the model the same
 * question additional times and seeing whether it reaches the same escalation verdict.
 * This is the one place in the escalation pipeline that verifies the model's self-report
 * against something other than the model's own words.
 */
export class SelfConsistencySamplerService {
	async checkAgreement(
		provider: LLMProvider,
		completionOptions: LLMCompletionOptions,
		originalSignal: EscalationSignal,
		detectionService: EscalationSignalDetector,
		sampleCount: number
	): Promise<SelfConsistencyResult> {
		const originalVerdict = detectionService.shouldTriggerEscalation(originalSignal);

		const completions = await Promise.all(
			Array.from({ length: sampleCount }, () => provider.complete(completionOptions))
		);

		const parsedSignals = completions
			.map((completion) => detectionService.parseResponse(completion.content).signal)
			.filter((signal): signal is EscalationSignal => signal !== null);

		if (parsedSignals.length === 0) {
			return { agreementRatio: 0, disagrees: true };
		}

		const agreeingCount = parsedSignals.filter(
			(signal) => detectionService.shouldTriggerEscalation(signal) === originalVerdict
		).length;
		const agreementRatio = agreeingCount / parsedSignals.length;

		return { agreementRatio, disagrees: agreementRatio < 0.5 };
	}
}

let serviceInstance: null | SelfConsistencySamplerService = null;

export function getSelfConsistencySamplerService(): SelfConsistencySamplerService {
	serviceInstance ??= new SelfConsistencySamplerService();
	return serviceInstance;
}

export function resetSelfConsistencySamplerService(): void {
	serviceInstance = null;
}
