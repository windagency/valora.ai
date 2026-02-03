/**
 * Document Writer Service
 *
 * Handles writing documents to the knowledge-base with
 * validation, backup, and update capabilities.
 */

import type { DocumentCategory, DocumentDefinition, DocumentType, DocumentWriteResult } from 'types/document.types';

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { getLogger } from 'output/logger';
import { dirname } from 'path';
import { formatErrorMessage } from 'utils/error-utils';

import type { DocumentPathResolverService } from './document-path-resolver.service';

export class DocumentWriterService {
	private readonly logger = getLogger();
	private readonly pathResolver: DocumentPathResolverService;

	constructor(pathResolver: DocumentPathResolverService) {
		this.pathResolver = pathResolver;
	}

	/**
	 * Write a document to the knowledge-base
	 */
	write(document: DocumentDefinition): DocumentWriteResult {
		const { category, content, type } = document;

		this.logger.info('Writing document', {
			category,
			type
		});

		try {
			// Validate category for document type
			if (!this.pathResolver.validateCategory(type, category)) {
				return {
					error: `Category '${category}' is not valid for document type '${type}'`,
					isUpdate: false,
					path: '',
					success: false
				};
			}

			// Resolve path
			const path = this.pathResolver.resolvePath(type, category);
			const isUpdate = this.pathResolver.exists(type, category);

			// Ensure directory exists
			this.ensureDirectory(dirname(path));

			// Backup existing file if updating
			if (isUpdate) {
				this.createBackup(type, category);
			}

			// Write the document
			writeFileSync(path, content, 'utf-8');

			this.logger.info('Document written successfully', {
				isUpdate,
				path
			});

			return {
				isUpdate,
				path,
				success: true
			};
		} catch (error) {
			const errorMessage = formatErrorMessage(error);
			this.logger.error('Failed to write document', new Error(errorMessage), {
				category,
				type
			});

			return {
				error: errorMessage,
				isUpdate: false,
				path: '',
				success: false
			};
		}
	}

	/**
	 * Write to a custom path
	 */
	writeToPath(content: string, customPath: string): DocumentWriteResult {
		this.logger.info('Writing document to custom path', { customPath });

		try {
			const isUpdate = existsSync(customPath);

			// Ensure directory exists
			this.ensureDirectory(dirname(customPath));

			// Write the document
			writeFileSync(customPath, content, 'utf-8');

			this.logger.info('Document written successfully', {
				isUpdate,
				path: customPath
			});

			return {
				isUpdate,
				path: customPath,
				success: true
			};
		} catch (error) {
			const errorMessage = formatErrorMessage(error);
			this.logger.error('Failed to write document', new Error(errorMessage), {
				customPath
			});

			return {
				error: errorMessage,
				isUpdate: false,
				path: '',
				success: false
			};
		}
	}

	/**
	 * Ensure directory exists, create if needed
	 */
	private ensureDirectory(dirPath: string): void {
		if (!existsSync(dirPath)) {
			mkdirSync(dirPath, { recursive: true });
		}
	}

	/**
	 * Create backup of existing document
	 */
	private createBackup(type: DocumentType, category: DocumentCategory): void {
		const originalPath = this.pathResolver.resolvePath(type, category);
		const backupPath = this.pathResolver.getBackupPath(type, category);

		try {
			copyFileSync(originalPath, backupPath);
			this.logger.debug('Created backup', { backupPath, originalPath });
		} catch (error) {
			this.logger.warn('Failed to create backup', {
				error,
				originalPath
			});
			// Continue without backup
		}
	}

	/**
	 * Get path resolver for external access
	 */
	getPathResolver(): DocumentPathResolverService {
		return this.pathResolver;
	}

	/**
	 * Check if document exists
	 */
	exists(type: DocumentType, category: DocumentCategory): boolean {
		return this.pathResolver.exists(type, category);
	}

	/**
	 * Get existing document content
	 */
	getExisting(type: DocumentType, category: DocumentCategory): null | string {
		return this.pathResolver.getExisting(type, category);
	}
}
