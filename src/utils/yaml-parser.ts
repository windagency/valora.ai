/**
 * YAML frontmatter parser utilities
 */

import matter from 'gray-matter';
import { parse as parseYaml, stringify as stringifyYamlLib } from 'yaml';

export interface ParsedMarkdown<T = Record<string, unknown>> {
	content: string;
	metadata: T;
	raw: string;
}

export class YamlParseError extends Error {
	constructor(
		message: string,
		public readonly filePath?: string,
		public override readonly cause?: Error
	) {
		super(message);
		this.name = 'YamlParseError';
	}
}

/**
 * Parse markdown file with YAML frontmatter
 */
export function parseMarkdownWithFrontmatter<T = Record<string, unknown>>(
	content: string,
	filePath?: string
): ParsedMarkdown<T> {
	try {
		const { content: markdownContent, data } = matter(content);
		return {
			content: markdownContent.trim(),
			metadata: data as T,
			raw: content
		};
	} catch (error) {
		throw new YamlParseError(
			`Failed to parse YAML frontmatter${filePath ? ` in ${filePath}` : ''}`,
			filePath,
			error as Error
		);
	}
}

/**
 * Parse standalone YAML content
 */
export function parseYamlContent<T = Record<string, unknown>>(content: string, filePath?: string): T {
	try {
		return parseYaml(content) as T;
	} catch (error) {
		throw new YamlParseError(`Failed to parse YAML${filePath ? ` in ${filePath}` : ''}`, filePath, error as Error);
	}
}

/**
 * Validate that required fields exist in metadata
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
	metadata: T,
	requiredFields: Array<keyof T>,
	filePath?: string
): void {
	const missingFields = requiredFields.filter((field) => !(field in metadata));

	if (missingFields.length > 0) {
		throw new YamlParseError(
			`Missing required fields: ${missingFields.join(', ')}${filePath ? ` in ${filePath}` : ''}`,
			filePath
		);
	}
}

/**
 * Extract frontmatter section from markdown
 */
export function extractFrontmatter(content: string): null | string {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	return match?.[1] ?? null;
}

/**
 * Check if content has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
	return content.trimStart().startsWith('---');
}

/**
 * Stringify object to YAML format
 */
export function stringifyYaml<T>(data: T): string {
	return stringifyYamlLib(data);
}
