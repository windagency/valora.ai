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
	confidence: number; // 0-100
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
 * Configuration for escalation detection
 */
export interface EscalationConfig {
	/** Confidence threshold below which escalation is triggered (0-100) */
	confidenceThreshold: number;
	/** Whether to require explicit escalation block in response */
	requireExplicitBlock: boolean;
}

/**
 * Default escalation configuration
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
	confidenceThreshold: 70,
	requireExplicitBlock: true
};
