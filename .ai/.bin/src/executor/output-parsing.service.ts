/**
 * Output Parsing Service
 *
 * Handles parsing and extraction of structured outputs from LLM responses.
 * Extracted from StageExecutor to follow Single Responsibility Principle.
 *
 * Features:
 * - JSON extraction from markdown code blocks
 * - Fallback parsing for malformed JSON
 * - Pattern matching for value extraction
 * - Default value application for missing fields
 */

import { getLogger } from 'output/logger';

type Logger = ReturnType<typeof getLogger>;

/**
 * Result of parsing stage outputs
 */
export interface ParsedOutputs {
	/** Extracted output values */
	outputs: Record<string, unknown>;
	/** Whether parsing was successful */
	success: boolean;
	/** Method used for extraction */
	method: 'fallback' | 'json' | 'pattern';
}

/**
 * Service for parsing LLM outputs into structured data
 */
export class OutputParsingService {
	private readonly logger: Logger;

	constructor(logger?: Logger) {
		this.logger = logger ?? getLogger();
	}

	/**
	 * Parse stage outputs from completion content
	 */
	parseStageOutputs(content: string, expectedOutputs: string[]): Record<string, unknown> {
		try {
			let jsonContent = content.trim();

			// Remove control characters and ANSI escape codes FIRST
			jsonContent = this.sanitizeContent(jsonContent);

			// Check if content contains JSON in markdown code blocks
			jsonContent = this.extractJsonFromCodeBlocks(jsonContent);

			// Remove any leading/trailing whitespace
			jsonContent = jsonContent.trim();

			// Try to find JSON object or array start if content has extra text
			const jsonStartMatch = jsonContent.match(/^[^{[]*([{[][\s\S]*[}\]])[^}\]]*$/);
			if (jsonStartMatch?.[1]) {
				jsonContent = jsonStartMatch[1];
			}

			// Fix common JSON formatting issues before parsing
			jsonContent = this.fixCommonJsonIssues(jsonContent);

			// Try to parse the content as JSON
			const parsed = JSON.parse(jsonContent) as Record<string, unknown>;

			// Extract expected outputs from the parsed JSON
			const result = expectedOutputs.reduce(
				(acc, outputName) => {
					if (Object.prototype.hasOwnProperty.call(parsed, outputName)) {
						acc[outputName] = parsed[outputName];
					}
					return acc;
				},
				{} as Record<string, unknown>
			);

			// If some outputs are missing, try to extract from nested JSON blocks
			const missingOutputs = expectedOutputs.filter((o) => result[o] === undefined);
			if (missingOutputs.length > 0) {
				this.extractFromNestedJsonBlocks(content, missingOutputs, result);
			}

			return result;
		} catch (error) {
			// Clean content for logging display
			// eslint-disable-next-line no-control-regex
			const cleanContent = content.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

			this.logger.warn('Failed to parse stage outputs as JSON', {
				content: cleanContent.substring(0, 500),
				error: (error as Error).message
			});

			// Try alternative approaches
			return this.fallbackExtraction(content, expectedOutputs);
		}
	}

	/**
	 * Apply default values for missing expected outputs
	 */
	applyDefaultValues(parsedOutputs: Record<string, unknown>, expectedOutputs: string[]): Record<string, unknown> {
		const result = { ...parsedOutputs };

		for (const outputName of expectedOutputs) {
			if (result[outputName] === undefined) {
				const defaultValue = this.getDefaultValueForOutput(outputName);

				if (defaultValue !== undefined) {
					result[outputName] = defaultValue;
					this.logger.warn(`Applied default value for missing output: ${outputName}`, {
						defaultValue: typeof defaultValue === 'object' ? JSON.stringify(defaultValue) : defaultValue
					});
				}
			}
		}

		return result;
	}

