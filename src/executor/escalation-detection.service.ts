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

/**
 * Regex pattern to match the _escalation JSON block in LLM responses
 * Matches both fenced code blocks and raw JSON objects containing _escalation
 */
const ESCALATION_BLOCK_PATTERN =
	/```(?:json)?\s*\n?\s*(\{[\s\S]*?"_escalation"[\s\S]*?\})\s*\n?```|(\{[\s\S]*?"_escalation"[\s\S]*?\})/;

/**
 * Alternative pattern for standalone _escalation object
 */
const ESCALATION_OBJECT_PATTERN = /"_escalation"\s*:\s*(\{[\s\S]*?\})\s*\}?\s*$/;

export class EscalationDetectionService {
	private readonly config: EscalationConfig;
	private readonly logger = getLogger();

	constructor(config: Partial<EscalationConfig> = {}) {
		this.config = { ...DEFAULT_ESCALATION_CONFIG, ...config };
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
			// Try to find escalation block using various patterns
			const signal = this.extractEscalationSignal(content);

			if (!signal) {
				this.logger.debug('No escalation signal found in response');
				return {
					cleanedContent: content,
					signal: null
				};
			}

			// Remove the escalation block from content
			const cleanedContent = this.removeEscalationBlock(content);

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

		return false;
	}

	/**
	 * Extract escalation signal from content
	 */
	private extractEscalationSignal(content: string): EscalationSignal | null {
		// Try full block pattern first (including wrapper object)
		const blockMatch = content.match(ESCALATION_BLOCK_PATTERN);

		if (blockMatch) {
			const jsonStr = blockMatch[1] ?? blockMatch[2];
			if (jsonStr) {
				return this.parseEscalationJson(jsonStr);
			}
		}

		// Try standalone _escalation object pattern
		const objectMatch = content.match(ESCALATION_OBJECT_PATTERN);

		if (objectMatch) {
			return this.parseEscalationJson(`{"_escalation": ${objectMatch[1]}}`);
		}

		// Try to find any JSON block containing _escalation
		const jsonBlocks = this.findJsonBlocks(content);

		for (const block of jsonBlocks) {
			if (block.includes('_escalation')) {
				const signal = this.parseEscalationJson(block);
				if (signal) {
					return signal;
				}
			}
		}

		return null;
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

			return {
				confidence: typeof signalData['confidence'] === 'number' ? signalData['confidence'] : 50,
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
	 * Remove escalation block from content
	 */
	private removeEscalationBlock(content: string): string {
		// Remove fenced code block containing _escalation
		let cleaned = content.replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"_escalation"[\s\S]*?\}\s*\n?```/g, '');

		// Remove trailing raw JSON block with _escalation
		cleaned = cleaned.replace(/\{[\s\S]*?"_escalation"[\s\S]*?\}\s*$/g, '');

		// Clean up excess whitespace
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

		return cleaned;
	}

	/**
	 * Find all JSON blocks in content
	 */
	private findJsonBlocks(content: string): string[] {
		const blocks: string[] = [];

		// Find fenced code blocks
		const fencedPattern = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
		let match;

		while ((match = fencedPattern.exec(content)) !== null) {
			const innerContent = match[1];
			if (innerContent?.trim().startsWith('{')) {
				blocks.push(innerContent.trim());
			}
		}

		// Find trailing JSON object
		const trailingMatch = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*$/);
		if (trailingMatch) {
			blocks.push(trailingMatch[0]);
		}

		return blocks;
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
