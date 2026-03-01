/**
 * Pending Write Approver Service
 *
 * Handles user confirmation flow for pending file writes.
 * Extracted from ToolExecutionService to reduce complexity.
 */

import type { ColorAdapter } from 'output/color-adapter.interface';
import type { ConsoleOutput } from 'output/console-output';
import type { Logger } from 'output/logger';
import type { PromptAdapter } from 'ui/prompt-adapter.interface';

import { writeFile } from 'utils/file-utils';

/**
 * Represents a file pending write confirmation
 */
export interface PendingWrite {
	content: string;
	fullPath: string;
	path: string;
}

/**
 * Result of flush operation
 */
export interface FlushResult {
	skipped: number;
	written: number;
}

/**
 * Confirmation mode during individual file review
 */
type ConfirmMode = 'ask' | 'skip-rest' | 'write-rest';

/**
 * Service to handle pending write confirmation flow
 */
export class PendingWriteApproverService {
	constructor(
		private readonly console: ConsoleOutput,
		private readonly color: ColorAdapter,
		private readonly promptAdapter: PromptAdapter,
		private readonly logger: Logger
	) {}

	/**
	 * Process pending writes with user confirmation
	 */
	async flush(pendingWrites: PendingWrite[]): Promise<FlushResult> {
		if (pendingWrites.length === 0) {
			return { skipped: 0, written: 0 };
		}

		this.displaySummary(pendingWrites);
		const batchDecision = await this.promptBatchDecision();
		const result = await this.processBatchDecision(batchDecision, pendingWrites);
		this.displayResult(result.written, result.skipped);

		return result;
	}

	/**
	 * Display summary of pending writes
	 */
	private displaySummary(pendingWrites: PendingWrite[]): void {
		this.console.blank();
		this.console.print(this.color.bold(`📁 ${pendingWrites.length} file(s) ready to save:`));
		this.console.blank();

		pendingWrites.forEach((pending, i) => {
			const lines = pending.content.split('\n').length;
			this.console.print(`  ${this.color.cyan(`${i + 1}.`)} ${pending.path} ${this.color.dim(`(${lines} lines)`)}`);
		});
		this.console.blank();
	}

	/**
	 * Prompt for batch decision
	 */
	private async promptBatchDecision(): Promise<string> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{ name: 'Yes, save all files', value: 'yes-all' },
					{ name: 'Review each file individually', value: 'review' },
					{ name: 'No, skip all files', value: 'no-all' }
				],
				default: 'yes-all',
				message: 'How would you like to proceed?',
				name: 'decision',
				type: 'list'
			}
		]);
		return answers['decision'] as string;
	}

	/**
	 * Process the batch decision
	 */
	private async processBatchDecision(batchDecision: string, pendingWrites: PendingWrite[]): Promise<FlushResult> {
		if (batchDecision === 'yes-all') {
			return this.writeAllFiles(pendingWrites);
		}
		if (batchDecision === 'no-all') {
			return this.skipAllFiles(pendingWrites);
		}
		return this.reviewFilesIndividually(pendingWrites);
	}

	/**
	 * Write all pending files
	 */
	private async writeAllFiles(pendingWrites: PendingWrite[]): Promise<FlushResult> {
		let written = 0;
		for (const { content, fullPath, path } of pendingWrites) {
			await writeFile(fullPath, content);
			this.logger.info(`Created/updated file: ${fullPath}`, { contentLength: content.length });
			this.console.print(`  ${this.color.green('✓')} ${path}`);
			written++;
		}
		return { skipped: 0, written };
	}

	/**
	 * Skip all pending files
	 */
	private skipAllFiles(pendingWrites: PendingWrite[]): FlushResult {
		for (const { path } of pendingWrites) {
			this.console.print(`  ${this.color.yellow('○')} Skipped: ${path}`);
		}
		return { skipped: pendingWrites.length, written: 0 };
	}

	/**
	 * Review each file individually
	 */
	private async reviewFilesIndividually(pendingWrites: PendingWrite[]): Promise<FlushResult> {
		let written = 0;
		let skipped = 0;
		let confirmMode: ConfirmMode = 'ask';

		for (const file of pendingWrites) {
			const result = await this.processIndividualFile(file, confirmMode);
			written += result.written;
			skipped += result.skipped;
			confirmMode = result.confirmMode;
		}
		return { skipped, written };
	}

	/**
	 * Process a single file in review mode
	 */
	private async processIndividualFile(
		file: PendingWrite,
		confirmMode: ConfirmMode
	): Promise<{ confirmMode: ConfirmMode; skipped: number; written: number }> {
		if (confirmMode === 'write-rest') {
			await this.writeSingleFile(file);
			return { confirmMode, skipped: 0, written: 1 };
		}

		if (confirmMode === 'skip-rest') {
			this.console.print(`  ${this.color.yellow('○')} Skipped: ${file.path}`);
			return { confirmMode, skipped: 1, written: 0 };
		}

		this.displayFilePreview(file);
		const decision = await this.promptFileDecision();

		if (decision === 'yes' || decision === 'yes-all') {
			await this.writeSingleFile(file);
			return { confirmMode: decision === 'yes-all' ? 'write-rest' : 'ask', skipped: 0, written: 1 };
		}

		this.console.print(`  ${this.color.yellow('○')} Skipped: ${file.path}`);
		return { confirmMode: decision === 'no-all' ? 'skip-rest' : 'ask', skipped: 1, written: 0 };
	}

	/**
	 * Write a single file
	 */
	private async writeSingleFile(file: PendingWrite): Promise<void> {
		await writeFile(file.fullPath, file.content);
		this.logger.info(`Created/updated file: ${file.fullPath}`, { contentLength: file.content.length });
		this.console.print(`  ${this.color.green('✓')} ${file.path}`);
	}

	/**
	 * Display file preview
	 */
	private displayFilePreview(file: PendingWrite): void {
		const lines = file.content.split('\n');
		const previewLines = lines.slice(0, 15);
		const previewContent = previewLines.join('\n');
		const truncationNotice = lines.length > 15 ? this.color.gray(`\n... ${lines.length - 15} more lines ...`) : '';

		this.console.blank();
		this.console.print(this.color.bold(`📄 File: ${file.path}`));
		this.console.print(this.color.dim(`   Size: ${file.content.length} characters, ${lines.length} lines`));
		this.console.divider();
		this.console.print(previewContent);
		if (truncationNotice) {
			this.console.print(truncationNotice);
		}
		this.console.divider();
	}

	/**
	 * Prompt for file decision
	 */
	private async promptFileDecision(): Promise<string> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{ name: 'Yes, save this file', value: 'yes' },
					{ name: 'Yes to all remaining files', value: 'yes-all' },
					{ name: 'No, skip this file', value: 'no' },
					{ name: 'No, skip all remaining files', value: 'no-all' }
				],
				default: 'yes',
				message: 'Save this file?',
				name: 'decision',
				type: 'list'
			}
		]);
		return answers['decision'] as string;
	}

	/**
	 * Display flush result
	 */
	private displayResult(written: number, skipped: number): void {
		this.console.blank();
		if (written > 0) {
			this.console.success(`${written} file(s) saved successfully`);
		}
		if (skipped > 0) {
			this.console.warn(`${skipped} file(s) skipped`);
		}
		this.console.blank();
	}
}