	/**
	 * Sanitize content by removing control characters and ANSI codes
	 */
	private sanitizeContent(content: string): string {
		let sanitized = content;

		// Remove ANSI escape codes
		// eslint-disable-next-line no-control-regex
		sanitized = sanitized.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

		// Remove [CTRL] markers from sanitizer
		sanitized = sanitized.replace(/\[CTRL\]/g, '');

		// Remove control characters, preserving newlines and tabs
		// eslint-disable-next-line no-control-regex
		sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
			if (match === '\n' || match === '\r' || match === '\t') {
				return match;
			}
			return '';
		});

		return sanitized;
	}

	/**
	 * Extract JSON content from markdown code blocks
	 *
	 * Handles:
	 * - Standard: ```json\n{...}\n```
	 * - No newline: ```json{...}```
	 * - No language: ```{...}```
	 * - Unclosed blocks: ```json{...} (no closing ```)
	 * - Multiple code blocks (takes first JSON one)
	 */
	extractJsonFromCodeBlocks(content: string): string {
		// Try each pattern in order of specificity
		const patterns = this.getCodeBlockPatterns();

		for (const { pattern, requiresJsonCheck } of patterns) {
			const result = this.tryExtractWithPattern(content, pattern, requiresJsonCheck);
			if (result) {
				return result;
			}
		}

		// Check for unclosed code block (special handling)
		const unclosedResult = this.tryExtractUnclosedBlock(content);
		if (unclosedResult) {
			return unclosedResult;
		}

		// No code block found, return original content
		return content;
	}

	/**
	 * Get ordered list of code block patterns to try
	 */
	private getCodeBlockPatterns(): Array<{ pattern: RegExp; requiresJsonCheck: boolean }> {
		return [
			// Standard code block with proper newlines
			{ pattern: /```(?:json)?\s*\n([\s\S]*?)\n\s*```/, requiresJsonCheck: true },
			// Code block with JSON right after language tag
			{ pattern: /```json\s*(\{[\s\S]*?\})\s*```/, requiresJsonCheck: false },
			// Code block without language tag
			{ pattern: /```\s*(\{[\s\S]*?\})\s*```/, requiresJsonCheck: false },
			// Generic - any content between ``` markers
			{ pattern: /```(?:json)?\s*([\s\S]*?)```/, requiresJsonCheck: true }
		];
	}

	/**
	 * Try to extract JSON using a specific pattern
	 */
	private tryExtractWithPattern(content: string, pattern: RegExp, requiresJsonCheck: boolean): null | string {
		const match = content.match(pattern);
		if (!match?.[1]) {
			return null;
		}

		const extracted = match[1].trim();

		if (requiresJsonCheck && !this.looksLikeJson(extracted)) {
			return null;
		}

		return extracted;
	}

	/**
	 * Try to extract from unclosed code block
	 */
	private tryExtractUnclosedBlock(content: string): null | string {
		// Only match if there's no properly closed block
		if (content.match(/```[\s\S]*```[\s\S]*$/)) {
			return null;
		}

		const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)$/);
		if (!match?.[1]) {
			return null;
		}

		const extracted = match[1].trim();
		return this.looksLikeJson(extracted) ? extracted : null;
	}

	/**
	 * Check if content looks like JSON (starts with { or [)
	 */
	private looksLikeJson(content: string): boolean {
		return content.startsWith('{') || content.startsWith('[');
	}

	/**
	 * Fix common JSON formatting issues that LLMs often produce
	 */
	fixCommonJsonIssues(jsonContent: string): string {
		let fixed = jsonContent;

		// Fix 1: Remove trailing commas in arrays
		fixed = fixed.replace(/,(\s*])/g, '$1');

		// Fix 2: Remove trailing commas in objects
		fixed = fixed.replace(/,(\s*})/g, '$1');

		// Fix 3: Remove duplicate commas
		fixed = fixed.replace(/,\s*,/g, ',');

		// Fix 4: Fix missing commas between array/object elements
		fixed = fixed.replace(/](\s*\n\s*)\[/g, '],$1[');
		fixed = fixed.replace(/}(\s*\n\s*){/g, '},$1{');

		// Fix 5: Remove trailing commas before closing with whitespace
		fixed = fixed.replace(/,(\s*\n\s*])/g, '$1');
		fixed = fixed.replace(/,(\s*\n\s*})/g, '$1');

		return fixed;
	}

	/**
	 * Extract missing outputs from nested JSON blocks in the content
	 */
	private extractFromNestedJsonBlocks(
		content: string,
		missingOutputs: string[],
		result: Record<string, unknown>
	): void {
		const jsonBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
		let match;

		while ((match = jsonBlockPattern.exec(content)) !== null) {
			this.processJsonBlock(match[1], missingOutputs, result);
		}

		// Also check the result field if it contains embedded JSON
		if (typeof result['result'] === 'string') {
			this.extractFromNestedJsonBlocks(result['result'], missingOutputs, result);
		}
	}

	/**
	 * Process a single JSON block for missing outputs
	 */
	private processJsonBlock(
		blockContentRaw: string | undefined,
		missingOutputs: string[],
		result: Record<string, unknown>
	): void {
		if (!blockContentRaw) {
			return;
		}

		const blockContent = blockContentRaw.trim();
		if (!blockContent.startsWith('{')) {
			return;
		}

		try {
			const fixedContent = this.fixCommonJsonIssues(blockContent);
			const parsed = JSON.parse(fixedContent) as Record<string, unknown>;

			this.extractMissingFromObject(parsed, missingOutputs, result, 'nested JSON block');
			this.extractFromNestedObjects(parsed, missingOutputs, result);
		} catch {
			// Invalid JSON, skip this block
		}
	}

	/**
	 * Extract missing outputs from a parsed object
	 */
	private extractMissingFromObject(
		source: Record<string, unknown>,
		missingOutputs: string[],
		result: Record<string, unknown>,
		location: string
	): void {
		for (const outputName of missingOutputs) {
			if (result[outputName] !== undefined) {
				continue;
			}
			if (Object.prototype.hasOwnProperty.call(source, outputName)) {
				result[outputName] = source[outputName];
				this.logger.debug(`Extracted ${outputName} from ${location}`);
			}
		}
	}

	/**
	 * Extract missing outputs from nested objects within a parsed object
	 */
	private extractFromNestedObjects(
		parsed: Record<string, unknown>,
		missingOutputs: string[],
		result: Record<string, unknown>
	): void {
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				continue;
			}
			const nestedObj = value as Record<string, unknown>;
			this.extractMissingFromObject(nestedObj, missingOutputs, result, `nested object ${key}`);
		}
	}

	/**
	 * Get a sensible default value for a missing output based on its name
	 */
	private getDefaultValueForOutput(outputName: string): unknown {
		const rules = [
			{ test: (name: string) => name.includes('score'), value: 0.5 },
			{ test: (name: string) => name.includes('confidence'), value: 'medium' },
			{ test: (name: string) => this.isBooleanField(name), value: false },
			{ test: (name: string) => this.isArrayField(name), value: [] },
			{ test: (name: string) => name.includes('status'), value: 'unknown' },
			{ test: (name: string) => this.isCountField(name), value: 0 },
			{ test: (name: string) => this.isObjectField(name), value: {} }
		];

		for (const rule of rules) {
			if (rule.test(outputName)) {
				return rule.value;
			}
		}

		return undefined;
	}

	/**
	 * Check if output name represents an object field
	 */
	private isObjectField(name: string): boolean {
		const objectPatterns = [
			'_changes',
			'_notes',
			'_config',
			'_context',
			'_metadata',
			'_options',
			'_settings',
			'_strategy',
			'_results',
			'_coverage',
			'implementation',
			'code_changes',
			'files_modified',
			'breaking_changes',
			'migration_steps'
		];
		return objectPatterns.some((pattern) => name.includes(pattern) || name === pattern);
	}

	/**
	 * Check if output name represents a boolean field
	 */
	private isBooleanField(name: string): boolean {
		return name.startsWith('is_') || name.startsWith('has_') || name.includes('_ready');
	}

	/**
	 * Check if output name represents an array field
	 */
	private isArrayField(name: string): boolean {
		const arrayPatterns = [
			'_list',
			'items',
			'ambiguities',
			'questions',
			'concerns',
			'gaps',
			'issues',
			'blockers',
			'risks',
			'steps',
			'sections',
			'recommendations',
			'identified',
			'_missing',
			'_unaddressed',
			'_vague',
			'_files',
			'files_'
		];
		return arrayPatterns.some((pattern) => name.includes(pattern));
	}

	/**
	 * Check if output name represents a count field
	 */
	private isCountField(name: string): boolean {
		return name.includes('count') || name.endsWith('_num');
	}

	/**
	 * Fallback extraction when JSON parsing fails
	 */
	private fallbackExtraction(content: string, expectedOutputs: string[]): Record<string, unknown> {
		const cleanedContent = this.cleanContentForExtraction(content);
		const jsonContent = this.findJsonObject(cleanedContent);

		if (!jsonContent) {
			this.logger.warn('No JSON object found in content');
			return {};
		}

		const result = this.extractOutputsFromJson(expectedOutputs, jsonContent, cleanedContent);

		if (Object.keys(result).length > 0) {
			this.fillMissingOutputsWithPatternMatching(expectedOutputs, result, cleanedContent);
			return result;
		}

		this.logger.warn('All extraction methods failed, returning empty outputs');
		return {};
	}

	/**
	 * Clean content for extraction by removing control characters
	 */
	private cleanContentForExtraction(content: string): string {
		// eslint-disable-next-line no-control-regex
		let cleaned = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

		const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch?.[1]) {
			cleaned = codeBlockMatch[1].trim();
		}

		return cleaned;
	}

	/**
	 * Find JSON object in content
	 */
	private findJsonObject(content: string): null | string {
		const jsonMatch = content.match(/\{[\s\S]*\}/);

		if (jsonMatch) {
			this.logger.debug(`Found JSON object of length: ${jsonMatch[0].length}`);
			return jsonMatch[0];
		}

		const openBraceIndex = content.indexOf('{');
		if (openBraceIndex !== -1) {
			const partialJson = content.slice(openBraceIndex);
			this.logger.warn(`No closing brace found, attempting extraction from partial JSON (${partialJson.length} chars)`);
			return partialJson;
		}

		return null;
	}

	/**
	 * Extract outputs from JSON content
	 */
	private extractOutputsFromJson(
		expectedOutputs: string[],
		jsonContent: string,
		cleanedContent: string
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const searchTargets = [jsonContent, cleanedContent];

		for (const outputName of expectedOutputs) {
			const extractedValue = this.extractSingleOutput(outputName, searchTargets);
			if (extractedValue !== undefined) {
				result[outputName] = extractedValue;
			}
		}

		if (Object.keys(result).length > 0) {
			this.logger.info(`Successfully extracted ${Object.keys(result).length} outputs using fallback parser`);
		}

		return result;
	}

	/**
	 * Extract a single output value from search targets
	 */
	private extractSingleOutput(outputName: string, searchTargets: string[]): unknown {
		for (const searchTarget of searchTargets) {
			const value = this.tryExtractValue(outputName, searchTarget);
			if (value !== undefined) {
				return value;
			}
		}

		this.logger.warn(`Could not extract value for "${outputName}" from any source`);
		return undefined;
	}

	/**
	 * Try to extract a value for a given key from content
	 */
	private tryExtractValue(outputName: string, searchTarget: string): unknown {
		const keyPattern = `"${outputName}"\\s*:\\s*`;
		const keyIndex = searchTarget.search(new RegExp(keyPattern));

		if (keyIndex === -1) {
			return undefined;
		}

		const colonMatch = searchTarget.slice(keyIndex).match(/:\s*/);
		if (!colonMatch?.index) {
			return undefined;
		}

		const valueStart = keyIndex + colonMatch.index + colonMatch[0].length;
		const afterColon = searchTarget.slice(valueStart);

		return this.extractValueByType(outputName, afterColon);
	}

	/**
	 * Extract value based on its type
	 */
	private extractValueByType(outputName: string, afterColon: string): unknown {
		if (afterColon.startsWith('"')) {
			return this.extractStringValue(outputName, afterColon);
		}
		if (afterColon.startsWith('{')) {
			return this.extractJsonValue(afterColon, /^\{[\s\S]*?\}(?=\s*[,}])/);
		}
		if (afterColon.startsWith('[')) {
			return this.extractJsonValue(afterColon, /^\[[\s\S]*?\](?=\s*[,}])/);
		}
		return this.extractJsonValue(afterColon, /^(true|false|null|\d+\.?\d*)(?=\s*[,}])/);
	}

	/**
	 * Extract a string value from JSON content
	 */
	private extractStringValue(outputName: string, afterColon: string): string {
		let stringValue = '';
		let i = 1; // Skip opening quote
		const MAX_STRING_LENGTH = 500000;

		while (i < afterColon.length && i < MAX_STRING_LENGTH) {
			const char = afterColon[i];
			const prevChar = afterColon[i - 1] ?? '';

			if (char === '"' && prevChar !== '\\') {
				this.logger.debug(`Found closing quote at position ${i}, extracted ${stringValue.length} characters`);
				break;
			}

			stringValue += char;
			i++;
		}

		if (i >= MAX_STRING_LENGTH) {
			this.logger.warn(`Quote search exceeded limit for ${outputName}, string may be incomplete`);
		}

		const unescapedValue = this.unescapeJsonString(stringValue);

		this.logger.info(`Extracted string value for ${outputName} (length: ${unescapedValue.length})`);
		return unescapedValue;
	}

	/**
	 * Unescape JSON string escape sequences
	 */
	private unescapeJsonString(str: string): string {
		try {
			return JSON.parse(`"${str}"`) as string;
		} catch {
			return str
				.replace(/\\n/g, '\n')
				.replace(/\\r/g, '\r')
				.replace(/\\t/g, '\t')
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, '\\');
		}
	}

	/**
	 * Extract a JSON value (object, array, or primitive) using a regex pattern
	 */
	private extractJsonValue(content: string, pattern: RegExp): unknown {
		const match = content.match(pattern);
		if (match) {
			try {
				return JSON.parse(match[0]);
			} catch {
				return undefined;
			}
		}
		return undefined;
	}

	/**
	 * Fill missing outputs using pattern matching as a last resort
	 */
	private fillMissingOutputsWithPatternMatching(
		expectedOutputs: string[],
		result: Record<string, unknown>,
		content: string
	): void {
		for (const outputName of expectedOutputs) {
			if (result[outputName] === undefined) {
				const value = this.tryPatternMatching(outputName, content);
				if (value !== undefined) {
					result[outputName] = value;
				}
			}
		}
	}

	/**
	 * Try to extract a value using simple pattern matching
	 */
	private tryPatternMatching(outputName: string, content: string): unknown {
		const patterns = [
			new RegExp(`"${outputName}"\\s*:\\s*(\\d+\\.?\\d*|true|false|null)`, 'i'),
			new RegExp(`"${outputName}"\\s*:\\s*"([^"]{1,200})"`, 'i')
		];

		for (const pattern of patterns) {
			const match = content.match(pattern);
			if (match?.[1]) {
				try {
					const value = JSON.parse(match[1]) as unknown;
					this.logger.info(`Extracted ${outputName} using pattern matching: ${match[1]}`);
					return value;
				} catch {
					this.logger.info(`Extracted ${outputName} using pattern matching (raw): ${match[1]}`);
					return match[1];
				}
			}
		}

		return undefined;
	}
}

/**
 * Singleton instance
 */
let outputParsingServiceInstance: null | OutputParsingService = null;

/**
 * Get the singleton OutputParsingService instance
 */
export function getOutputParsingService(): OutputParsingService {
	outputParsingServiceInstance ??= new OutputParsingService();
	return outputParsingServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetOutputParsingService(): void {
	outputParsingServiceInstance = null;
}
