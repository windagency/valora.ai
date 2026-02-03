/**
 * Template Loader - Loads and populates template files with variables
 *
 * Provides caching and variable substitution for markdown templates
 */

import path from 'path';

import { getAIRoot, readFile } from './file-utils';

export interface TemplateVariables {
	[key: string]: number | string | undefined;
}

export class TemplateLoader {
	private templateCache: Map<string, string> = new Map();

	/**
	 * Load a template file from .ai/templates/
	 * Results are cached for performance
	 */
	async loadTemplate(templateName: string): Promise<string> {
		// Check cache first
		if (this.templateCache.has(templateName)) {
			return this.templateCache.get(templateName)!;
		}

		// Construct path to template file
		const aiRoot = getAIRoot();
		const templatePath = path.join(aiRoot, 'templates', `${templateName}.md`);

		// Load template content
		const content = await readFile(templatePath);

		// Cache for future use
		this.templateCache.set(templateName, content);

		return content;
	}

	/**
	 * Populate template with variable values
	 * Replaces {{variableName}} placeholders with actual values
	 */
	populateTemplate(template: string, variables: TemplateVariables): string {
		// First, replace all provided variables
		let result = Object.entries(variables).reduce((acc, [key, value]) => {
			const placeholder = `{{${key}}}`;
			const replacement = String(value ?? '');
			// Use global regex to replace all occurrences
			return acc.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
		}, template);

		// Then, replace any remaining {{...}} placeholders with empty strings
		result = result.replace(/\{\{[^}]+\}\}/g, '');

		return result;
	}

	/**
	 * Load a template and populate it with variables in one call
	 */
	async renderTemplate(templateName: string, variables: TemplateVariables): Promise<string> {
		const template = await this.loadTemplate(templateName);
		return this.populateTemplate(template, variables);
	}

	/**
	 * Clear the template cache
	 * Useful for testing or if templates are modified at runtime
	 */
	clearCache(): void {
		this.templateCache.clear();
	}
}

// Singleton instance
let templateLoaderInstance: null | TemplateLoader = null;

/**
 * Get the singleton TemplateLoader instance
 */
export function getTemplateLoader(): TemplateLoader {
	templateLoaderInstance ??= new TemplateLoader();
	return templateLoaderInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTemplateLoader(): void {
	templateLoaderInstance = null;
}
