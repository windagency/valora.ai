/**
 * Fetch Task Presenter - Displays task fetch summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { BasePresenter } from './base-presenter';

/**
 * Type definitions for fetch-task outputs
 */
interface Blocker {
	id?: string;
	status?: string;
	title?: string;
}

interface FetchedTask {
	acceptance_criteria?: string[];
	description?: string;
	domain?: string;
	effort?: string;
	id?: string;
	priority?: string;
	title?: string;
}

/**
 * Presenter for fetch-task command output
 */
export class FetchTaskPresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Task Fetch Summary');
		this.displayTaskHeader(outputs);
		this.displayReadinessStatus(outputs);
		this.displayDependencies(outputs);
		this.displayReadinessIssues(outputs);
		this.displaySelectionRationale(outputs);
		this.displayNextSteps(outputs);
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'fetch-task';
	}

	private displayDependencies(outputs: Record<string, unknown>): void {
		const dependencyStatus = this.getString(outputs, 'dependency_status');
		const blockersList = this.getArray<Blocker>(outputs, 'blockers_list');
		const satisfactionScore = this.getNumber(outputs, 'satisfaction_score');

		if (!dependencyStatus && (!blockersList || blockersList.length === 0)) return;

		this.console.print('\n🔗 Dependencies:');
		if (dependencyStatus) {
			this.console.print(`   Status: ${dependencyStatus}`);
		}
		if (satisfactionScore !== undefined) {
			this.console.print(`   Satisfaction: ${satisfactionScore}%`);
		}
		this.displayBlockersList(blockersList);
	}

	/**
	 * Display blockers list with truncation
	 */
	private displayBlockersList(blockersList: Blocker[] | undefined): void {
		if (!blockersList || blockersList.length === 0) return;

		this.console.print(`   ❌ Blockers (${blockersList.length}):`);
		for (const blocker of blockersList.slice(0, 3)) {
			const blockerId = blocker.id ?? 'Unknown';
			const title = blocker.title ? `: ${blocker.title}` : '';
			this.console.print(`      • ${blockerId}${title}`);
		}
		if (blockersList.length > 3) {
			this.console.print(`      ... and ${blockersList.length - 3} more`);
		}
	}

	private displayNextSteps(outputs: Record<string, unknown>): void {
		const recommendation = this.getString(outputs, 'recommendation');
		const readinessScore = this.getNumber(outputs, 'readiness_score');

		this.console.print('\n🚀 Next Steps:');
		if (recommendation) {
			this.console.print(`   ${recommendation}`);
		} else if (readinessScore !== undefined && readinessScore >= 75) {
			this.console.print('   → Ready to proceed with planning');
			this.console.print('   Run: valora plan');
		} else {
			this.console.print('   → Address readiness issues before proceeding');
			this.console.print('   Run: valora refine-task (to address gaps)');
		}
	}

	private displayReadinessIssues(outputs: Record<string, unknown>): void {
		const readinessIssues = this.getArray<string>(outputs, 'readiness_issues');
		if (!readinessIssues || readinessIssues.length === 0) return;

		this.console.print(`\n⚠️  Readiness Issues (${readinessIssues.length}):`);
		this.displayList(readinessIssues, (issue) => issue);
	}

	private displayReadinessStatus(outputs: Record<string, unknown>): void {
		const readinessScore = this.getNumber(outputs, 'readiness_score');
		if (readinessScore === undefined) return;

		const statusIcon = readinessScore >= 100 ? '✅' : readinessScore >= 75 ? '⚠️' : '❌';
		const statusText = this.getReadinessText(readinessScore);
		this.console.print(`\n${statusIcon} Readiness: ${statusText} (${readinessScore}%)`);
	}

	private displaySelectionRationale(outputs: Record<string, unknown>): void {
		const selectionRationale = this.getString(outputs, 'selection_rationale');
		if (!selectionRationale) return;

		this.console.print('\n💡 Selection Rationale:');
		const truncated = this.truncate(selectionRationale, 200);
		this.console.print(`   ${truncated}`);
	}

	private displayTaskHeader(outputs: Record<string, unknown>): void {
		const fetchedTask = this.getObject<FetchedTask>(outputs, 'fetched_task');
		if (!fetchedTask) return;

		const taskId = fetchedTask.id ?? 'Unknown';
		this.console.print(`\n🎯 Task: ${taskId}`);

		if (fetchedTask.title) {
			this.console.print(`   Title: ${fetchedTask.title}`);
		}
		if (fetchedTask.priority) {
			this.console.print(`   Priority: ${fetchedTask.priority}`);
		}
		if (fetchedTask.domain) {
			this.console.print(`   Domain: ${fetchedTask.domain}`);
		}
		if (fetchedTask.effort) {
			this.console.print(`   Effort: ${fetchedTask.effort}`);
		}
	}

	private getReadinessText(score: number): string {
		if (score >= 100) return 'Fully Ready';
		if (score >= 75) return 'Ready with Warnings';
		return 'Not Ready';
	}
}
