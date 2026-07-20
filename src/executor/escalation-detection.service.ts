/**
 * Escalation Detection Service
 *
 * Parses LLM responses for escalation signals embedded as JSON blocks.
 * Evaluates whether escalation should be triggered based on the signal
 * and configured thresholds.
 */

import { getLogger } from 'output/logger';
import {
	DEFAULT_ESCALATION_CONFIG,
	type EscalationConfig,
	type EscalationParseResult,
	type EscalationRiskLevel,
	type EscalationSignal
} from 'types/escalation.types';
import { findEnclosingBraceStart, findMatchingBracketEnd } from 'utils/balanced-json';

/**
 * Matches the `"_escalation":` key, wherever it appears — fenced, raw, or preceded
 * by unrelated prose. Used only to locate candidate anchor points; the actual object
 * boundaries are found by balanced-brace scanning from each anchor (see
 * `extractRawEscalationJson`), not by this regex.
 */
const ESCALATION_KEY_PATTERN = /"_escalation"\s*:/g;

export class EscalationDetectionService {
	private readonly config: EscalationConfig;
	private readonly logger = getLogger();

	constructor(config: Partial<EscalationConfig> = {}) {
		this.config = { ...DEFAULT_ESCALATION_CONFIG, ...config };
	}

	/**
	 * Read-only access to the effective configuration, for callers (e.g. the self-consistency
	 * sampler) that need to know the confidence threshold or sampling policy.
	 */
	getConfig(): Readonly<EscalationConfig> {
		return this.config;
	}

	/**
	 * Parse LLM response content for escalation signal
	 * Returns the extracted signal and cleaned content
	 */
	parseResponse(content: string): EscalationParseResult {
		this.logger.debug('Parsing response for escalation signal', {
			contentLength: content.length
		});

		try {
			// Locate the _escalation object by balanced-brace scan (handles nesting depth,
			// fence preambles, and braces inside free-text field values — see extractRawEscalationJson).
			const raw = this.extractRawEscalationJson(content);
			const signal = raw ? this.parseEscalationJson(raw.json) : null;

			if (!signal || !raw) {
				this.logger.debug('No escalation signal found in response');
				return {
					cleanedContent: content,
					signal: null
				};
			}

			// Remove the escalation block from content
			const cleanedContent = this.removeEscalationBlock(content, raw);

			this.logger.debug('Extracted escalation signal', {
				confidence: signal.confidence,
				requiresEscalation: signal.requires_escalation,
				riskLevel: signal.risk_level,
				triggeredCriteria: signal.triggered_criteria.length
			});

			return {
				cleanedContent,
				signal
			};
		} catch (error) {
			this.logger.warn('Failed to parse escalation signal', {
				error: (error as Error).message
			});

			return {
				cleanedContent: content,
				parseError: (error as Error).message,
				signal: null
			};
		}
	}

	/**
	 * Evaluate if escalation should be triggered based on signal and config
	 */
	shouldTriggerEscalation(signal: EscalationSignal | null): boolean {
		if (!signal) {
			return false;
		}

		// Explicit escalation request from LLM
		if (signal.requires_escalation) {
			this.logger.debug('Escalation triggered: LLM explicitly requested escalation');
			return true;
		}

		// Confidence was not actually reported by the model — don't trust a synthesized default
		if (signal.confidenceSource === 'defaulted') {
			this.logger.debug('Escalation triggered: Confidence was not reported by the model');
			return true;
		}

		// Confidence below threshold
		if (signal.confidence < this.config.confidenceThreshold) {
			this.logger.debug('Escalation triggered: Confidence below threshold', {
				confidence: signal.confidence,
				threshold: this.config.confidenceThreshold
			});
			return true;
		}

		// High-risk levels should trigger escalation
		if (this.isHighRisk(signal.risk_level)) {
			this.logger.debug('Escalation triggered: High risk level', {
				riskLevel: signal.risk_level
			});
			return true;
		}

		// Any triggered criteria means escalation
		if (signal.triggered_criteria.length > 0) {
			this.logger.debug('Escalation triggered: Criteria matched', {
				triggeredCriteria: signal.triggered_criteria
			});
			return true;
		}

		// High confidence claimed with no supporting reasoning or proposed action is ungrounded
		if (this.hasUnsupportedConfidenceClaim(signal)) {
			this.logger.debug('Escalation triggered: Unsupported high-confidence claim', {
				confidence: signal.confidence
			});
			return true;
		}

		return false;
	}

	/**
	 * Build a forced escalation signal for a stage whose response omitted or malformed
	 * the mandatory `_escalation` block, when `requireExplicitBlock` is enabled.
	 * Returns null when `requireExplicitBlock` is disabled — the caller should then
	 * proceed as if no escalation was required.
	 */
	getMissingSignalEscalation(stageName: string): EscalationSignal | null {
		if (!this.config.requireExplicitBlock) {
			return null;
		}

		return {
			confidence: 0,
			confidenceSource: 'defaulted',
			proposed_action: '',
			reasoning: `Stage '${stageName}' response did not include the mandatory _escalation block.`,
			requires_escalation: true,
			risk_level: 'high',
			triggered_criteria: ['missing_escalation_block']
		};
	}

