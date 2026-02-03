/**
 * Document Template Service
 *
 * Handles document formatting with knowledge-base template headers
 * and status emoji mapping.
 */

import { getLogger } from 'output/logger';
import {
	DOCUMENT_STATUS_EMOJI,
	type DocumentMetadata,
	type DocumentStatus,
	type DocumentType
} from 'types/document.types';

/**
 * Document title mappings
 */
const DOCUMENT_TYPE_TITLES: Record<DocumentType, string> = {
	A11Y: 'Accessibility (WCAG 2.0)',
	API: 'API Documentation',
	ARCHITECTURE: 'System Architecture',
	BACKLOG: 'Project Backlog',
	'CODING-ASSERTIONS': 'Coding Standards & Assertions',
	CONTAINER: 'Container Orchestration',
	DATA: 'Data Architecture',
	DEPLOYMENT: 'Deployment Strategy',
	DESIGN: 'UI/UX Design',
	FUNCTIONAL: 'Functional Specifications',
	HLD: 'High-Level Design',
	LOGGING: 'Logging Strategy',
	LZ: 'Landing Zone',
	PLAN: 'Implementation Plan',
	PRD: 'Product Requirements Document',
	TESTING: 'Testing Strategy',
	THOUGHTS: 'Notes & Research',
	WORKFLOW: 'Workflow Documentation'
};

export class DocumentTemplateService {
	private readonly logger = getLogger();

	/**
	 * Format content with standard knowledge-base header
	 */
	formatWithHeader(content: string, metadata: DocumentMetadata): string {
		this.logger.debug('Formatting document with header', {
			status: metadata.status,
			title: metadata.title
		});

		const statusEmoji = this.getStatusEmoji(metadata.status);
		const header = this.buildHeader(metadata, statusEmoji);

		// Remove any existing header from content
		const cleanContent = this.removeExistingHeader(content);

		return `${header}\n\n${cleanContent}`;
	}

	/**
	 * Normalize header line endings to ensure double spaces for Markdown line breaks
	 * Use this when content already has a header that should be preserved
	 */
	normalizeHeaderLineEndings(content: string): string {
		// Match header pattern: # Title followed by metadata lines ending with ---
		const headerPattern = /^(#\s+[^\n]+\n+)((?:\*\*[^*]+\*\*:[^\n]*\n+)+)(---)/;
		const match = content.match(headerPattern);

		if (!match) {
			return content;
		}

		const title = match[1] ?? '';
		const metadataBlock = match[2] ?? '';
		const separator = match[3] ?? '---';
		const restOfContent = content.slice(match[0].length);

		// Normalize each metadata line to have double spaces at the end
		const normalizedMetadata = metadataBlock
			.split('\n')
			.map((line) => {
				const trimmed = line.trim();
				if (trimmed.startsWith('**') && trimmed.includes('**:')) {
					// Remove existing trailing spaces and add exactly two
					return trimmed.replace(/\s*$/, '  ');
				}
				return line;
			})
			.join('\n');

		return `${title}${normalizedMetadata}${separator}${restOfContent}`;
	}

	/**
	 * Normalize all metadata line endings throughout the entire content body
	 * This ensures **Key**: Value lines render with proper line breaks in Markdown preview
	 */
	normalizeContentLineEndings(content: string): string {
		return content
			.split('\n')
			.map((line) => {
				const trimmed = line.trim();
				// Match metadata lines: **Key**: Value (but not already ending with double spaces)
				if (trimmed.startsWith('**') && trimmed.includes('**:') && !trimmed.endsWith('  ')) {
					// Remove any trailing spaces and add exactly two for Markdown line break
					return trimmed.replace(/\s*$/, '  ');
				}
				return line;
			})
			.join('\n');
	}

	/**
	 * Build the standard header block
	 * Note: Double spaces at end of lines create Markdown line breaks
	 */
	private buildHeader(metadata: DocumentMetadata, statusEmoji: string): string {
		const lines = [
			`# ${metadata.title}`,
			'',
			`**Purpose**: ${metadata.purpose}  `,
			`**Version**: ${metadata.version}  `,
			`**Author**: ${metadata.author}  `,
			`**Created Date**: ${metadata.createdDate}  `,
			`**Last Updated Date**: ${metadata.lastUpdatedDate}  `
		];

		if (metadata.nextReviewDate) {
			lines.push(`**Next Review Date**: ${metadata.nextReviewDate}  `);
		}

		lines.push(`**Status**: ${statusEmoji} ${metadata.status}`);
		lines.push('');
		lines.push('---');

		return lines.join('\n');
	}

	/**
	 * Remove existing header from content if present
	 */
	private removeExistingHeader(content: string): string {
		// Match header pattern: starts with #, contains metadata lines, ends with ---
		const headerPattern = /^#\s+[^\n]+\n+(?:\*\*[^*]+\*\*:[^\n]*\n+)+---\n*/;
		return content.replace(headerPattern, '').trim();
	}

	/**
	 * Get status emoji for document status
	 */
	getStatusEmoji(status: DocumentStatus): string {
		return DOCUMENT_STATUS_EMOJI[status] || DOCUMENT_STATUS_EMOJI.DRAFT;
	}

	/**
	 * Get default title for document type
	 */
	getDefaultTitle(type: DocumentType): string {
		return DOCUMENT_TYPE_TITLES[type] || type;
	}

	/**
	 * Create default metadata for a new document
	 */
	createDefaultMetadata(type: DocumentType, purpose: string): DocumentMetadata {
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0] ?? now.toISOString().substring(0, 10);

		// Calculate next review date (quarterly by default)
		const reviewDate = new Date(now);
		reviewDate.setMonth(reviewDate.getMonth() + 3);
		const reviewDateStr = reviewDate.toISOString().split('T')[0] ?? reviewDate.toISOString().substring(0, 10);

		return {
			author: 'VALORA',
			createdDate: dateStr,
			lastUpdatedDate: dateStr,
			nextReviewDate: `${reviewDateStr} (quarterly)`,
			purpose,
			status: 'DRAFT',
			title: this.getDefaultTitle(type),
			version: '1.0.0'
		};
	}

