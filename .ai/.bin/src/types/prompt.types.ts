/**
 * Prompt type definitions
 */

import type { InputType } from './common.types';

export type PromptCategory =
	| 'code'
	| 'context'
	| 'deployment'
	| 'documentation'
	| 'maintenance'
	| 'onboard'
	| 'plan'
	| 'refactor'
	| 'review'
	| 'test';

export interface PromptDefinition extends PromptMetadata {
	content: string;
}

export interface PromptDependencies {
	optional?: string[];
	requires?: string[];
}

export interface PromptExecutionContext {
	agent?: string;
	inputs: Record<string, unknown>;
	model?: string;
	promptId: string;
}

export interface PromptInput {
	description: string;
	name: string;
	required: boolean;
	type: InputType;
	validation?: {
		max?: number;
		min?: number;
		pattern?: string;
	};
}

export interface PromptMetadata {
	agents?: string[];
	category: PromptCategory;
	dependencies?: PromptDependencies;
	description: string;
	experimental?: boolean;
	id: string;
	inputs?: PromptInput[];
	model_requirements?: PromptModelRequirements;
	name: string;
	outputs?: string[];
	tags?: string[];
	tokens?: PromptTokenEstimate;
	version: string;
}

export interface PromptModelRequirements {
	min_context: number;
	recommended: string[];
}

export interface PromptOutput {
	description?: string;
	name: string;
	type?: string;
}

export interface PromptResult {
	duration_ms: number;
	error?: string;
	outputs: Record<string, unknown>;
	success: boolean;
	tokensUsed?: number;
}

export interface PromptTokenEstimate {
	avg: number;
	max: number;
	min: number;
}
