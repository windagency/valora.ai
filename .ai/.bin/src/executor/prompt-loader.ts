/**
 * Prompt loader - loads prompt definitions from markdown files
 */

import type { PromptDefinition, PromptMetadata } from 'types/prompt.types';

import { getLogger } from 'output/logger';
import * as path from 'path';
import { ValidationError } from 'utils/error-handler';
import { findFiles, readFile, resolveAIPath } from 'utils/file-utils';
import { parseMarkdownWithFrontmatter, validateRequiredFields, YamlParseError } from 'utils/yaml-parser';

export class PromptLoader {
	private cache: Map<string, PromptDefinition> = new Map();
	private promptsDir: string;

	constructor(promptsDir?: string) {
		this.promptsDir = promptsDir ?? resolveAIPath('prompts');
	}

	/**
	 * Load a specific prompt by ID (category.name format)
	 */
	async loadPrompt(promptId: string): Promise<PromptDefinition> {
		// Check cache first
		if (this.cache.has(promptId)) {
			return this.cache.get(promptId)!;
		}

		// Parse prompt ID (e.g., "context.analyze-task-context" -> "02_context/analyze-task-context.md")
		const [category, name] = promptId.split('.');
		if (!category || !name) {
			throw new ValidationError(`Invalid prompt ID format: ${promptId}`, {
				expected: 'category.name'
			});
		}

		// Find the prompt file
		const promptFile = this.findPromptFile(category, name);

		try {
			const content = await readFile(promptFile);
			const parsed = parseMarkdownWithFrontmatter<PromptMetadata>(content, promptFile);

			// Validate required fields
			validateRequiredFields(
				parsed.metadata as unknown as Record<string, unknown>,
				['id', 'version', 'category', 'name', 'description'],
				promptFile
			);

			// Verify ID matches
			if (parsed.metadata.id !== promptId) {
				throw new ValidationError(`Prompt ID mismatch in ${promptFile}`, {
					actual: parsed.metadata.id,
					expected: promptId
				});
			}

			const prompt: PromptDefinition = {
				...parsed.metadata,
				content: parsed.content
			};

			// Cache the prompt
			this.cache.set(promptId, prompt);

			return prompt;
		} catch (error) {
			if (error instanceof YamlParseError || error instanceof ValidationError) {
				throw error;
			}
			throw new ValidationError(`Failed to load prompt: ${promptId}`, {
				error: (error as Error).message,
				file: promptFile
			});
		}
	}

	/**
	 * Find prompt file by category and name
	 */
	private findPromptFile(category: string, name: string): string {
		// Map category to directory prefix
		const categoryMap: Record<string, string> = {
			code: '04_code',
			context: '02_context',
			deployment: '08_deployment',
			documentation: '07_documentation',
			maintenance: '10_maintenance',
			onboard: '01_onboard',
			plan: '03_plan',
			refactor: '09_refactor',
			review: '05_review',
			test: '06_test'
		};

		const dirPrefix = categoryMap[category];
		if (!dirPrefix) {
			throw new ValidationError(`Unknown prompt category: ${category}`);
		}

		const categoryDir = path.join(this.promptsDir, dirPrefix);
		const promptFile = path.join(categoryDir, `${name}.md`);

		return promptFile;
	}

	/**
	 * Load all prompts in a category
	 */
	async loadCategoryPrompts(category: string): Promise<Map<string, PromptDefinition>> {
		const categoryMap: Record<string, string> = {
			code: '04_code',
			context: '02_context',
			deployment: '08_deployment',
			documentation: '07_documentation',
			maintenance: '10_maintenance',
			onboard: '01_onboard',
			plan: '03_plan',
			refactor: '09_refactor',
			review: '05_review',
			test: '06_test'
		};

		const dirPrefix = categoryMap[category];
		if (!dirPrefix) {
			throw new ValidationError(`Unknown prompt category: ${category}`);
		}

		const categoryDir = path.join(this.promptsDir, dirPrefix);
		const files = await findFiles(categoryDir, /\.md$/);

		const logger = getLogger();

		const promptEntries = await Promise.all(
			files.map(async (file) => {
				try {
					const content = await readFile(file);
					const parsed = parseMarkdownWithFrontmatter<PromptMetadata>(content, file);

					if (parsed.metadata.id) {
						const prompt: PromptDefinition = {
							...parsed.metadata,
							content: parsed.content
						};
						this.cache.set(parsed.metadata.id, prompt);
						return [parsed.metadata.id, prompt] as const;
					}
				} catch (error) {
					logger.warn(`Failed to load prompt ${file}`, { error: (error as Error).message });
				}
				return null;
			})
		);

		const prompts = new Map<string, PromptDefinition>(
			promptEntries.filter((entry): entry is [string, PromptDefinition] => entry !== null)
		);

		return prompts;
	}

	/**
	 * List all available prompts
	 */
	async listPrompts(): Promise<string[]> {
		const allFiles = await findFiles(this.promptsDir, /\.md$/);

		const promptIds = await Promise.all(
			allFiles
				.filter((file) => !file.includes('/_')) // Skip template and meta files
				.map(async (file) => {
					try {
						const content = await readFile(file);
						const parsed = parseMarkdownWithFrontmatter<PromptMetadata>(content);
						return parsed.metadata.id ?? null;
					} catch {
						// Skip invalid files
						return null;
					}
				})
		);

		return promptIds.filter((id): id is string => id !== null);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache size
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	/**
	 * Inject a pre-loaded prompt into the cache
	 * Used by dry-run cache to speed up subsequent execution
	 */
	injectCachedPrompt(promptId: string, prompt: PromptDefinition): void {
		this.cache.set(promptId, prompt);
	}
}