	/**
	 * Update metadata for an existing document
	 */
	updateMetadata(existing: DocumentMetadata, updates?: Partial<DocumentMetadata>): DocumentMetadata {
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0] ?? now.toISOString().substring(0, 10);

		// Increment version
		const versionParts = existing.version.split('.').map(Number);
		versionParts[2] = (versionParts[2] ?? 0) + 1;
		const newVersion = versionParts.join('.');

		return {
			...existing,
			...updates,
			lastUpdatedDate: dateStr,
			version: newVersion
		};
	}

	/**
	 * Markdown formatting prefixes that indicate structural lines
	 */
	private static readonly MARKDOWN_PREFIXES = ['#', '*', '```', '---', '===', '|', '>', '-'];

	/**
	 * Check if a line is a formatting marker or structural syntax (not actual content)
	 */
	private isFormattingLine(line: string): boolean {
		const trimmed = line.trim();

		if (trimmed.length < 3) {
			return true;
		}

		if (this.isMarkdownFormatting(trimmed)) {
			return true;
		}

		if (this.isJsonStructural(trimmed)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if line is markdown formatting
	 */
	private isMarkdownFormatting(trimmed: string): boolean {
		const hasMarkdownPrefix = DocumentTemplateService.MARKDOWN_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
		const isNumberedList = /^\d+\./.test(trimmed);
		return hasMarkdownPrefix || isNumberedList;
	}

	/**
	 * Check if line is JSON structural syntax
	 */
	private isJsonStructural(trimmed: string): boolean {
		return /^[{}[\],:"]+$/.test(trimmed) || /^"[^"]+"\s*:\s*[{[\d"tfn]/.test(trimmed);
	}

	/**
	 * Try to extract meaningful text from JSON content
	 */
	private extractFromJson(content: string): null | string {
		// Look for common descriptive fields in JSON
		const descriptiveFields = [
			/"recommendation"\s*:\s*"([^"]+)"/,
			/"description"\s*:\s*"([^"]+)"/,
			/"summary"\s*:\s*"([^"]+)"/,
			/"purpose"\s*:\s*"([^"]+)"/,
			/"readiness_assessment"\s*:\s*"([^"]+)"/,
			/"overview"\s*:\s*"([^"]+)"/
		];

		for (const pattern of descriptiveFields) {
			const match = content.match(pattern);
			if (match?.[1] && match[1].length > 20) {
				return match[1];
			}
		}

		return null;
	}

	/**
	 * Extract purpose from content if not provided
	 */
	extractPurpose(content: string, type: DocumentType): string {
		// First, try to extract existing `**Purpose**:` from header
		const purposeMatch = content.match(/\*\*Purpose\*\*:\s*([^\n]+)/);
		if (purposeMatch?.[1]) {
			const existingPurpose = purposeMatch[1].trim();
			if (existingPurpose.length > 10) {
				return existingPurpose;
			}
		}

		// Check if content is primarily JSON
		const trimmedContent = content.trim();
		const isJsonContent = trimmedContent.startsWith('{') || trimmedContent.startsWith('```json');

		if (isJsonContent) {
			const jsonPurpose = this.extractFromJson(content);
			if (jsonPurpose) {
				return this.truncateAtSentence(jsonPurpose, 500);
			}
			// Fallback for JSON content
			return this.getDefaultPurpose(type);
		}

		// Use type-specific default purpose for structured documents
		// These document types have well-defined purposes
		const structuredTypes: DocumentType[] = ['BACKLOG', 'PRD', 'ARCHITECTURE', 'API', 'TESTING', 'FUNCTIONAL'];
		if (structuredTypes.includes(type)) {
			return this.getDefaultPurpose(type);
		}

		// Try to extract first paragraph or sentence as purpose
		const lines = content.split('\n').filter((line) => line.trim());
		const firstContent = lines.find((line) => !this.isFormattingLine(line));

		if (firstContent) {
			return this.truncateAtSentence(firstContent, 500);
		}

		// Fallback to type-based purpose
		return this.getDefaultPurpose(type);
	}

	/**
	 * Get default purpose for document type
	 */
	private getDefaultPurpose(type: DocumentType): string {
		const purposes: Partial<Record<DocumentType, string>> = {
			API: 'API documentation with endpoints, request/response formats, and usage examples.',
			ARCHITECTURE: 'System architecture design documenting components, integrations, and technical decisions.',
			BACKLOG:
				'Prioritized list of tasks decomposed from product requirements, organized by phase and priority for systematic implementation.',
			DATA: 'Data architecture and schema definitions.',
			DEPLOYMENT: 'Deployment strategy and infrastructure configuration.',
			DESIGN: 'UI/UX design specifications and component guidelines.',
			FUNCTIONAL: 'Functional specifications detailing system behavior and business logic.',
			HLD: 'High-level design overview of system components and their interactions.',
			PRD: 'Product requirements and specifications defining features, user stories, and acceptance criteria.',
			TESTING: 'Testing strategy and test plans ensuring quality and coverage across the application.',
			WORKFLOW: 'Workflow documentation and process definitions.'
		};

		return purposes[type] ?? `${this.getDefaultTitle(type)} documentation for the project.`;
	}

	/**
	 * Truncate text at a sentence boundary up to maxLength
	 * Ensures we don't cut off mid-sentence
	 */
	private truncateAtSentence(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}

		// Find the last sentence-ending punctuation within maxLength
		const truncated = text.substring(0, maxLength);
		const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];

		let lastEnd = -1;
		for (const ender of sentenceEnders) {
			const pos = truncated.lastIndexOf(ender);
			if (pos > lastEnd) {
				lastEnd = pos + 1; // Include the punctuation
			}
		}

		// If we found a sentence boundary, use it
		if (lastEnd > maxLength * 0.5) {
			return text.substring(0, lastEnd).trim();
		}

		// Otherwise truncate at word boundary and add ellipsis
		const wordBoundary = truncated.lastIndexOf(' ');
		if (wordBoundary > maxLength * 0.7) {
			return text.substring(0, wordBoundary).trim() + '...';
		}

		return truncated.trim() + '...';
	}
}
