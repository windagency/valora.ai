/**
 * Document Approval Workflow
 *
 * Handles interactive approval for document creation,
 * displaying previews and allowing user modifications.
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getRenderer } from 'output/markdown';
import {
	type ClarificationResult,
	DOCUMENT_CONFIDENCE_THRESHOLDS,
	DOCUMENT_TYPE_CATEGORIES,
	type DocumentApprovalResult,
	type DocumentCategory,
	type DocumentDefinition,
	type DocumentDetectionResult,
	type DocumentType
} from 'types/document.types';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

/**
 * Maximum preview lines to display
 */
const MAX_PREVIEW_LINES = 30;

export class DocumentApprovalWorkflow {
	private readonly color = getColorAdapter();
	private readonly console = getConsoleOutput();
	private readonly logger = getLogger();
	private readonly promptAdapter = getPromptAdapter();
	private readonly renderer = getRenderer();

	/**
	 * Request user approval for document creation
	 */
	async requestApproval(document: DocumentDefinition, targetPath: string): Promise<DocumentApprovalResult> {
		this.logger.debug('Requesting document approval', {
			category: document.category,
			path: targetPath,
			type: document.type
		});

		// Display document preview
		this.displayPreview(document, targetPath);

		// Prompt for approval
		const approval = await this.promptForApproval(targetPath);

		if (approval === 'approve') {
			return { approved: true };
		}

		if (approval === 'edit') {
			return this.handleEditFlow(document);
		}

		// Rejected
		this.console.blank();
		this.console.warn('Document creation cancelled.');
		this.console.blank();
		return { approved: false };
	}

	/**
	 * Display formatted document preview
	 */
	private displayPreview(document: DocumentDefinition, targetPath: string): void {
		const lines = document.content.split('\n');
		const previewLines = lines.slice(0, MAX_PREVIEW_LINES);
		const previewContent = previewLines.join('\n');
		const truncationNotice =
			lines.length > MAX_PREVIEW_LINES ? this.color.gray(`... ${lines.length - MAX_PREVIEW_LINES} more lines ...`) : '';

		this.console.blank();
		this.console.print(this.renderer.box(`${document.type} - ${document.category}`, 'Document Preview'));
		this.console.blank();
		this.console.bold('Metadata:');
		this.console.print(`  Type:     ${document.type}`);
		this.console.print(`  Category: ${document.category}`);
		this.console.print(`  Title:    ${document.metadata.title}`);
		this.console.print(`  Status:   ${document.metadata.status}`);
		this.console.print(`  Path:     ${targetPath}`);
		this.console.blank();
		this.console.bold('Content Preview:');
		this.console.divider();
		this.console.print(this.renderer.render(previewContent));
		if (truncationNotice) {
			this.console.print(truncationNotice);
		}
		this.console.divider();
		this.console.blank();
	}

