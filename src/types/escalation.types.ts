/**
 * Escalation Types
 *
 * Type definitions for the escalation enforcement system.
 * Used to detect when LLM responses trigger escalation criteria
 * and require human confirmation before proceeding.
 */

/**
 * Risk levels for escalation signals
 */
export type EscalationRiskLevel = 'critical' | 'high' | 'low' | 'medium';

/**
 * Human decision options for escalation handling
 */
export type EscalationDecisionType = 'abort' | 'modify' | 'proceed';

/**
 * LLM's escalation output structure embedded in responses
 */
export interface EscalationSignal {
	/** Self-reported by the model (0-100) — not independently computed or verified. */
	confidence: number;
	/** Whether `confidence` was actually reported by the model ('reported') or synthesized because the model omitted/malformed the field ('defaulted'). */
	confidenceSource: 'defaulted' | 'reported';
	proposed_action: string;
	reasoning: string;
	requires_escalation: boolean;
	risk_level: EscalationRiskLevel;
	triggered_criteria: string[];
}

/**
 * Human's decision after reviewing escalation
 */
export interface EscalationDecision {
	decision: EscalationDecisionType;
	guidance?: string; // Optional custom guidance for 'modify' decision
	timestamp: number;
}

/**
 * Context passed to the escalation handler for display
 */
export interface EscalationContext {
	agentRole: string;
	/** Whether a "Modify" decision would actually cause a retry. False on the final retry attempt — the handler should not offer a choice that silently does nothing. */
	allowModify: boolean;
	escalationCriteria: string[];
	llmResponse: string;
	signal: EscalationSignal;
	stageName: string;
}

/**
 * Result after handling escalation
 */
export interface EscalationResult {
	decision: EscalationDecision;
	handled: boolean;
	modifiedGuidance?: string;
	shouldAbort: boolean;
	shouldProceed: boolean;
}

/**
 * Result of parsing LLM response for escalation
 */
export interface EscalationParseResult {
	cleanedContent: string; // Response content with escalation block removed
	parseError?: string;
	signal: EscalationSignal | null;
}

/**
 * Configuration for sampling the model multiple times to independently check a
 * borderline confidence report, rather than trusting the model's single self-assessment.
 */
export interface SelfConsistencyConfig {
	/** Only sample when confidence is in [threshold, threshold + borderlineBand) and no escalation was otherwise triggered. */
	borderlineBand: number;
	enabled: boolean;
	/** Extra LLM calls fired per borderline check (total samples = 1 + sampleCount). */
	sampleCount: number;
}

/**
 * Configuration for escalation detection
 */
export interface EscalationConfig {
	/** Confidence threshold below which escalation is triggered (0-100) */
	confidenceThreshold: number;
	/**
	 * When true, a stage configured with escalation criteria that responds without a
	 * parseable `_escalation` block is treated as an escalation itself (fail closed)
	 * rather than silently proceeding as if no escalation were required.
	 */
	requireExplicitBlock: boolean;
	/** See `SelfConsistencyConfig`. */
	selfConsistency: SelfConsistencyConfig;
}

/**
 * Default escalation configuration
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
	confidenceThreshold: 70,
	requireExplicitBlock: true,
	selfConsistency: {
		borderlineBand: 10,
		enabled: true,
		sampleCount: 2
	}
};
