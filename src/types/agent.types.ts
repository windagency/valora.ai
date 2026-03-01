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

export type SelectionCriterion =
	| 'accessibility-files'
	| 'architecture-files'
	| 'audit-files'
	| 'authentication-code'
	| 'cloud-config'
	| 'code-files'
	| 'config-files'
	| 'design-files'
	| 'docker-files'
	| 'documentation-files'
	| 'encryption-code'
	| 'engineering-docs'
	| 'infrastructure-files'
	| 'kubernetes-manifests'
	| 'leadership-docs'
	| 'policy-files'
	| 'product-docs'
	| 'qa-scripts'
	| 'react-imports'
	| 'requirements-files'
	| 'roadmap-files'
	| 'security-files'
	| 'strategy-files'
	| 'terraform-files'
	| 'test-files'
	| 'test-reports'
	| 'testing-config'
	| 'type-definitions'
	| 'typescript-files'
	| 'ui-mockups'
	| 'user-stories'
	| 'ux-research';

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

export type TaskDomain =
	| 'infrastructure'
	| 'security'
	| 'typescript-backend-general'
	| 'typescript-core'
	| 'typescript-frontend-general'
	| 'typescript-frontend-react'
	| 'ui-ux-designer';
