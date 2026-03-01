/**
 * Document Detector Service
 *
 * Analyses command outputs to detect document-worthy content
 * and suggest appropriate document types and categories.
 */

import { getLogger } from 'output/logger';
import {
	DOCUMENT_TYPE_DEFAULT_CATEGORY,
	type DocumentCategory,
	type DocumentDetectionResult,
	type DocumentType
} from 'types/document.types';

/**
 * Pattern configuration for document type detection
 */
interface DocumentPattern {
	keywords: string[];
	sectionHeaders: string[];
	weight: number;
}

/**
 * Commands that should skip document output processing entirely
 * These are typically:
 * - Query/read/fetch commands that display information rather than generate documents
 * - Execution commands that produce code changes rather than documents
 */
const SKIP_DOCUMENT_OUTPUT_COMMANDS: Set<string> = new Set([
	'assert',
	'feedback',
	'fetch-task',
	'help',
	'implement', // Produces code changes, not documents
	'review-code',
	'review-plan',
	'status'
]);

/**
 * Command-to-document type mapping
 */
const COMMAND_DOCUMENT_MAPPING: Record<string, DocumentType> = {
	'create-backlog': 'BACKLOG',
	'create-prd': 'PRD',
	'define-architecture': 'ARCHITECTURE',
	'define-prd': 'PRD',
	'define-testing': 'TESTING',
	'design-api': 'API',
	'design-data': 'DATA',
	'design-ui': 'DESIGN',
	'gather-knowledge': 'THOUGHTS',
	plan: 'PLAN',
	'plan-deployment': 'DEPLOYMENT',
	'refine-specs': 'FUNCTIONAL',
	'refine-task': 'BACKLOG',
	'review-a11y': 'A11Y',
	'review-functional': 'FUNCTIONAL'
};

/**
 * Patterns for detecting document types from content
 */
