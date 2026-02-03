/**
 * Document Output Processor
 *
 * Orchestrates the document output pipeline:
 * detection -> formatting -> approval -> writing
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';
import type { DocumentDetectorService, DocumentTemplateService, DocumentWriterService } from 'services/index';
import type { DocumentCategory, DocumentDefinition, DocumentOutputOptions, DocumentType } from 'types/document.types';

import { getLogger } from 'output/logger';
import { formatErrorMessage } from 'utils/error-utils';
import { isNonEmptyString } from 'utils/type-guards';

import type { DocumentApprovalWorkflow } from './document-approval';

import { PresenterRegistry } from './presenters';

/**
 * Result of document output processing
 */
export interface DocumentOutputResult {
	/** Whether a document was successfully created */
	documentCreated: boolean;
	/** Path to the created document (if any) */
	documentPath?: string;
	/** Reason why document was not created (if applicable) */
	reason?: string;
	/** Whether the document was skipped intentionally */
	skipped: boolean;
}

/**
 * Dependencies required by DocumentOutputProcessor
 */
export interface DocumentOutputProcessorDependencies {
	approval: DocumentApprovalWorkflow;
	consoleOutput: ConsoleOutput;
	detector: DocumentDetectorService;
	renderer: MarkdownRenderer;
	template: DocumentTemplateService;
	writer: DocumentWriterService;
}

export class DocumentOutputProcessor {
	private readonly approval: DocumentApprovalWorkflow;
	private readonly detector: DocumentDetectorService;
	private readonly logger = getLogger();
	private readonly presenterRegistry: PresenterRegistry;
	private readonly template: DocumentTemplateService;
	private readonly writer: DocumentWriterService;

	constructor(deps: DocumentOutputProcessorDependencies) {
		this.detector = deps.detector;
		this.template = deps.template;
		this.writer = deps.writer;
		this.approval = deps.approval;
		this.presenterRegistry = new PresenterRegistry(deps.consoleOutput, deps.renderer);
	}

	/**
	 * Process command outputs for document generation
	 */
	async process(
		commandName: string,
		outputs: Record<string, unknown>,
		options?: DocumentOutputOptions
	): Promise<DocumentOutputResult> {
		// Skip if document output is disabled
		if (options?.enabled === false) {
			this.logger.debug('Document output disabled, skipping');
			return { documentCreated: false, reason: 'Document output disabled', skipped: true };
		}

		// Skip if command is in the skip list (query/fetch commands that don't create documents)
		if (this.detector.shouldSkipDocumentOutput(commandName)) {
			return this.handleSkippedCommand(commandName, outputs);
		}

		try {
			return await this.processDocument(commandName, outputs, options);
		} catch (error) {
			return this.handleProcessingError(error);
		}
	}

	/**
	 * Handle skipped command (not a document-creating command)
	 */
	private handleSkippedCommand(commandName: string, outputs: Record<string, unknown>): DocumentOutputResult {
		this.logger.debug('Command is not a document-creating command, skipping', { commandName });
		this.presenterRegistry.displaySummary(commandName, outputs);
		return { documentCreated: false, reason: 'Command does not create documents', skipped: true };
	}

	/**
	 * Handle processing error
	 */
	private handleProcessingError(error: unknown): DocumentOutputResult {
		const errorMessage = formatErrorMessage(error);
		this.logger.error('Document output processing failed', new Error(errorMessage));
		this.approval.displayError(errorMessage);
		return { documentCreated: false, reason: errorMessage, skipped: false };
	}

