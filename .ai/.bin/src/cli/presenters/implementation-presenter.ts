/**
 * Implementation Presenter - Displays implementation summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { BasePresenter } from './base-presenter';

/**
 * Type definitions for implement outputs
 */
interface CodeChanges {
	commands_executed?: string[];
	files_created?: FileCreated[];
	files_deleted?: string[];
	files_modified?: string[];
}

interface FileCreated {
	path: string;
	purpose?: string;
}

interface ImplementationNotes {
	approach?: string;
	decisions?: string[];
}

interface IssueItem {
	description?: string;
	issue?: string;
	message?: string;
}

interface TestFile {
	path: string;
	test_count?: number;
	type?: string;
}

interface TestResults {
	failed?: number;
	passed?: number;
	status?: string;
	total_tests?: number;
}

/**
 * Presenter for implement command output
 */
export class ImplementationPresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Implementation Summary');
		this.displayFilesCreated(outputs);
		this.displayFilesModified(outputs);
		this.displayFilesDeleted(outputs);
		this.displayTestFiles(outputs);
		this.displayTestResults(outputs);
		this.displayVerificationStatus(outputs);
		this.displayApproach(outputs);
		this.displayBreakingChanges(outputs);
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'implement';
	}

	private displayApproach(outputs: Record<string, unknown>): void {
		const implNotes = this.getObject<ImplementationNotes>(outputs, 'implementation_notes');
		if (!implNotes?.approach) return;

		this.console.print('\n📋 Approach:');
		const approach = this.truncate(implNotes.approach, 200);
		this.console.print(`   ${approach}`);
	}

	private displayBreakingChanges(outputs: Record<string, unknown>): void {
		const breakingChanges = this.getArray<string>(outputs, 'breaking_changes');
		if (!breakingChanges || breakingChanges.length === 0) return;

		this.console.print('\n⚠️  Breaking Changes:');
		for (const change of breakingChanges) {
			this.console.print(`   • ${change}`);
		}
	}

	private displayFilesCreated(outputs: Record<string, unknown>): void {
		const codeChanges = this.getObject<CodeChanges>(outputs, 'code_changes');
		const filesCreated = codeChanges?.files_created;
		if (!filesCreated || filesCreated.length === 0) return;

		this.console.print(`\n📁 Files Created (${filesCreated.length}):`);
		for (const file of filesCreated.slice(0, 10)) {
			const purpose = file.purpose ? ` - ${file.purpose}` : '';
			this.console.print(`   • ${file.path}${purpose}`);
		}
		if (filesCreated.length > 10) {
			this.console.print(`   ... and ${filesCreated.length - 10} more`);
		}
	}

	private displayFilesDeleted(outputs: Record<string, unknown>): void {
		const codeChanges = this.getObject<CodeChanges>(outputs, 'code_changes');
		const filesDeleted = codeChanges?.files_deleted;
		if (!filesDeleted || filesDeleted.length === 0) return;

		this.console.print(`\n🗑️  Files Deleted (${filesDeleted.length}):`);
		this.displayList(filesDeleted, (file) => this.extractPath(file));
	}

	private displayFilesModified(outputs: Record<string, unknown>): void {
		const codeChanges = this.getObject<CodeChanges>(outputs, 'code_changes');
		const filesModified = codeChanges?.files_modified;
		if (!filesModified || filesModified.length === 0) return;

		this.console.print(`\n📝 Files Modified (${filesModified.length}):`);
		this.displayList(filesModified, (file) => this.extractPath(file), { limit: 10 });
	}

	/**
	 * Extract file path from either a string or an object with path property
	 */
	private displayTestFiles(outputs: Record<string, unknown>): void {
		const testFiles = this.getArray<TestFile>(outputs, 'test_files');
		if (!testFiles || testFiles.length === 0) return;

		const totalTests = testFiles.reduce((sum, tf) => sum + (tf.test_count ?? 0), 0);
		this.console.print(`\n🧪 Test Files Created (${testFiles.length}, ${totalTests} tests):`);

		for (const testFile of testFiles.slice(0, 5)) {
			const testInfo = testFile.test_count ? ` (${testFile.test_count} tests)` : '';
			const typeInfo = testFile.type ? ` [${testFile.type}]` : '';
			this.console.print(`   • ${testFile.path}${typeInfo}${testInfo}`);
		}
		if (testFiles.length > 5) {
			this.console.print(`   ... and ${testFiles.length - 5} more`);
		}
	}

	private displayTestResults(outputs: Record<string, unknown>): void {
		const testResults = this.getObject<TestResults>(outputs, 'test_results');
		if (!testResults) return;

		this.console.print('\n📊 Test Results:');
		if (testResults.status) {
			this.console.print(`   Status: ${testResults.status}`);
		}
		if (testResults.total_tests !== undefined) {
			const passed = testResults.passed ?? 0;
			const failed = testResults.failed ?? 0;
			this.console.print(`   Total: ${testResults.total_tests} | Passed: ${passed} | Failed: ${failed}`);
		}
	}

	private displayVerificationStatus(outputs: Record<string, unknown>): void {
		const verificationStatus = this.getString(outputs, 'verification_status');
		const issuesFound = this.getArray<IssueItem | string>(outputs, 'issues_found');

		if (!verificationStatus) return;

		const statusIcon = verificationStatus === 'passed' ? '✅' : verificationStatus === 'failed' ? '❌' : '⚠️';
		this.console.print(`\n${statusIcon} Verification: ${verificationStatus}`);

		if (issuesFound && issuesFound.length > 0) {
			this.console.print('   Issues found:');
			for (const issue of issuesFound.slice(0, 5)) {
				const issueText = this.formatIssue(issue);
				this.console.print(`   • ${issueText}`);
			}
		}
	}

	private extractPath(file: unknown): string {
		if (typeof file === 'string') {
			return file;
		}
		if (file && typeof file === 'object') {
			const obj = file as Record<string, unknown>;
			// Try common property names for file paths
			for (const key of ['path', 'filePath', 'file', 'name', 'filename']) {
				if (key in obj && typeof obj[key] === 'string') {
					return obj[key] as string;
				}
			}
			// If no known path property, try to find any string property
			for (const value of Object.values(obj)) {
				if (typeof value === 'string' && value.includes('/')) {
					return value;
				}
			}
		}
		return String(file);
	}

	private formatIssue(issue: IssueItem | string): string {
		if (typeof issue === 'string') return issue;
		return issue.description ?? issue.message ?? issue.issue ?? JSON.stringify(issue);
	}
}
