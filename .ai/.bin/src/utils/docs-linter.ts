/**
 * Documentation Linter
 *
 * Comprehensive documentation quality checks including:
 * - Style and formatting validation
 * - Link validation
 * - Code example validation
 * - API documentation completeness
 * - Documentation freshness checks
 */

import * as fs from 'fs/promises';
import * as path from 'path';
// import { glob } from 'glob'; // Replaced with custom implementation
import { getLogger } from 'output/logger';

/**
 * Simple glob replacement using fs.readdir
 * Supports basic patterns but not full glob syntax
 */
export interface CodeExampleValidation {
	code: string;
	errors: string[];
	language: string;
	lineEnd: number;
	lineStart: number;
	warnings: string[];
}

export interface DocumentationRule {
	message: string;
	name: string;
	pattern: RegExp;
	severity: 'error' | 'info' | 'warning';
	suggestion?: string;
}

export interface DocumentationStats {
	errors: number;
	info: number;
	totalCodeBlocks: number;
	totalFiles: number;
	totalLines: number;
	totalLinks: number;
	warnings: number;
}

export interface LintOptions {
	checkApiCompleteness?: boolean;
	checkCodeExamples?: boolean;
	checkFreshness?: boolean;
	checkLinks?: boolean;
	customRules?: DocumentationRule[];
	excludePatterns?: string[];
	includePatterns?: string[];
	maxFileSize?: number;
}

export interface LintResult {
	column?: number;
	file: string;
	line?: number;
	message: string;
	rule: string;
	severity: 'error' | 'info' | 'warning';
	suggestion?: string;
}

async function simpleGlob(
	pattern: string,
	options: { absolute?: boolean; cwd?: string; ignore?: string[] } = {}
): Promise<string[]> {
	const { absolute = true, cwd = process.cwd(), ignore = [] } = options;

	// Convert basic glob pattern to simple file extension matching
	const isMarkdown = pattern.includes('*.md') || pattern.includes('.md');
	const isTypeScript = pattern.includes('*.ts') || pattern.includes('.ts');

	const files: string[] = [];

	/**
	 * Check if a file should be included based on pattern matching
	 */
	function shouldIncludeFile(fileName: string): boolean {
		if (isMarkdown && fileName.endsWith('.md')) {
			return true;
		}
		if (isTypeScript && fileName.endsWith('.ts')) {
			return true;
		}
		return false;
	}

	/**
	 * Check if path matches any ignore pattern
	 */
	function isIgnored(filePath: string): boolean {
		return ignore.some((ignored) => filePath.includes(ignored));
	}

	/**
	 * Format file path based on options
	 */
	function formatPath(filePath: string): string {
		return absolute ? filePath : path.relative(cwd, filePath);
	}

	async function scanDir(dirPath: string): Promise<void> {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);

				if (isIgnored(fullPath)) {
					continue;
				}

				if (entry.isDirectory()) {
					await scanDir(fullPath);
				} else if (entry.isFile() && shouldIncludeFile(entry.name)) {
					files.push(formatPath(fullPath));
				}
			}
		} catch (error) {
			console.error(`Error scanning directory ${dirPath}: ${(error as Error).message}`);
		}
	}

	await scanDir(cwd);
	return files;
}

/**
 * Default documentation linting rules
 */