	/**
	 * Core document processing logic
	 */
	private async processDocument(
		commandName: string,
		outputs: Record<string, unknown>,
		options?: DocumentOutputOptions
	): Promise<DocumentOutputResult> {
		// Step 1: Detect document-worthy content
		let detection = this.detector.detect(outputs, commandName);

		if (!detection.isDocument) {
			return this.handleNoDocumentDetected(detection, commandName);
		}

		// Show detection info
		this.approval.displayDetectionInfo(detection);

		// Step 2: Check confidence level before proceeding
		if (this.approval.isConfidenceTooLow(detection.confidence)) {
			return this.handleConfidenceTooLow(detection, commandName);
		}

		// Step 3: Handle low-confidence scenarios with clarifying questions
		const clarificationResult = await this.handleLowConfidence(detection, options);
		if (clarificationResult.declined) {
			return { documentCreated: false, reason: 'User declined to save low-confidence document', skipped: true };
		}
		detection = clarificationResult.detection;
		const overrideType = clarificationResult.overrideType;
		const overrideCategory = clarificationResult.overrideCategory;

		// Step 4: Build document definition (with any overrides from clarification)
		const document = this.buildDocument(outputs, detection, {
			...options,
			category: overrideCategory,
			documentType: overrideType,
			enabled: options?.enabled ?? true
		});

		// Step 4.5: For PLAN documents, build dynamic path with task-id
		options = this.applyPlanDocumentPath(document, outputs, options);

		// Step 5: Resolve target path
		const targetPath =
			options?.customPath ?? this.writer.getPathResolver().resolvePath(document.type, document.category);

		// Step 6: Handle approval
		const approvalResult = await this.handleApproval(document, targetPath, options);
		if (approvalResult.rejected) {
			return { documentCreated: false, reason: 'User rejected document creation', skipped: true };
		}
		options = approvalResult.options;

		// Step 7: Write document
		return this.writeAndReport(document, options);
	}

	/**
	 * Handle case when no document is detected
	 */
	private handleNoDocumentDetected(
		detection: ReturnType<DocumentDetectorService['detect']>,
		commandName: string
	): DocumentOutputResult {
		this.logger.debug('No document detected in output', { commandName, reasons: detection.reasons });
		if (detection.reasons.length > 0) {
			this.approval.displaySkippedSummary(detection, commandName);
		}
		return {
			documentCreated: false,
			reason: detection.reasons.join('; ') || 'No document-worthy content detected',
			skipped: false
		};
	}

	/**
	 * Handle case when confidence is too low to even ask
	 */
	private handleConfidenceTooLow(
		detection: ReturnType<DocumentDetectorService['detect']>,
		commandName: string
	): DocumentOutputResult {
		this.approval.displayRejectionMessage(detection);
		this.approval.displaySkippedSummary(detection, commandName);
		return { documentCreated: false, reason: 'Confidence too low to create document', skipped: false };
	}

	/**
	 * Handle low confidence scenarios with clarifying questions
	 */
	private async handleLowConfidence(
		detection: ReturnType<DocumentDetectorService['detect']>,
		options?: DocumentOutputOptions
	): Promise<{
		declined: boolean;
		detection: ReturnType<DocumentDetectorService['detect']>;
		overrideCategory?: DocumentCategory;
		overrideType?: DocumentType;
	}> {
		let overrideType = options?.documentType;
		let overrideCategory = options?.category;

		if (this.approval.isConfidenceSufficient(detection.confidence)) {
			return { declined: false, detection, overrideCategory, overrideType };
		}

		// Confidence is below threshold - warn and ask clarifying questions
		this.approval.displayLowConfidenceWarning(detection);
		const clarification = await this.approval.askClarifyingQuestions(detection);

		if (!clarification.proceed) {
			this.logger.debug('User declined to save low-confidence document');
			return { declined: true, detection };
		}

		// Update detection with user-provided information
		const updatedDetection = {
			...detection,
			confidence: clarification.updatedConfidence,
			suggestedCategory: clarification.suggestedCategory ?? detection.suggestedCategory,
			suggestedType: clarification.suggestedType ?? detection.suggestedType
		};

		// Apply user selections as overrides
		overrideType = clarification.suggestedType ?? overrideType;
		overrideCategory = clarification.suggestedCategory ?? overrideCategory;

		this.logger.debug('Confidence updated after clarification', {
			newConfidence: clarification.updatedConfidence,
			suggestedCategory: clarification.suggestedCategory,
			suggestedType: clarification.suggestedType
		});

		return { declined: false, detection: updatedDetection, overrideCategory, overrideType };
	}

