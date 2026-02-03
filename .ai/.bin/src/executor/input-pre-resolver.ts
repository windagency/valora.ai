/**
 * Input Pre-Resolver - Pre-resolves static stage inputs for performance optimisation
 *
 * This service analyses pipeline stages and pre-resolves inputs that don't depend
 * on previous stage outputs ($STAGE_* variables). This allows:
 * - File contents to be cached upfront
 * - Reduce resolution time during stage execution
 * - Early validation of input availability
 */

import type { PipelineStage } from 'types/command.types';

import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { readFile } from 'utils/file-utils';

import type { VariableResolutionService } from './variable-resolution.service';

export interface PreResolvedInputs {
	/** Map of stage key to pre-resolved inputs */
	stages: Map<string, Record<string, unknown>>;
	/** Map of file path to cached content */
	fileCache: Map<string, string>;
	/** Stages that have all inputs pre-resolved (no $STAGE_* dependencies) */
	fullyResolvedStages: Set<string>;
}

/**
 * Input Pre-Resolver Service
 *
 * Analyses pipeline stages and pre-resolves inputs that don't depend on
 * previous stage outputs, improving pipeline execution performance.
 */
export class InputPreResolver {
	private fileCache: Map<string, string> = new Map();
	private preResolvedInputs: Map<string, Record<string, unknown>> = new Map();

	/**
	 * Pre-resolve static inputs for all stages in a pipeline
	 *
	 * @param stages - Pipeline stages to analyse
	 * @param variableResolver - Variable resolver with current context
	 * @returns PreResolvedInputs containing cached inputs and file contents
	 */
	async preResolveStaticInputs(
		stages: PipelineStage[],
		variableResolver: VariableResolutionService
	): Promise<PreResolvedInputs> {
		const logger = getLogger();
		const fullyResolvedStages = new Set<string>();
		const startTime = Date.now();

		logger.debug('Pre-resolving static inputs for pipeline', {
			stageCount: stages.length
		});

		for (const stage of stages) {
			const stageKey = `${stage.stage}_${stage.prompt}`;

			if (!stage.inputs) {
				// No inputs to resolve
				fullyResolvedStages.add(stageKey);
				continue;
			}

			// Check if inputs contain any $STAGE_* references
			const hasStageRefs = this.hasStageReferences(stage.inputs);

			if (!hasStageRefs) {
				// All inputs are static ($ARG_*, $CONTEXT_*, $ENV_*, or literal values)
				try {
					const resolvedInputs = variableResolver.resolve(stage.inputs);

					// Pre-read file contents for file path arguments
					const enrichedInputs = await this.enrichInputsWithFileContents(resolvedInputs);

					this.preResolvedInputs.set(stageKey, enrichedInputs);
					fullyResolvedStages.add(stageKey);

					logger.debug(`Pre-resolved inputs for stage: ${stageKey}`, {
						inputKeys: Object.keys(enrichedInputs)
					});
				} catch (error) {
					// Resolution failed, stage will resolve at execution time
					logger.debug(`Pre-resolution failed for stage ${stageKey}, will resolve at execution`, {
						error: (error as Error).message
					});
				}
			}
		}

		const duration = Date.now() - startTime;
		logger.debug('Pre-resolution complete', {
			durationMs: duration,
			fullyResolvedCount: fullyResolvedStages.size,
			totalStages: stages.length
		});

		return {
			fileCache: this.fileCache,
			fullyResolvedStages,
			stages: this.preResolvedInputs
		};
	}

	/**
	 * Get pre-resolved inputs for a stage if available
	 */
	getPreResolvedInputs(stageKey: string): Record<string, unknown> | undefined {
		return this.preResolvedInputs.get(stageKey);
	}

	/**
	 * Get cached file content if available
	 */
	getCachedFileContent(filePath: string): string | undefined {
		return this.fileCache.get(filePath);
	}

	/**
	 * Check if inputs contain any $STAGE_* variable references
	 */
	private hasStageReferences(inputs: Record<string, unknown>): boolean {
		const stagePattern = /\$STAGE_/;

		const checkValue = (value: unknown): boolean => {
			if (typeof value === 'string') {
				return stagePattern.test(value);
			}
			if (Array.isArray(value)) {
				return value.some(checkValue);
			}
			if (typeof value === 'object' && value !== null) {
				return Object.values(value).some(checkValue);
			}
			return false;
		};

		return Object.values(inputs).some(checkValue);
	}

	/**
	 * Enrich inputs by reading file contents for file path arguments
	 * Caches file contents for reuse
	 */
	private async enrichInputsWithFileContents(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
		const logger = getLogger();
		const enriched: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(inputs)) {
			// Check if this is a file path argument (ends with _file, _file_arg, or _path)
			const isFileArg = key.endsWith('_file') || key.endsWith('_file_arg') || key.endsWith('_path');

			if (isFileArg && typeof value === 'string' && value.trim()) {
				const filePath = value.trim();

				// Check cache first
				if (this.fileCache.has(filePath)) {
					enriched[key] = filePath;
					enriched[`${key}_content`] = this.fileCache.get(filePath);
					continue;
				}

				// Check if file exists
				if (existsSync(filePath)) {
					try {
						const content = await readFile(filePath);
						this.fileCache.set(filePath, content);

						logger.debug(`Pre-cached file content: ${filePath} (${content.length} chars)`);

						// Include both the path and the content
						enriched[key] = filePath;
						enriched[`${key}_content`] = content;
					} catch (error) {
						logger.debug(`Failed to pre-read file: ${filePath}`, {
							error: (error as Error).message
						});
						enriched[key] = value;
					}
				} else {
					enriched[key] = value;
				}
			} else {
				enriched[key] = value;
			}
		}

		return enriched;
	}

	/**
	 * Clear cached data
	 */
	clear(): void {
		this.fileCache.clear();
		this.preResolvedInputs.clear();
	}
}

/**
 * Singleton instance for global access
 */
let inputPreResolverInstance: InputPreResolver | null = null;

export function getInputPreResolver(): InputPreResolver {
	inputPreResolverInstance ??= new InputPreResolver();
	return inputPreResolverInstance;
}

export function resetInputPreResolver(): void {
	inputPreResolverInstance = null;
}