const DEFAULT_DOC_RULES: DocumentationRule[] = [
	// Style and formatting
	{
		message: 'Trailing whitespace found',
		name: 'trailing-whitespace',
		pattern: /[ \t]+$/gm,
		severity: 'warning',
		suggestion: 'Remove trailing whitespace'
	},
	{
		message: 'Heading should have space after #',
		name: 'inconsistent-heading-spacing',
		pattern: /^#{1,6}[^#\s]/gm,
		severity: 'error',
		suggestion: 'Add space after heading markers: # Title'
	},
	{
		message: 'Multiple consecutive blank lines',
		name: 'multiple-blank-lines',
		pattern: /\n{3,}/g,
		severity: 'warning',
		suggestion: 'Use at most two consecutive blank lines'
	},
	{
		message: 'Image missing alt text',
		name: 'missing-alt-text',
		pattern: /!\[([^\]]*)\]\([^)]*\)/g,
		severity: 'warning',
		suggestion: 'Add descriptive alt text to images'
	},
	{
		message: 'Potential broken link syntax',
		name: 'broken-link-syntax',
		pattern: /\[[^\]]*\]\([^)]*\)/g,
		severity: 'info',
		suggestion: 'Verify link syntax and destination'
	},
	// Code quality
	{
		message: 'TODO comment without details',
		name: 'todo-without-details',
		pattern: /(TODO|FIXME|XXX):\s*$/gm,
		severity: 'warning',
		suggestion: 'Add description to TODO comment'
	},
	{
		message: 'Code block language declaration',
		name: 'inconsistent-code-block-language',
		pattern: /```(\w+)/g,
		severity: 'info',
		suggestion: 'Ensure consistent language naming'
	},
	// Documentation structure
	{
		message: 'Large document may need table of contents',
		name: 'missing-table-of-contents',
		pattern: /^#\s.*$/m,
		severity: 'info',
		suggestion: 'Consider adding table of contents for documents > 500 lines'
	}
];

/**
 * Documentation Linter Class
 *
 * Provides comprehensive documentation quality validation
 */
export class DocumentationLinter {
	private customRules: DocumentationRule[] = [];
	private logger = getLogger();
	private options: Required<LintOptions>;

	constructor(options: LintOptions = {}) {
		this.options = {
			checkApiCompleteness: false,
			checkCodeExamples: true,
			checkFreshness: false,
			checkLinks: true,
			// 10MB
			customRules: [],
			excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
			includePatterns: ['**/*.md', '**/*.txt', '**/*.rst', 'docs/**/*'],
			maxFileSize: 10 * 1024 * 1024,
			...options
		};

		this.customRules = [...DEFAULT_DOC_RULES, ...this.options.customRules];
	}

	/**
	 * Lint all documentation files
	 */
	async lintAll(): Promise<{
		codeValidation: CodeExampleValidation[];
		results: LintResult[];
		stats: DocumentationStats;
	}> {
		const files = await this.findDocumentationFiles();
		const results: LintResult[] = [];
		const codeValidation: CodeExampleValidation[] = [];
		let totalLines = 0;
		let totalLinks = 0;
		let totalCodeBlocks = 0;

		this.logger.info(`Linting ${files.length} documentation files`);

		await Promise.all(
			files.map(async (file, index) => {
				try {
					const fileResults = await this.lintFile(file);
					results.push(...fileResults.results);
					codeValidation.push(...fileResults.codeValidation);

					totalLines += fileResults.lines;
					totalLinks += fileResults.links;
					totalCodeBlocks += fileResults.codeBlocks;

					// Log progress for large file sets
					if (files.length > 10 && index % 10 === 0) {
						this.logger.info(`Processed ${index + 1}/${files.length} files`);
					}
				} catch (error) {
					results.push({
						file,
						message: `Failed to read file: ${(error as Error).message}`,
						rule: 'file-read-error',
						severity: 'error'
					});
				}
			})
		);

		const stats: DocumentationStats = {
			errors: results.filter((r) => r.severity === 'error').length,
			info: results.filter((r) => r.severity === 'info').length,
			totalCodeBlocks,
			totalFiles: files.length,
			totalLines,
			totalLinks,
			warnings: results.filter((r) => r.severity === 'warning').length
		};

		return { codeValidation, results, stats };
	}

	/**
	 * Lint a single documentation file
	 */
	async lintFile(filePath: string): Promise<{
		codeBlocks: number;
		codeValidation: CodeExampleValidation[];
		lines: number;
		links: number;
		results: LintResult[];
	}> {
		const content = await fs.readFile(filePath, 'utf8');
		const lines = content.split('\n').length;
		const results: LintResult[] = [];
		const codeValidation: CodeExampleValidation[] = [];

		// Basic content checks
		results.push(...this.checkContentRules(content, filePath));

		// Link validation
		if (this.options.checkLinks) {
			results.push(...(await this.checkLinks(content, filePath)));
		}

		// Code example validation
		if (this.options.checkCodeExamples) {
			const validation = this.validateCodeExamples(content);
			codeValidation.push(...validation);
			results.push(
				...validation.flatMap((v) => [
					...v.errors.map((e) => ({
						file: filePath,
						line: v.lineStart,
						message: e,
						rule: 'code-example-error',
						severity: 'error' as const
					})),
					...v.warnings.map((w) => ({
						file: filePath,
						line: v.lineStart,
						message: w,
						rule: 'code-example-warning',
						severity: 'warning' as const
					}))
				])
			);
		}

		// API completeness check
		if (this.options.checkApiCompleteness && this.isApiDocumentation(filePath)) {
			results.push(...this.checkApiCompleteness(content, filePath));
		}

		// Freshness check
		if (this.options.checkFreshness) {
			results.push(...(await this.checkFreshness(content, filePath)));
		}

		return {
			codeBlocks: (content.match(/```[\s\S]*?```/g) ?? []).length,
			codeValidation,
			lines,
			links: (content.match(/\[([^\]]*)\]\(([^)]*)\)/g) ?? []).length,
			results
		};
	}

	/**
	 * Find all documentation files
	 */
	private async findDocumentationFiles(): Promise<string[]> {
		const patterns = this.options.includePatterns;
		const excludePatterns = this.options.excludePatterns;

		// Collect all matches for all patterns
		const allMatches = await Promise.all(
			patterns.map((pattern) =>
				simpleGlob(pattern, {
					absolute: true,
					cwd: process.cwd(),
					ignore: excludePatterns
				})
			)
		);

		// Remove duplicates and filter by size
		let files = [...new Set(allMatches.flat())];

		if (this.options.maxFileSize > 0) {
			// Filter files by size in parallel
			const fileStats = await Promise.all(
				files.map(async (file) => {
					try {
						const stats = await fs.stat(file);
						return { file, size: stats.size };
					} catch {
						return { file, size: -1 }; // Skip files we can't stat
					}
				})
			);

			files = fileStats
				.filter(({ size }) => {
					if (size === -1) return false;
					if (size > this.options.maxFileSize) {
						this.logger.warn(`Skipping large file: ${size} bytes`);
						return false;
					}
					return true;
				})
				.map(({ file }) => file);
		}

		return files;
	}

	/**
	 * Check content against linting rules
	 */
	private checkContentRules(content: string, filePath: string): LintResult[] {
		return this.customRules.flatMap((rule) => {
			const matches: LintResult[] = [];
			let match;
			while ((match = rule.pattern.exec(content)) !== null) {
				const lineNumber = content.substring(0, match.index).split('\n').length;
				const columnNumber = match.index - content.lastIndexOf('\n', match.index) + 1;

				matches.push({
					column: columnNumber,
					file: filePath,
					line: lineNumber,
					message: rule.message,
					rule: rule.name,
					severity: rule.severity,
					suggestion: rule.suggestion
				});

				// Prevent infinite loops for global regex
				if (!rule.pattern.global) break;
			}
			return matches;
		});
	}

	/**
	 * Check if link text is empty
	 */
	private checkEmptyLinkText(text: string, filePath: string, lineNumber: number): LintResult | null {
		if (text.trim()) {
			return null;
		}

		return {
			file: filePath,
			line: lineNumber,
			message: 'Link has empty text',
			rule: 'empty-link-text',
			severity: 'warning',
			suggestion: 'Add descriptive link text'
		};
	}

	/**
	 * Check if URL is a relative link
	 */
	private isRelativeLink(url: string): boolean {
		return url.startsWith('./') || url.startsWith('../') || (!url.startsWith('http') && !url.startsWith('#'));
	}

	/**
	 * Check for broken relative link
	 */
	private async checkBrokenRelativeLink(url: string, filePath: string, lineNumber: number): Promise<LintResult | null> {
		const urlWithoutHash = url.split('#')[0] ?? url;
		const absolutePath = path.resolve(path.dirname(filePath), urlWithoutHash);

		try {
			await fs.access(absolutePath);
			return null;
		} catch {
			return {
				file: filePath,
				line: lineNumber,
				message: `Broken relative link: ${url}`,
				rule: 'broken-relative-link',
				severity: 'error',
				suggestion: 'Fix or remove broken link'
			};
		}
	}

	/**
	 * Check links for validity
	 */
	private async checkLinks(content: string, filePath: string): Promise<LintResult[]> {
		const results: LintResult[] = [];
		const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
		let match;

		while ((match = linkPattern.exec(content)) !== null) {
			const [, text, url] = match;

			if (!text || !url) {
				continue;
			}

			const lineNumber = content.substring(0, match.index).split('\n').length;

			// Check for empty link text
			const emptyTextResult = this.checkEmptyLinkText(text, filePath, lineNumber);
			if (emptyTextResult) {
				results.push(emptyTextResult);
			}

			// Check for broken relative links
			if (this.isRelativeLink(url)) {
				const brokenLinkResult = await this.checkBrokenRelativeLink(url, filePath, lineNumber);
				if (brokenLinkResult) {
					results.push(brokenLinkResult);
				}
			}
		}

		return results;
	}

	/**
	 * Language validator mapping using object literal lookup
	 */
	private readonly languageValidators = {
		bash: (code: string) => this.validateBash(code),
		javascript: (code: string) => this.validateJavaScript(code),
		js: (code: string) => this.validateJavaScript(code),
		json: (code: string) => this.validateJSON(code),
		sh: (code: string) => this.validateBash(code),
		ts: (code: string) => this.validateTypeScript(code),
		typescript: (code: string) => this.validateTypeScript(code)
	} as const;

	/**
	 * Get validation errors for a specific language
	 */
	private getLanguageValidationErrors(language: string, code: string): string[] {
		const validator = this.languageValidators[language as keyof typeof this.languageValidators];
		return validator ? validator(code) : [];
	}

	/**
	 * Get general warnings for code blocks
	 */
	private getCodeWarnings(code: string): string[] {
		const warnings: string[] = [];

		if (code.length > 1000) {
			warnings.push('Code block is very long (>1000 chars)');
		}

		if (code.includes('TODO') || code.includes('FIXME')) {
			warnings.push('Code block contains TODO comments');
		}

		return warnings;
	}

	/**
	 * Validate code examples in documentation
	 */
	private validateCodeExamples(content: string): CodeExampleValidation[] {
		const validations: CodeExampleValidation[] = [];
		const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
		let match;

		while ((match = codeBlockPattern.exec(content)) !== null) {
			const [, language, code] = match;

			if (!code) {
				continue;
			}

			const beforeMatch = content.substring(0, match.index);
			const lineStart = beforeMatch.split('\n').length + 1;
			const lineEnd = lineStart + code.split('\n').length - 1;
			const lang = language ?? 'text';

			const validation: CodeExampleValidation = {
				code: code.trim(),
				errors: this.getLanguageValidationErrors(lang, code),
				language: lang,
				lineEnd,
				lineStart,
				warnings: this.getCodeWarnings(code)
			};

			validations.push(validation);
		}

		return validations;
	}

	/**
	 * Check API documentation completeness
	 */
	private checkApiCompleteness(content: string, filePath: string): LintResult[] {
		const results: LintResult[] = [];

		// Check for common API documentation patterns
		const hasParameters = /Parameters|Args|Arguments/i.test(content);
		const hasReturns = /Returns|Return|Output/i.test(content);
		const hasExamples = /Example|Examples/i.test(content);
		const hasThrows = /Throws|Errors|Exceptions/i.test(content);

		if (!hasParameters) {
			results.push({
				file: filePath,
				message: 'API documentation missing parameters section',
				rule: 'missing-api-parameters',
				severity: 'warning',
				suggestion: 'Add parameters documentation'
			});
		}

		if (!hasReturns) {
			results.push({
				file: filePath,
				message: 'API documentation missing returns section',
				rule: 'missing-api-returns',
				severity: 'warning',
				suggestion: 'Add returns documentation'
			});
		}

		if (!hasExamples) {
			results.push({
				file: filePath,
				message: 'API documentation missing examples',
				rule: 'missing-api-examples',
				severity: 'info',
				suggestion: 'Add usage examples'
			});
		}

		if (!hasThrows) {
			results.push({
				file: filePath,
				message: 'API documentation missing error information',
				rule: 'missing-api-errors',
				severity: 'info',
				suggestion: 'Add error handling documentation'
			});
		}

		return results;
	}

	/**
	 * Check documentation freshness
	 */
	private async checkFreshness(content: string, filePath: string): Promise<LintResult[]> {
		const results: LintResult[] = [];
		const stats = await fs.stat(filePath);
		const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

		// Check for outdated version references
		const versionPattern = /(version|v)\s*[:=]\s*["']?(\d+\.\d+\.\d+)["']?/gi;
		const versions: string[] = [];
		let match;

		while ((match = versionPattern.exec(content)) !== null) {
			const version = match[2];
			if (version) {
				versions.push(version);
			}
		}

		// Flag documents older than 90 days with version info as potentially stale
		if (daysSinceModified > 90 && versions.length > 0) {
			results.push({
				file: filePath,
				message: `Document is ${Math.round(daysSinceModified)} days old and contains version references`,
				rule: 'potentially-stale-version',
				severity: 'info',
				suggestion: 'Review for version updates'
			});
		}

		// Check for last reviewed date
		const reviewPattern = /last\s+reviewed?\s*[:=]\s*([\d/-]+)/gi;
		if (reviewPattern.test(content)) {
			// If there's a last reviewed date, we could check if it's too old
			// This is a placeholder for more sophisticated freshness checking
		}

		return results;
	}

	/**
	 * Validate TypeScript code examples
	 */
	private validateTypeScript(code: string): string[] {
		const errors: string[] = [];

		// Check for basic syntax issues
		if (code.includes('console.log(') && !code.includes('import') && code.length > 50) {
			errors.push('TypeScript example may be missing imports');
		}

		// Check for proper typing
		if (code.includes('function') && !code.includes(':') && code.length > 30) {
			errors.push('TypeScript function may be missing return type annotation');
		}

		return errors;
	}

	/**
	 * Validate JavaScript code examples
	 */
	private validateJavaScript(code: string): string[] {
		const errors: string[] = [];

		// Check for common issues
		if (code.includes('var ') && code.includes('let ') && code.includes('const ')) {
			// This is fine, mixed usage is allowed
		}

		return errors;
	}

	/**
	 * Validate JSON code examples
	 */
	private validateJSON(code: string): string[] {
		const errors: string[] = [];

		try {
			JSON.parse(code);
		} catch (error) {
			errors.push(`Invalid JSON: ${(error as Error).message}`);
		}

		return errors;
	}

	/**
	 * Validate Bash code examples
	 */
	private validateBash(code: string): string[] {
		const errors: string[] = [];

		// Check for common bash issues
		if (code.includes('$') && !code.includes('"') && code.includes(' ')) {
			errors.push('Bash command with variables may need proper quoting');
		}

		return errors;
	}

	/**
	 * Check if file is API documentation
	 */
	private isApiDocumentation(filePath: string): boolean {
		const fileName = path.basename(filePath).toLowerCase();
		return (
			fileName.includes('api') ||
			fileName.includes('reference') ||
			fileName.startsWith('docs/api') ||
			fileName.startsWith('docs/reference')
		);
	}

	/**
	 * Get linting statistics
	 */
	getStats(results: LintResult[]): {
		filesWithErrors: number;
		filesWithWarnings: number;
		totalErrors: number;
		totalFiles: number;
		totalInfo: number;
		totalWarnings: number;
	} {
		const files = [...new Set(results.map((r) => r.file))];
		const filesWithErrors = [...new Set(results.filter((r) => r.severity === 'error').map((r) => r.file))].length;
		const filesWithWarnings = [...new Set(results.filter((r) => r.severity === 'warning').map((r) => r.file))].length;

		return {
			filesWithErrors,
			filesWithWarnings,
			totalErrors: results.filter((r) => r.severity === 'error').length,
			totalFiles: files.length,
			totalInfo: results.filter((r) => r.severity === 'info').length,
			totalWarnings: results.filter((r) => r.severity === 'warning').length
		};
	}
}

// Global linter instance
let globalDocumentationLinter: DocumentationLinter | null = null;

/**
 * Get the global documentation linter instance
 */
export function getDocumentationLinter(options?: LintOptions): DocumentationLinter {
	globalDocumentationLinter ??= new DocumentationLinter(options);
	return globalDocumentationLinter;
}

/**
 * Convenience function to lint all documentation
 */
export async function lintDocumentation(options?: LintOptions): Promise<{
	codeValidation: CodeExampleValidation[];
	results: LintResult[];
	stats: DocumentationStats;
}> {
	const linter = getDocumentationLinter(options);
	return linter.lintAll();
}