const DOCUMENT_TYPE_PATTERNS: Record<DocumentType, DocumentPattern> = {
	A11Y: {
		keywords: ['accessibility', 'wcag', 'aria', 'screen reader', 'keyboard navigation', 'color contrast'],
		sectionHeaders: ['accessibility requirements', 'wcag compliance', 'aria labels'],
		weight: 1.0
	},
	API: {
		keywords: ['endpoint', 'rest', 'graphql', 'request', 'response', 'http', 'status code', 'payload'],
		sectionHeaders: ['api endpoints', 'request format', 'response format', 'authentication'],
		weight: 1.0
	},
	ARCHITECTURE: {
		keywords: ['architecture', 'component', 'module', 'layer', 'pattern', 'structure', 'dependency'],
		sectionHeaders: ['system architecture', 'component diagram', 'module structure', 'design patterns'],
		weight: 0.9
	},
	BACKLOG: {
		keywords: ['backlog', 'task', 'sprint', 'epic', 'user story', 'acceptance criteria', 'effort', 'priority'],
		sectionHeaders: ['project backlog', 'task list', 'execution roadmap', 'task distribution', 'dependency graph'],
		weight: 1.0
	},
	'CODING-ASSERTIONS': {
		keywords: ['assertion', 'coding standard', 'convention', 'linting', 'best practice', 'code style'],
		sectionHeaders: ['coding standards', 'assertions', 'conventions', 'best practices'],
		weight: 1.0
	},
	CONTAINER: {
		keywords: ['container', 'docker', 'kubernetes', 'k8s', 'pod', 'helm', 'orchestration'],
		sectionHeaders: ['container configuration', 'kubernetes deployment', 'docker setup'],
		weight: 1.0
	},
	DATA: {
		keywords: ['database', 'schema', 'model', 'entity', 'relation', 'migration', 'orm'],
		sectionHeaders: ['data model', 'database schema', 'entity relationships', 'migrations'],
		weight: 1.0
	},
	DEPLOYMENT: {
		keywords: ['deployment', 'ci/cd', 'pipeline', 'release', 'environment', 'staging', 'production'],
		sectionHeaders: ['deployment strategy', 'ci/cd pipeline', 'release process', 'environments'],
		weight: 1.0
	},
	DESIGN: {
		keywords: ['ui', 'ux', 'design', 'mockup', 'wireframe', 'component', 'layout', 'style'],
		sectionHeaders: ['design specifications', 'ui components', 'ux requirements', 'style guide'],
		weight: 0.9
	},
	FUNCTIONAL: {
		keywords: ['functional', 'requirement', 'specification', 'feature', 'behavior', 'use case'],
		sectionHeaders: ['functional requirements', 'specifications', 'use cases', 'acceptance criteria'],
		weight: 1.0
	},
	HLD: {
		keywords: ['high-level', 'hld', 'overview', 'system design', 'infrastructure'],
		sectionHeaders: ['high-level design', 'system overview', 'infrastructure design'],
		weight: 1.0
	},
	LOGGING: {
		keywords: ['logging', 'log', 'monitoring', 'observability', 'trace', 'metrics', 'alert'],
		sectionHeaders: ['logging strategy', 'monitoring setup', 'alerting rules', 'observability'],
		weight: 1.0
	},
	LZ: {
		keywords: ['landing zone', 'account', 'organization', 'governance', 'baseline'],
		sectionHeaders: ['landing zone', 'account structure', 'governance policies'],
		weight: 1.0
	},
	PLAN: {
		keywords: ['implementation plan', 'complexity', 'risk assessment', 'dependencies', 'rollback', 'testing strategy'],
		sectionHeaders: ['implementation steps', 'complexity assessment', 'risk assessment', 'rollback strategy'],
		weight: 1.0
	},
	PRD: {
		keywords: ['product', 'requirement', 'vision', 'goal', 'stakeholder', 'scope', 'objective'],
		sectionHeaders: ['product requirements', 'objectives', 'scope', 'stakeholders', 'success metrics'],
		weight: 1.0
	},
	TESTING: {
		keywords: ['test', 'testing', 'unit', 'integration', 'e2e', 'coverage', 'assertion'],
		sectionHeaders: ['testing strategy', 'test cases', 'coverage requirements', 'test environment'],
		weight: 0.9
	},
	THOUGHTS: {
		keywords: ['thought', 'note', 'idea', 'research', 'exploration', 'analysis'],
		sectionHeaders: ['notes', 'ideas', 'research findings', 'analysis'],
		weight: 0.5
	},
	WORKFLOW: {
		keywords: ['workflow', 'process', 'automation', 'pipeline', 'action', 'trigger'],
		sectionHeaders: ['workflow definition', 'automation process', 'pipeline steps'],
		weight: 1.0
	}
};

export class DocumentDetectorService {
	private readonly logger = getLogger();

	/**
	 * Check if a command should skip document output entirely
	 */
	shouldSkipDocumentOutput(commandName: string): boolean {
		return SKIP_DOCUMENT_OUTPUT_COMMANDS.has(commandName);
	}

	/**
	 * Error indicators that signal the output should not be saved
	 *
	 * NOTE: "missing_information" was removed from this list because it's a valid
	 * JSON field name used by prompts like understand-intent to indicate gaps.
	 * The check for missing_information as an error is now more specific - see
	 * checkForErrors() which checks if it's an error flag rather than a field name.
	 *
	 * NOTE: '"error":' was removed because it's a valid JSON field name used in
	 * API schema documentation (e.g., "error": null in response schemas). The
	 * checkForErrors() method already properly checks for outputs['error'] as a
	 * top-level error field.
	 *
	 * NOTE: '[Pending' was removed because it's a valid status marker in Open
	 * Questions sections (e.g., "[Pending - recommend 2xx range]"). Placeholder
	 * detection via PLACEHOLDER_PATTERNS handles actual incomplete content, and
	 * the context-aware filtering in checkContentQuality() excludes matches
	 * inside tracked sections like "Open Questions".
	 */
	private static readonly ERROR_INDICATORS = [
		'INSUFFICIENT_SPECIFICATIONS',
		'Cannot generate PRD',
		'specifications are empty',
		'specifications are incomplete',
		'I need to see the actual',
		'Please provide the',
		'Please paste the',
		'no PRD content provided',
		// 'missing_information' - Removed: valid JSON field in prompt outputs
		// '"error":' - Removed: valid JSON field in API schemas (e.g., "error": null)
		// '[Pending' - Removed: valid status marker in Open Questions sections
		'[TBD]',
		'[To be defined]',
		'PRD is empty or missing',
		'Please provide a complete PRD',
		'with all required sections',
		'document is empty',
		'content is missing',
		'unable to generate',
		'cannot be generated',
		'insufficient information',
		'more information needed',
		'please provide more details'
	];