	/**
	 * Apply dynamic path for PLAN documents
	 */
	private applyPlanDocumentPath(
		document: DocumentDefinition,
		outputs: Record<string, unknown>,
		options?: DocumentOutputOptions
	): DocumentOutputOptions | undefined {
		if (document.type !== 'PLAN' || options?.customPath) {
			return options;
		}

		const taskId = options?.taskId ?? this.extractTaskId(outputs);
		if (!taskId) {
			return options;
		}

		const planPath = `${this.writer.getPathResolver().getKnowledgeBasePath()}/PLAN-${taskId}.md`;
		this.logger.debug('Built dynamic PLAN path', { planPath, taskId });
		return { ...options, customPath: planPath, enabled: true };
	}

	/**
	 * Handle approval flow
	 */
	private async handleApproval(
		document: DocumentDefinition,
		targetPath: string,
		options?: DocumentOutputOptions
	): Promise<{ options?: DocumentOutputOptions; rejected: boolean }> {
		if (options?.autoApprove) {
			this.approval.displayAutoApproveInfo(document, targetPath);
			return { options, rejected: false };
		}

		const approvalResult = await this.approval.requestApproval(document, targetPath);
		if (!approvalResult.approved) {
			return { rejected: true };
		}

		// Apply any overrides from approval
		if (approvalResult.categoryOverride) {
			document.category = approvalResult.categoryOverride;
		}

		if (approvalResult.customPath) {
			return { options: { ...options, customPath: approvalResult.customPath, enabled: true }, rejected: false };
		}

		return { options, rejected: false };
	}

	/**
	 * Write document and report result
	 */
	private writeAndReport(document: DocumentDefinition, options?: DocumentOutputOptions): DocumentOutputResult {
		const writeResult = options?.customPath
			? this.writer.writeToPath(document.content, options.customPath)
			: this.writer.write(document);

		if (writeResult.success) {
			this.approval.displaySuccess(writeResult.path, writeResult.isUpdate);
			return { documentCreated: true, documentPath: writeResult.path, skipped: false };
		}

		this.approval.displayError(writeResult.error ?? 'Unknown error');
		return { documentCreated: false, reason: writeResult.error ?? 'Failed to write document', skipped: false };
	}

	/**
	 * Build document definition from outputs and detection
	 */
	private buildDocument(
		outputs: Record<string, unknown>,
		detection: { suggestedCategory?: DocumentCategory; suggestedType?: DocumentType },
		options?: DocumentOutputOptions
	): DocumentDefinition {
		const type = options?.documentType ?? detection.suggestedType ?? 'THOUGHTS';
		const category = options?.category ?? detection.suggestedCategory ?? 'root';

		// Extract content from outputs
		const content = this.extractContent(outputs);

		// Check if content already has a complete document header (from `backlog_document` etc.)
		// Pattern: starts with # Title, has metadata lines with **Key**: Value, ends with ---
		const hasCompleteHeader = /^#\s+[^\n]+\n+(?:\*\*[^*]+\*\*:[^\n]*\n+)+---/.test(content.trim());

		let formattedContent: string;
		let metadata: ReturnType<typeof this.template.createDefaultMetadata>;

		if (hasCompleteHeader) {
			// Content already has a complete header - normalize line endings and use it
			this.logger.debug('Content already has complete header, normalizing line endings');
			formattedContent = this.template.normalizeHeaderLineEndings(content);
			// Extract purpose from existing content for metadata
			const purpose = this.template.extractPurpose(content, type);
			metadata = this.template.createDefaultMetadata(type, purpose);
		} else {
			// Extract or generate purpose
			const purpose = this.template.extractPurpose(content, type);

			// Create metadata
			metadata = this.template.createDefaultMetadata(type, purpose);

			// Format content with header
			formattedContent = this.template.formatWithHeader(content, metadata);
		}

		// Normalize all metadata line endings in the content body for proper Markdown rendering
		formattedContent = this.template.normalizeContentLineEndings(formattedContent);

		return {
			category,
			content: formattedContent,
			filename: `${type}.md`,
			metadata,
			type
		};
	}

