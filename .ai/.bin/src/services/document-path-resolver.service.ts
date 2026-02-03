/**
 * Document Path Resolver Service
 *
 * Determines correct file paths for documents based on
 * type and category, following knowledge-base conventions.
 */

import { existsSync, readFileSync } from 'fs';
import { getLogger } from 'output/logger';
import { dirname, join, resolve } from 'path';
import {
	DOCUMENT_TYPE_CATEGORIES,
	DOCUMENT_TYPE_DEFAULT_CATEGORY,
	type DocumentCategory,
	type DocumentType
} from 'types/document.types';

/**
 * Default knowledge-base path relative to project root
 */
const DEFAULT_KNOWLEDGE_BASE_PATH = './knowledge-base';

export class DocumentPathResolverService {
	private readonly knowledgeBasePath: string;
	private readonly logger = getLogger();

	constructor(customPath?: string) {
		this.knowledgeBasePath = customPath ?? this.resolveKnowledgeBasePath();
		this.logger.debug('Document path resolver initialized', {
			knowledgeBasePath: this.knowledgeBasePath
		});
	}

	/**
	 * Resolve the knowledge-base path from config or default
	 */
	private resolveKnowledgeBasePath(): string {
		// Try to find config.json for custom path
		const configPath = join(process.cwd(), 'config.json');
		if (existsSync(configPath)) {
			try {
				const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
					document_output?: { knowledge_base_path?: string };
				};
				if (config.document_output?.knowledge_base_path) {
					return resolve(process.cwd(), config.document_output.knowledge_base_path);
				}
			} catch {
				// Ignore config parse errors
			}
		}

		// Default: ../knowledge-base relative to .ai/.bin
		return resolve(process.cwd(), DEFAULT_KNOWLEDGE_BASE_PATH);
	}

	/**
	 * Get the full path for a document
	 */
	resolvePath(type: DocumentType, category: DocumentCategory): string {
		const categoryPath = this.getCategoryPath(category);
		const filename = this.generateFilename(type);
		return join(categoryPath, filename);
	}

	/**
	 * Get the directory path for a category
	 */
	getCategoryPath(category: DocumentCategory): string {
		if (category === 'root') {
			return this.knowledgeBasePath;
		}
		return join(this.knowledgeBasePath, category);
	}

	/**
	 * Generate UPPERCASE filename for document type
	 */
	generateFilename(type: DocumentType): string {
		return `${type}.md`;
	}

	/**
	 * Check if a document already exists
	 */
	exists(type: DocumentType, category: DocumentCategory): boolean {
		const path = this.resolvePath(type, category);
		return existsSync(path);
	}

	/**
	 * Get existing document content if it exists
	 */
	getExisting(type: DocumentType, category: DocumentCategory): null | string {
		const path = this.resolvePath(type, category);
		if (!existsSync(path)) {
			return null;
		}

		try {
			return readFileSync(path, 'utf-8');
		} catch (error) {
			this.logger.warn('Failed to read existing document', { error, path });
			return null;
		}
	}

	/**
	 * Get the knowledge-base root path
	 */
	getKnowledgeBasePath(): string {
		return this.knowledgeBasePath;
	}

	/**
	 * Validate that category is valid for document type
	 */
	validateCategory(type: DocumentType, category: DocumentCategory): boolean {
		const validCategories = DOCUMENT_TYPE_CATEGORIES[type];
		return validCategories.includes(category);
	}

	/**
	 * Get default category for document type
	 */
	getDefaultCategory(type: DocumentType): DocumentCategory {
		return DOCUMENT_TYPE_DEFAULT_CATEGORY[type];
	}

	/**
	 * Ensure the target directory exists
	 */
	ensureDirectoryExists(category: DocumentCategory): string {
		const categoryPath = this.getCategoryPath(category);
		// Directory creation will be handled by the writer service
		return categoryPath;
	}

	/**
	 * Get relative path from knowledge-base root
	 */
	getRelativePath(type: DocumentType, category: DocumentCategory): string {
		if (category === 'root') {
			return this.generateFilename(type);
		}
		return join(category, this.generateFilename(type));
	}

	/**
	 * Parse a full path to extract type and category
	 */
	parseDocumentPath(fullPath: string): null | { category: DocumentCategory; type: DocumentType } {
		const relativePath = fullPath.replace(this.knowledgeBasePath, '').replace(/^[/\\]/, '');
		const parts = relativePath.split(/[/\\]/);

		if (parts.length === 1 && parts[0]) {
			// Root level document
			const filename = parts[0].replace('.md', '') as DocumentType;
			return { category: 'root', type: filename };
		} else if (parts.length === 2 && parts[0] && parts[1]) {
			// Subdirectory document
			const category = parts[0] as DocumentCategory;
			const filename = parts[1].replace('.md', '') as DocumentType;
			return { category, type: filename };
		}

		return null;
	}

	/**
	 * Get backup path for existing document
	 */
	getBackupPath(type: DocumentType, category: DocumentCategory): string {
		const originalPath = this.resolvePath(type, category);
		const dir = dirname(originalPath);
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return join(dir, `.${type}.${timestamp}.backup.md`);
	}
}
