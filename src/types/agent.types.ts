/**
 * Agent type definitions
 */

import type { OutputFormat } from './common.types';

export interface AgentCapabilities {
	can_review_code: boolean;
	can_run_tests: boolean;
	can_write_code: boolean;
	can_write_knowledge: boolean;
}

export interface AgentConstraints {
	forbidden_paths?: string[];
	requires_approval_for?: string[];
}

export interface AgentContext {
	availableTools: string[];
	constraints: AgentConstraints;
	currentTask?: string;
	role: string;
}

export interface AgentContextRequirements {
	requires_codebase_analysis?: boolean;
	requires_dependencies_list?: boolean;
	requires_knowledge_gathering?: boolean;
	requires_project_history?: boolean;
	requires_test_results?: boolean;
}

export interface AgentDecisionMaking {
	autonomy_level: AutonomyLevel;
	escalation_criteria?: string[];
}

export interface AgentDefinition extends AgentMetadata {
	content: string;
}

export interface AgentMetadata {
	capabilities: AgentCapabilities;
	constraints?: AgentConstraints;
	context_requirements?: AgentContextRequirements;
	decision_making?: AgentDecisionMaking;
	description: string;
	experimental?: boolean;
	expertise?: string[];
	output_format?: AgentOutputFormat;
	responsibilities?: string[];
	role: string;
	specialization: string;
	tone: ToneStyle;
	version: string;
}

export interface AgentOutputFormat {
	format: OutputFormat;
	include_alternatives?: boolean;
	include_reasoning?: boolean;
}

export type AutonomyLevel = 'high' | 'low' | 'medium';

export type ToneStyle = 'casual-friendly' | 'concise-technical' | 'detailed-explanatory' | 'formal-professional';

/**
 * Dynamic Agent Selection Types
 */

export interface AgentCapability {
	domains: TaskDomain[];
	expertise: string[];
	priority: number;
	role: string;
	selectionCriteria: SelectionCriterion[];
}

export interface AgentScore {
	capability: AgentCapability;
	reasons: string[];
	role: string;
	score: number;
}

export interface AgentSelection {
	alternatives: Array<{
		agent: string;
		reasons: string[];
		score: number;
	}>;
	confidence: number;
	fallback?: boolean;
	fallbackAgent?: string;
	reasons: string[];
	selectedAgent: string;
}

export interface CodebaseContext {
	affectedFileTypes: string[];
	architecturalPatterns: string[];
	importPatterns: string[];
	infrastructureComponents: string[];
	technologyStack: string[];
}

/**
 * Selection criteria for agent matching.
 * Extensible via registry.json — new criteria can be added without code changes.
 */
export type SelectionCriterion = string;

export interface TaskClassification {
	complexity: 'high' | 'low' | 'medium';
	confidence: number;
	primaryDomain: TaskDomain;
	reasons: string[];
	suggestedAgents: string[];
}

export interface TaskContext {
	affectedFiles: string[];
	complexity: 'high' | 'low' | 'medium';
	dependencies: string[];
	description: string;
	metadata?: Record<string, unknown>;
	primaryDomain?: TaskDomain;
	secondaryDomains?: TaskDomain[];
}

/**
 * Task domain identifier aligned with registry.json taskDomains.
 * The registry is the single source of truth for domain names.
 * Using string to allow dynamic extension for new languages and frameworks
 * (e.g. 'python-core', 'java-backend', 'rust-systems') without code changes.
 */
export type TaskDomain = string;