	/**
	 * Prompt user for approval decision
	 */
	private async promptForApproval(targetPath: string): Promise<'approve' | 'edit' | 'reject'> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{ name: 'Yes, save the document', value: 'approve' },
					{ name: 'Edit category/path', value: 'edit' },
					{ name: 'No, cancel', value: 'reject' }
				],
				default: 'approve',
				message: `Save this document to ${targetPath}?`,
				name: 'decision',
				type: 'list'
			}
		]);

		return answers['decision'] as 'approve' | 'edit' | 'reject';
	}

	/**
	 * Handle edit flow for category/path modification
	 */
	private async handleEditFlow(document: DocumentDefinition): Promise<DocumentApprovalResult> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{ name: 'Root (knowledge-base/)', value: 'root' },
					{ name: 'Backend (knowledge-base/backend/)', value: 'backend' },
					{ name: 'Frontend (knowledge-base/frontend/)', value: 'frontend' },
					{ name: 'Infrastructure (knowledge-base/infrastructure/)', value: 'infrastructure' }
				],
				default: document.category,
				message: 'Select document category:',
				name: 'category',
				type: 'list'
			},
			{
				default: '',
				message: 'Custom path (leave empty to use default):',
				name: 'customPath',
				type: 'input'
			}
		]);

		const categoryOverride = answers['category'] as DocumentCategory;
		const customPath = answers['customPath'] as string;

		return {
			approved: true,
			categoryOverride: categoryOverride !== document.category ? categoryOverride : undefined,
			customPath: customPath ?? undefined
		};
	}

	/**
	 * Display detection result for user context
	 */
	displayDetectionInfo(detection: DocumentDetectionResult): void {
		if (!detection.isDocument) {
			return;
		}

		this.console.blank();
		this.console.print(this.renderer.box('Output Analysis', 'Document Detected'));
		this.console.blank();
		this.console.print(`  Type:       ${detection.suggestedType}`);
		this.console.print(`  Category:   ${detection.suggestedCategory}`);
		this.console.print(`  Confidence: ${Math.round(detection.confidence * 100)}%`);
		if (detection.reasons.length > 0) {
			this.console.print(`  Reasons:`);
			detection.reasons.forEach((reason) => this.console.print(`    - ${reason}`));
		}
		this.console.blank();
	}

	/**
	 * Display success message after document save
	 */
	displaySuccess(path: string, isUpdate: boolean): void {
		const action = isUpdate ? 'updated' : 'created';
		this.console.blank();
		this.console.success(`Document ${action} successfully!`);
		this.console.print(`  Path: ${path}`);
		this.console.blank();
	}

	/**
	 * Display error message
	 */
	displayError(error: string): void {
		this.console.blank();
		this.console.error(`Failed to save document: ${error}`);
		this.console.blank();
	}

	/**
	 * Quick approval for auto-approve mode (just shows summary)
	 */
	displayAutoApproveInfo(document: DocumentDefinition, targetPath: string): void {
		this.console.blank();
		this.console.dim('Auto-saving document...');
		this.console.print(`  Type:     ${document.type}`);
		this.console.print(`  Category: ${document.category}`);
		this.console.print(`  Path:     ${targetPath}`);
		this.console.blank();
	}

	/**
	 * Check if confidence is sufficient to offer save
	 */
	isConfidenceSufficient(confidence: number): boolean {
		return confidence >= DOCUMENT_CONFIDENCE_THRESHOLDS.MIN_SAVE_THRESHOLD;
	}

	/**
	 * Check if confidence is too low to proceed at all
	 */
	isConfidenceTooLow(confidence: number): boolean {
		return confidence < DOCUMENT_CONFIDENCE_THRESHOLDS.REJECTION_THRESHOLD;
	}

	/**
	 * Display low-confidence warning
	 */
	displayLowConfidenceWarning(detection: DocumentDetectionResult): void {
		const confidencePercent = Math.round(detection.confidence * 100);
		const thresholdPercent = Math.round(DOCUMENT_CONFIDENCE_THRESHOLDS.MIN_SAVE_THRESHOLD * 100);

		this.console.blank();
		this.console.print(this.renderer.box('Low Confidence Detected', 'Warning'));
		this.console.blank();
		this.console.warn(
			`Document detection confidence is ${confidencePercent}% (minimum required: ${thresholdPercent}%)`
		);
		this.console.blank();
		this.console.bold('The system is not confident enough to save this document.');
		this.console.print('Additional information is needed to proceed.');
		this.console.blank();
		this.console.dim('Detection reasons:');
		detection.reasons.forEach((r) => this.console.print(`  • ${r}`));
		this.console.blank();
	}

	/**
	 * Display rejection message for very low confidence
	 */
	displayRejectionMessage(detection: DocumentDetectionResult): void {
		const confidencePercent = Math.round(detection.confidence * 100);

		this.console.blank();
		this.console.error('Cannot save document');
		this.console.blank();
		this.console.print(`Confidence level (${confidencePercent}%) is too low to identify this as a valid document.`);
		this.console.dim('This output does not appear to be a structured document.');
		this.console.blank();
		if (detection.reasons.length > 0) {
			this.console.print('Reasons:');
			detection.reasons.forEach((r) => this.console.print(`  • ${r}`));
		}
		this.console.blank();
	}

	/**
	 * Display comprehensive summary when document is not created
	 */
	displaySkippedSummary(detection: DocumentDetectionResult, commandName: string): void {
		const confidencePercent = Math.round(detection.confidence * 100);
		const thresholdPercent = Math.round(DOCUMENT_CONFIDENCE_THRESHOLDS.MIN_SAVE_THRESHOLD * 100);

		this.console.blank();
		this.console.divider();
		this.console.print(this.renderer.box('Document Not Created', 'Summary'));
		this.console.blank();
		this.console.labelValue('Command', commandName);
		this.console.print(
			`${this.color.bold('Confidence:')} ${confidencePercent}% ${this.color.gray(`(minimum required: ${thresholdPercent}%)`)}`
		);
		this.console.print(`${this.color.bold('Result:')} ${this.color.yellow('Skipped - document was not saved')}`);
		this.console.blank();
		this.console.bold('Why was the document not created?');
		detection.reasons.forEach((r) => this.console.print(`  ${this.color.yellow('•')} ${r}`));
		this.console.blank();
		this.console.bold('What this means:');
		this.console.dim('  • The output contained errors, placeholders, or incomplete content');
		this.console.dim('  • Saving this output would create an invalid document');
		this.console.dim('  • No file was written to the knowledge-base');
		this.console.blank();
		this.console.bold('How to fix:');
		this.console.print(
			`  ${this.color.cyan('1.')} Ensure input specifications are complete before running the command`
		);
		this.console.print(
			`  ${this.color.cyan('2.')} Provide required information: problem statement, users, requirements`
		);
		this.console.print(`  ${this.color.cyan('3.')} Re-run the command once specifications are ready`);
		this.console.blank();
		this.console.divider();
		this.console.blank();
	}

	/**
	 * Ask clarifying questions to improve confidence
	 */
	async askClarifyingQuestions(detection: DocumentDetectionResult): Promise<ClarificationResult> {
		this.console.blank();
		this.console.info('Please answer the following questions to help classify this document:');
		this.console.blank();

		// Build document type options
		const typeOptions = Object.keys(DOCUMENT_TYPE_CATEGORIES).map((type) => ({
			name: type,
			value: type
		}));

		// Build category options
		const categoryOptions = [
			{ name: 'Root (knowledge-base/)', value: 'root' },
			{ name: 'Backend (knowledge-base/backend/)', value: 'backend' },
			{ name: 'Frontend (knowledge-base/frontend/)', value: 'frontend' },
			{ name: 'Infrastructure (knowledge-base/infrastructure/)', value: 'infrastructure' }
		];

		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{ name: 'Yes, I want to save this as a document', value: 'yes' },
					{ name: 'No, skip saving this output', value: 'no' }
				],
				default: 'no',
				message: 'Do you want to save this output as a document?',
				name: 'proceed',
				type: 'list'
			}
		]);

		if (answers['proceed'] === 'no') {
			return {
				answers: {},
				proceed: false,
				updatedConfidence: detection.confidence
			};
		}

		// Ask for document type
		const typeAnswer = await this.promptAdapter.prompt([
			{
				choices: typeOptions,
				default: detection.suggestedType ?? 'THOUGHTS',
				message: 'What type of document is this?',
				name: 'documentType',
				type: 'list'
			}
		]);

		const selectedType = typeAnswer['documentType'] as DocumentType;

		// Filter category options based on valid categories for the selected type
		const validCategories = DOCUMENT_TYPE_CATEGORIES[selectedType] ?? ['root'];
		const filteredCategoryOptions = categoryOptions.filter((opt) =>
			validCategories.includes(opt.value as DocumentCategory)
		);

		// Ask for category
		const categoryAnswer = await this.promptAdapter.prompt([
			{
				choices: filteredCategoryOptions.length > 0 ? filteredCategoryOptions : categoryOptions,
				default: detection.suggestedCategory ?? 'root',
				message: 'Where should this document be saved?',
				name: 'category',
				type: 'list'
			}
		]);

		const selectedCategory = categoryAnswer['category'] as DocumentCategory;

		// User has provided explicit input, boost confidence
		const updatedConfidence = Math.min(detection.confidence + 0.4, 0.95);

		return {
			answers: {
				category: selectedCategory,
				documentType: selectedType
			},
			proceed: true,
			suggestedCategory: selectedCategory,
			suggestedType: selectedType,
			updatedConfidence
		};
	}
}