	/**
	 * Extract content string from outputs object
	 */
	private extractContent(outputs: Record<string, unknown>): string {
		// Priority keys - these contain the main document content
		const priorityKeys = [
			'backlog_document',
			'backlog',
			'refined_specifications',
			'specifications',
			'prd',
			'prd_document',
			'architecture',
			'design_document',
			'api_documentation',
			'test_plan'
		];

		// Check priority keys first at top level
		for (const key of priorityKeys) {
			const value = outputs[key];
			if (isNonEmptyString(value)) {
				return value;
			}
		}

		// Try to extract priority keys from the 'result' field (raw LLM JSON response)
		const resultContent = this.extractFromResultJson(outputs, priorityKeys);
		if (resultContent) {
			return resultContent;
		}

		// Look for common content keys
		const contentKeys = ['content', 'document', 'output', 'text', 'markdown'];

		for (const key of contentKeys) {
			const value = outputs[key];
			if (isNonEmptyString(value)) {
				return value;
			}
		}

		// If outputs has sections, concatenate them
		if (outputs['sections'] && Array.isArray(outputs['sections'])) {
			return outputs['sections']
				.map((section: unknown) => {
					if (typeof section === 'string') return section;
					if (section && typeof section === 'object') {
						const s = section as Record<string, unknown>;
						const title = s['title'] ?? s['heading'] ?? '';
						const content = s['content'] ?? s['body'] ?? s['text'] ?? '';
						return `## ${title}\n\n${content}`;
					}
					return '';
				})
				.filter(Boolean)
				.join('\n\n');
		}

		// Fallback: stringify the entire outputs object in a readable format
		return this.formatOutputsAsMarkdown(outputs);
	}

	/**
	 * Try to extract document content from the `result` field which contains raw LLM JSON response
	 */
	private extractFromResultJson(outputs: Record<string, unknown>, priorityKeys: string[]): null | string {
		const result = outputs['result'];
		if (typeof result !== 'string' || result.length === 0) {
			return null;
		}

		try {
			// Remove markdown code block wrapper if present
			let jsonStr = result.trim();
			const codeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
			if (codeBlockMatch?.[1]) {
				jsonStr = codeBlockMatch[1].trim();
			}

			// Try to parse as JSON
			const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

			// Look for priority keys in the parsed JSON
			for (const key of priorityKeys) {
				const value = parsed[key];
				if (isNonEmptyString(value)) {
					this.logger.debug(`Extracted ${key} from result JSON`, { length: value.length });
					return value;
				}
			}
		} catch {
			// JSON parsing failed, try regex extraction for each priority key
			for (const key of priorityKeys) {
				const extracted = this.extractStringFromJson(result, key);
				if (extracted) {
					return extracted;
				}
			}
		}

		return null;
	}

