/**
 * Prompt loader - loads prompt definitions from markdown files
 */

import * as path from 'path';

import type { PromptDefinition, PromptMetadata } from 'types/prompt.types';

import { getLogger } from 'output/logger';
import { ValidationError } from 'utils/error-handler';
import { fileExists, FileNotFoundError, findFiles, readFile } from 'utils/file-utils';
import { getPackageDataDir } from 'utils/paths';
import { parseMarkdownWithFrontmatter, validateRequiredFields, YamlParseError } from 'utils/yaml-parser';

export class PromptLoader {
	private static readonly CATEGORY_DIR_MAP: Record<string, string> = {
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

	private cache: Map<string, PromptDefinition> = new Map();
	private pluginPromptsDirs = new Set<string>();
	private promptsDir: string;

	constructor(promptsDir?: string) {
		this.promptsDir = promptsDir ?? path.join(getPackageDataDir(), 'prompts');
	}

	/**
	 * Register an additional prompts root contributed by a plugin.
	 * Plugin prompts must use existing categories; new categories are not supported.
	 */
	registerPluginPromptsDir(dir: string): void {
		this.pluginPromptsDirs.add(dir);
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
				content: await this.resolveIncludes(parsed.content)
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
	 * Find prompt file by category and name.
	 * Checks the primary prompts directory first, then plugin prompt directories.
	 */
	private findPromptFile(category: string, name: string): string {
		const dirPrefix = PromptLoader.CATEGORY_DIR_MAP[category];
		if (!dirPrefix) {
			throw new ValidationError(`Unknown prompt category: ${category}`);
		}

		const primaryFile = path.join(this.promptsDir, dirPrefix, `${name}.md`);
		if (fileExists(primaryFile)) return primaryFile;

		for (const pluginDir of this.pluginPromptsDirs) {
			const candidate = path.join(pluginDir, dirPrefix, `${name}.md`);
			if (fileExists(candidate)) return candidate;
		}

		return primaryFile; // Preserve existing error path when prompt is not found
	}

	/**
	 * Load all prompts in a category
	 */
	async loadCategoryPrompts(category: string): Promise<Map<string, PromptDefinition>> {
		const dirPrefix = PromptLoader.CATEGORY_DIR_MAP[category];
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
	 * Resolve {{include:path/to/file.md}} directives in prompt content.
	 *
	 * Each directive is replaced with the verbatim contents of the referenced
	 * file under the prompts directory. Resolution is **single-pass**: if an
	 * included file itself contains `{{include:...}}` directives, those are left
	 * unexpanded. Missing files produce a warning and are replaced with an empty
	 * string so the calling prompt still loads cleanly. All other read errors are
	 * re-thrown as `ValidationError` to preserve full context up the call stack.
	 */
	private async resolveIncludes(content: string): Promise<string> {
		const matches = [...content.matchAll(/\{\{include:([^}]+)\}\}/g)];

		if (matches.length === 0) {
			return content;
		}

		const logger = getLogger();
		let resolved = content;

		for (const match of matches) {
			const directive = match[0];
			const relativePath = (match[1] ?? '').trim();
			const absolutePath = path.join(this.promptsDir, relativePath);

			try {
				const included = await readFile(absolutePath);
				resolved = resolved.replace(directive, included);
			} catch (error) {
				if (error instanceof FileNotFoundError) {
					logger.warn(`{{include}} target not found, skipping directive`, {
						directive,
						path: absolutePath
					});
					resolved = resolved.replace(directive, '');
				} else {
					throw new ValidationError(`Failed to resolve include directive`, {
						directive,
						error: (error as Error).message,
						path: absolutePath
					});
				}
			}
		}

		return resolved;
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