	/**
	 * A high confidence claim unaccompanied by any reasoning or proposed action is
	 * ungrounded and should not be trusted at face value.
	 */
	private hasUnsupportedConfidenceClaim(signal: EscalationSignal): boolean {
		const UNSUPPORTED_CONFIDENCE_THRESHOLD = 90;
		const MIN_REASONING_LENGTH = 20;

		return (
			signal.confidence >= UNSUPPORTED_CONFIDENCE_THRESHOLD &&
			signal.reasoning.trim().length < MIN_REASONING_LENGTH &&
			signal.proposed_action.trim().length === 0
		);
	}

	/**
	 * Locate the `_escalation` JSON object in content by balanced-brace scanning rather than
	 * regex truncation. For each `"_escalation":` key occurrence (scanned from the last — the
	 * protocol requires the block at the END of the response — since prose could mention the
	 * phrase earlier), walks backward to the enclosing `{` and forward to its matching `}`,
	 * skipping over string-literal contents so braces inside `reasoning`/`proposed_action` text
	 * don't miscount depth. This is robust to nesting depth and to unrelated preamble text
	 * appearing before the JSON inside a fenced block.
	 */
	private extractRawEscalationJson(content: string): null | { end: number; json: string; start: number } {
		const keyMatches: Array<{ keyEnd: number; keyStart: number }> = [];
		let keyMatch: null | RegExpExecArray;
		ESCALATION_KEY_PATTERN.lastIndex = 0;
		while ((keyMatch = ESCALATION_KEY_PATTERN.exec(content)) !== null) {
			keyMatches.push({ keyEnd: keyMatch.index + keyMatch[0].length, keyStart: keyMatch.index });
		}

		// Scanned from the last occurrence — the protocol requires the block at the END of the response.
		for (let i = keyMatches.length - 1; i >= 0; i--) {
			const match = keyMatches[i];
			if (!match) continue;

			// Prefer the wrapping object (`{"_escalation": {...}}`) if one encloses this key...
			const wrapped = this.tryExtractBalancedJson(content, findEnclosingBraceStart(content, match.keyStart));
			if (wrapped) return wrapped;

			// ...otherwise fall back to a standalone `"_escalation": {...}` with no wrapper at all.
			const standalone = this.tryExtractBalancedJson(content, this.findValueBraceStart(content, match.keyEnd));
			if (standalone) return standalone;
		}

		return null;
	}

	/** Extracts and validates a balanced JSON object starting at `start`, or null if unparseable. */
	private tryExtractBalancedJson(
		content: string,
		start: null | number
	): null | { end: number; json: string; start: number } {
		if (start === null) return null;
		const end = findMatchingBracketEnd(content, start);
		if (end === null) return null;

		const json = content.slice(start, end + 1);
		try {
			JSON.parse(json);
		} catch {
			return null;
		}
		return { end, json, start };
	}

	/** Finds the `{` immediately following a `"_escalation":` key with no enclosing wrapper object. */
	private findValueBraceStart(content: string, fromIndex: number): null | number {
		let i = fromIndex;
		while (i < content.length && /\s/.test(content[i] ?? '')) i++;
		return content[i] === '{' ? i : null;
	}

	/**
	 * Parse JSON string to extract EscalationSignal
	 */
	private parseEscalationJson(jsonStr: string): EscalationSignal | null {
		try {
			const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

			// Handle both { _escalation: {...} } and direct signal object
			const signalData = (parsed['_escalation'] ?? parsed) as Record<string, unknown>;

			// Validate required fields
			if (typeof signalData['requires_escalation'] !== 'boolean') {
				return null;
			}

			const confidenceReported = typeof signalData['confidence'] === 'number';

			return {
				confidence: confidenceReported ? (signalData['confidence'] as number) : 50,
				confidenceSource: confidenceReported ? 'reported' : 'defaulted',
				proposed_action: typeof signalData['proposed_action'] === 'string' ? signalData['proposed_action'] : '',
				reasoning: typeof signalData['reasoning'] === 'string' ? signalData['reasoning'] : '',
				requires_escalation: signalData['requires_escalation'] as boolean,
				risk_level: this.parseRiskLevel(signalData['risk_level']),
				triggered_criteria: Array.isArray(signalData['triggered_criteria'])
					? (signalData['triggered_criteria'] as string[])
					: []
			};
		} catch {
			return null;
		}
	}

	/**
	 * Parse and validate risk level
	 */
	private parseRiskLevel(value: unknown): EscalationRiskLevel {
		const validLevels: EscalationRiskLevel[] = ['low', 'medium', 'high', 'critical'];

		if (typeof value === 'string' && validLevels.includes(value as EscalationRiskLevel)) {
			return value as EscalationRiskLevel;
		}

		return 'medium';
	}

	/**
	 * Check if risk level is considered high
	 */
	private isHighRisk(riskLevel: EscalationRiskLevel): boolean {
		return riskLevel === 'high' || riskLevel === 'critical';
	}

	/**
	 * Remove the located escalation JSON object from content by index (precise — no re-guessing
	 * with regex), then strip any markdown fence left empty around it and collapse blank lines.
	 */
	private removeEscalationBlock(content: string, raw: { end: number; start: number }): string {
		let cleaned = content.slice(0, raw.start) + content.slice(raw.end + 1);

		// Strip a fence left empty (whitespace-only) by removing the JSON it wrapped
		cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*```/g, '');

		cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

		return cleaned;
	}
}

/**
 * Singleton instance
 */
let serviceInstance: EscalationDetectionService | null = null;

export function getEscalationDetectionService(config?: Partial<EscalationConfig>): EscalationDetectionService {
	if (!serviceInstance || config) {
		serviceInstance = new EscalationDetectionService(config);
	}
	return serviceInstance;
}