	/**
	 * Extract a string value from raw JSON using manual parsing
	 * Handles large strings with escaped characters including backticks
	 */
	private extractStringFromJson(json: string, key: string): null | string {
		// Find the key in the JSON
		const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
		const match = keyPattern.exec(json);
		if (!match) {
			return null;
		}

		// Start after the opening quote
		const startIndex = match.index + match[0].length;
		let value = '';
		let i = startIndex;

		// Parse the string value character by character to handle escapes properly
		while (i < json.length) {
			const char = json[i];

			if (char === '\\' && i + 1 < json.length) {
				// Escape sequence - include both characters for later unescaping
				value += char + json[i + 1];
				i += 2;
			} else if (char === '"') {
				// End of string
				break;
			} else {
				value += char;
				i++;
			}
		}

		if (value.length === 0) {
			return null;
		}

		// Unescape the JSON string (handles \n, \t, \", \\, backticks preserved as-is)
		try {
			const unescaped = JSON.parse(`"${value}"`) as string;
			this.logger.debug(`Extracted ${key} via manual parsing`, { length: unescaped.length });
			return unescaped;
		} catch {
			// Manual unescape as fallback
			return value
				.replace(/\\n/g, '\n')
				.replace(/\\r/g, '\r')
				.replace(/\\t/g, '\t')
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, '\\');
		}
	}

	/**
	 * Format outputs object as readable markdown
	 */
	private formatOutputsAsMarkdown(outputs: Record<string, unknown>): string {
		const lines: string[] = [];

		const processValue = (key: string, value: unknown, depth = 0): void => {
			const indent = '  '.repeat(depth);

			if (typeof value === 'string') {
				if (value.includes('\n')) {
					lines.push(`${indent}## ${this.formatKey(key)}\n`);
					lines.push(value);
					lines.push('');
				} else {
					lines.push(`${indent}**${this.formatKey(key)}**: ${value}`);
				}
			} else if (Array.isArray(value)) {
				lines.push(`${indent}## ${this.formatKey(key)}\n`);
				value.forEach((item, index) => {
					if (typeof item === 'string') {
						lines.push(`${indent}- ${item}`);
					} else if (typeof item === 'object' && item) {
						lines.push(`${indent}### Item ${index + 1}`);
						Object.entries(item as Record<string, unknown>).forEach(([k, v]) => {
							processValue(k, v, depth + 1);
						});
					}
				});
				lines.push('');
			} else if (value && typeof value === 'object') {
				lines.push(`${indent}## ${this.formatKey(key)}\n`);
				Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
					processValue(k, v, depth + 1);
				});
			}
		};

		Object.entries(outputs).forEach(([key, value]) => {
			// Skip metadata/internal keys
			if (!key.startsWith('_') && key !== 'usage') {
				processValue(key, value);
			}
		});

		return lines.join('\n').trim();
	}

	/**
	 * Extract task ID from outputs for PLAN document naming
	 * Looks for task_id in various output fields from the plan command pipeline
	 */
	private extractTaskId(outputs: Record<string, unknown>): null | string {
		// Direct task_id field
		if (typeof outputs['task_id'] === 'string' && outputs['task_id'].length > 0) {
			return outputs['task_id'];
		}

		// Check task_details for ID (often contains task ID in the content)
		const taskDetails = outputs['task_details'];
		if (typeof taskDetails === 'string') {
			// Try to extract task ID pattern like "BE001", "FE002", etc.
			const match = taskDetails.match(/\b([A-Z]{2,4}\d{2,4})\b/);
			if (match?.[1]) {
				return match[1];
			}
		}

		// Check for nested task object
		const task = outputs['task'];
		if (task && typeof task === 'object') {
			const taskObj = task as Record<string, unknown>;
			if (typeof taskObj['id'] === 'string') {
				return taskObj['id'];
			}
			if (typeof taskObj['task_id'] === 'string') {
				return taskObj['task_id'];
			}
		}

		// Fallback: generate timestamp-based ID if no task ID found
		this.logger.warn('Could not extract task_id from outputs, using timestamp');
		return null;
	}

	/**
	 * Format key name as readable title
	 */
	private formatKey(key: string): string {
		return key
			.replace(/_/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/**
	 * Build document output options from CLI options
	 */
	static buildOptionsFromCli(cliOptions: {
		documentAutoApprove?: boolean;
		documentCategory?: 'backend' | 'frontend' | 'infrastructure' | 'root';
		documentPath?: string;
		noDocumentOutput?: boolean;
		taskId?: string;
	}): DocumentOutputOptions {
		return {
			autoApprove: cliOptions.documentAutoApprove ?? false,
			category: cliOptions.documentCategory,
			customPath: cliOptions.documentPath,
			enabled: !cliOptions.noDocumentOutput,
			taskId: cliOptions.taskId
		};
	}
}