	/**
	 * Placeholder patterns that indicate incomplete content
	 */
	private static readonly PLACEHOLDER_PATTERNS = [
		/\[pending[^\]]*\]/gi,
		/\[tbd\]/gi,
		/\[to be defined\]/gi,
		/\[not yet defined\]/gi,
		/pending stakeholder/gi,
		/pending user research/gi,
		/pending analysis/gi
	];

	/**
	 * Section headers where placeholder-like markers (e.g., "[Pending - ...]")
	 * are valid status annotations rather than incomplete content.
	 */
	private static readonly STATUS_MARKER_SECTIONS = [
		'open questions',
		'open items',
		'known issues',
		'remaining questions',
		'version history',
		'user clarifications',
		'changelog'
	];

	/**
	 * Detect if command output is document-worthy and suggest type/category
	 */
	detect(outputs: Record<string, unknown>, commandName: string): DocumentDetectionResult {
		this.logger.debug('Detecting document from output', {
			commandName,
			outputKeys: Object.keys(outputs)
		});

		// Step 1: Check for explicit error responses in output
		const errorCheck = this.checkForErrors(outputs);
		if (errorCheck.hasError) {
			return { confidence: 0, isDocument: false, reasons: errorCheck.reasons };
		}

		// Step 2: Extract content for analysis
		const content = this.extractContent(outputs);
		if (!content || content.length < 100) {
			return { confidence: 0, isDocument: false, reasons: ['Output content is too short or empty'] };
		}

		// Step 3: Check content for error indicators and placeholders
		const contentCheck = this.checkContentQuality(content);
		if (contentCheck.hasErrors) {
			return { confidence: contentCheck.confidence, isDocument: false, reasons: contentCheck.reasons };
		}

		// Step 4: Check command-based mapping (only if content is valid)
		const mappedType = COMMAND_DOCUMENT_MAPPING[commandName];
		if (mappedType) {
			return this.buildMappedTypeResult(mappedType, commandName, contentCheck.placeholderCount);
		}

		// Step 5: Analyse content for document patterns
		return this.buildPatternAnalysisResult(content);
	}

	/**
	 * Build result for command-mapped document types
	 */
	private buildMappedTypeResult(
		mappedType: DocumentType,
		commandName: string,
		placeholderCount: number
	): DocumentDetectionResult {
		const adjustedConfidence = placeholderCount > 0 ? Math.max(0.3, 0.95 - placeholderCount * 0.1) : 0.95;

		if (adjustedConfidence < 0.5) {
			return {
				confidence: adjustedConfidence,
				isDocument: false,
				reasons: [`Content has ${placeholderCount} placeholder(s) - insufficient quality for saving`]
			};
		}

		const reasons =
			placeholderCount > 0
				? [`Command '${commandName}' mapped to '${mappedType}', but ${placeholderCount} placeholder(s) found`]
				: [`Command '${commandName}' is mapped to document type '${mappedType}'`];

		return {
			confidence: adjustedConfidence,
			isDocument: true,
			reasons,
			suggestedCategory: DOCUMENT_TYPE_DEFAULT_CATEGORY[mappedType],
			suggestedType: mappedType
		};
	}

	/**
	 * Build result based on content pattern analysis
	 */
	private buildPatternAnalysisResult(content: string): DocumentDetectionResult {
		const analysis = this.analyzeContent(content);

		if (analysis.bestMatch && analysis.confidence >= 0.5) {
			return {
				confidence: analysis.confidence,
				isDocument: true,
				reasons: analysis.reasons,
				suggestedCategory: DOCUMENT_TYPE_DEFAULT_CATEGORY[analysis.bestMatch],
				suggestedType: analysis.bestMatch
			};
		}

		return {
			confidence: analysis.confidence,
			isDocument: false,
			reasons: ['No clear document pattern detected in output']
		};
	}

	/**
	 * Check outputs object for explicit error responses
	 */
	private checkForErrors(outputs: Record<string, unknown>): { hasError: boolean; reasons: string[] } {
		const reasons: string[] = [];

		// Check for error field
		if (outputs['error']) {
			reasons.push(`Output contains error: ${outputs['error']}`);
			return { hasError: true, reasons };
		}

		// Check for null document fields
		if (outputs['prd_document'] === null || outputs['prd_document'] === undefined) {
			if (outputs['error'] || outputs['message']) {
				reasons.push('Output indicates document generation failed');
				return { hasError: true, reasons };
			}
		}

		// Note: missing_information is a VALID output field used by prompts like
		// understand-intent to indicate what clarifications are needed. It should
		// NOT be treated as an error - it's informational for the user/next stage.
		// Only treat it as an error if it's the ONLY meaningful output (empty result).

		return { hasError: false, reasons: [] };
	}

	/**
	 * Check content quality for error indicators and placeholders
	 */
	private checkContentQuality(content: string): {
		confidence: number;
		hasErrors: boolean;
		placeholderCount: number;
		reasons: string[];
	} {
		const reasons: string[] = [];
		let hasErrors = false;

		// Check for error indicator strings
		for (const indicator of DocumentDetectorService.ERROR_INDICATORS) {
			if (content.includes(indicator)) {
				reasons.push(`Content contains error indicator: "${indicator}"`);
				hasErrors = true;
			}
		}

		// Count placeholder patterns, excluding matches inside status-tracking sections
		const statusMarkerLines = this.getStatusMarkerLines(content);
		let placeholderCount = 0;
		for (const pattern of DocumentDetectorService.PLACEHOLDER_PATTERNS) {
			// Reset regex lastIndex for global patterns
			pattern.lastIndex = 0;
			let match: null | RegExpExecArray;
			while ((match = pattern.exec(content)) !== null) {
				if (!statusMarkerLines.has(this.getLineNumber(content, match.index))) {
					placeholderCount++;
				}
			}
		}

		if (placeholderCount > 5) {
			reasons.push(`Content has ${placeholderCount} placeholder patterns - likely incomplete`);
			hasErrors = true;
		}

		// Calculate confidence based on issues found
		let confidence = 1.0;
		if (hasErrors) {
			confidence = 0.1;
		} else if (placeholderCount > 0) {
			confidence = Math.max(0.3, 1.0 - placeholderCount * 0.1);
		}

		return { confidence, hasErrors, placeholderCount, reasons };
	}

	/**
	 * Identify line numbers that fall within status-tracking sections
	 * where placeholder-like markers are valid annotations.
	 *
	 * A status-tracking section starts at a markdown heading (##, ###, etc.)
	 * whose text matches STATUS_MARKER_SECTIONS and ends at the next heading
	 * of equal or higher level (or end of content).
	 */
	private getStatusMarkerLines(content: string): Set<number> {
		const lines = content.split('\n');
		const statusLines = new Set<number>();
		let inStatusSection = false;
		let sectionLevel = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
			if (headingMatch?.[1] && headingMatch[2] !== undefined) {
				const level = headingMatch[1].length;
				const headerText = headingMatch[2].toLowerCase().trim();
				const isStatusHeader = DocumentDetectorService.STATUS_MARKER_SECTIONS.some((section) =>
					headerText.includes(section)
				);

				if (isStatusHeader) {
					inStatusSection = true;
					sectionLevel = level;
					statusLines.add(i);
					continue;
				}

				// A heading at equal or higher level ends the status section
				if (inStatusSection && level <= sectionLevel) {
					inStatusSection = false;
				}
			}

			if (inStatusSection) {
				statusLines.add(i);
			}
		}

		return statusLines;
	}

	/**
	 * Get the 0-based line number for a character offset in a string
	 */
	private getLineNumber(content: string, offset: number): number {
		let line = 0;
		for (let i = 0; i < offset && i < content.length; i++) {
			if (content[i] === '\n') {
				line++;
			}
		}
		return line;
	}

	/**
	 * Extract text content from outputs object
	 */
	private extractContent(outputs: Record<string, unknown>): string {
		const contentParts: string[] = [];

		const extractStrings = (obj: unknown, depth = 0): void => {
			if (depth > 5) return; // Prevent deep recursion

			if (typeof obj === 'string') {
				contentParts.push(obj);
			} else if (Array.isArray(obj)) {
				obj.forEach((item) => extractStrings(item, depth + 1));
			} else if (obj && typeof obj === 'object') {
				Object.values(obj).forEach((value) => extractStrings(value, depth + 1));
			}
		};

		extractStrings(outputs);
		return contentParts.join('\n');
	}

	/**
	 * Analyse content for document type patterns
	 */
	private analyzeContent(content: string): {
		bestMatch: DocumentType | null;
		confidence: number;
		reasons: string[];
	} {
		const lowerContent = content.toLowerCase();
		const scores = new Map<DocumentType, { reasons: string[]; score: number }>();

		// Score each document type
		Object.entries(DOCUMENT_TYPE_PATTERNS).forEach(([type, pattern]) => {
			const docType = type as DocumentType;
			let score = 0;
			const reasons: string[] = [];

			// Check keywords
			const keywordMatches = pattern.keywords.filter((kw) => lowerContent.includes(kw));
			if (keywordMatches.length > 0) {
				const keywordScore = Math.min(keywordMatches.length / pattern.keywords.length, 1) * 0.4;
				score += keywordScore * pattern.weight;
				reasons.push(`Found ${keywordMatches.length} matching keywords for ${docType}`);
			}

			// Check section headers
			const headerMatches = pattern.sectionHeaders.filter((header) => lowerContent.includes(header));
			if (headerMatches.length > 0) {
				const headerScore = Math.min(headerMatches.length / pattern.sectionHeaders.length, 1) * 0.6;
				score += headerScore * pattern.weight;
				reasons.push(`Found ${headerMatches.length} matching section headers for ${docType}`);
			}

			if (score > 0) {
				scores.set(docType, { reasons, score });
			}
		});

		// Find best match
		let bestMatch: DocumentType | null = null;
		let bestScore = 0;
		let bestReasons: string[] = [];

		scores.forEach((data, type) => {
			if (data.score > bestScore) {
				bestScore = data.score;
				bestMatch = type;
				bestReasons = data.reasons;
			}
		});

		return {
			bestMatch,
			confidence: bestScore,
			reasons: bestReasons
		};
	}

	/**
	 * Suggest category based on content analysis
	 */
	suggestCategory(content: string, _commandName: string): DocumentCategory {
		const lowerContent = content.toLowerCase();

		// Category-specific keywords
		const categoryPatterns: Record<DocumentCategory, string[]> = {
			backend: ['api', 'database', 'server', 'backend', 'rest', 'graphql', 'orm', 'migration'],
			frontend: ['ui', 'ux', 'component', 'react', 'css', 'html', 'accessibility', 'design'],
			infrastructure: ['deploy', 'kubernetes', 'docker', 'ci/cd', 'terraform', 'aws', 'monitoring'],
			root: ['product', 'requirement', 'functional', 'prd', 'specification']
		};

		const scores: Record<DocumentCategory, number> = {
			backend: 0,
			frontend: 0,
			infrastructure: 0,
			root: 0
		};

		// Score each category
		Object.entries(categoryPatterns).forEach(([category, keywords]) => {
			const matches = keywords.filter((kw) => lowerContent.includes(kw));
			scores[category as DocumentCategory] = matches.length;
		});

		// Find best category
		const bestCategory = Object.entries(scores).reduce(
			(best, [category, score]) => (score > best.score ? { category: category as DocumentCategory, score } : best),
			{ category: 'root' as DocumentCategory, score: 0 }
		);

		return bestCategory.category;
	}
}
