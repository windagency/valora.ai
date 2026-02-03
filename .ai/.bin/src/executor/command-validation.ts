/**
 * Command validation utilities - handles command definition validation and metadata checking
 */

import type { CommandMetadata } from 'types/command.types';

import { ValidationError } from 'utils/error-handler';
import { validateRequiredFields, YamlParseError } from 'utils/yaml-parser';

/**
 * Required fields for command metadata
 */
export const REQUIRED_COMMAND_FIELDS = ['name', 'description', 'model', 'allowed-tools', 'prompts'];

/**
 * Validate command metadata structure
 */
export function validateCommandMetadata(metadata: CommandMetadata, filePath: string): void {
	// Validate required fields
	validateRequiredFields(metadata as unknown as Record<string, unknown>, REQUIRED_COMMAND_FIELDS, filePath);

	// Additional validation for agent field based on dynamic selection
	if (!metadata.dynamic_agent_selection && !metadata.agent) {
		throw new ValidationError('Command must have either an agent field or dynamic_agent_selection enabled', {
			file: filePath
		});
	}

	if (metadata.dynamic_agent_selection && !metadata.fallback_agent) {
		throw new ValidationError('Commands with dynamic_agent_selection must specify a fallback_agent', {
			file: filePath
		});
	}

	// Validate prompts structure
	if (!metadata.prompts?.pipeline || !Array.isArray(metadata.prompts.pipeline)) {
		throw new ValidationError('Command must have a valid prompts.pipeline array', {
			file: filePath
		});
	}

	// Validate pipeline stages
	validatePipelineStages(metadata.prompts.pipeline, filePath);
}

/**
 * Validate pipeline stages structure
 */
export function validatePipelineStages(pipeline: unknown[], filePath: string): void {
	if (!Array.isArray(pipeline)) {
		throw new ValidationError('Pipeline must be an array', {
			file: filePath
		});
	}

	pipeline.forEach((stage) => {
		if (typeof stage !== 'object' || stage === null) {
			throw new ValidationError('Pipeline stage must be an object', {
				file: filePath,
				stage
			});
		}

		const stageObj = stage as Record<string, unknown>;

		if (!stageObj['stage'] || typeof stageObj['stage'] !== 'string') {
			throw new ValidationError('Pipeline stage must have a "stage" string property', {
				file: filePath,
				stage: stageObj
			});
		}

		if (!stageObj['prompt'] || typeof stageObj['prompt'] !== 'string') {
			throw new ValidationError('Pipeline stage must have a "prompt" string property', {
				file: filePath,
				stage: stageObj
			});
		}
	});
}

/**
 * Handle command loading errors with appropriate error types
 */
export function handleCommandLoadError(error: unknown, commandName: string, filePath: string): never {
	if (error instanceof YamlParseError || error instanceof ValidationError) {
		throw error;
	}
	throw new ValidationError(`Failed to load command: ${commandName}`, {
		error: (error as Error).message,
		file: filePath
	});
}
