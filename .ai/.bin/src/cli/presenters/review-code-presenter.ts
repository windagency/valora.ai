/**
 * Review Code Presenter - Displays code review summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { BasePresenter } from './base-presenter';

/**
 * Type definitions for review-code outputs
 */
interface BlockingIssue {
	description?: string;
	file?: string;
	impact?: string;
}

interface ChangedFile {
	criticality?: string;
	file?: string;
	path?: string;
	type?: string;
}

interface Issue {
	category?: string;
	description?: string;
	file?: string;
	line?: number;
	severity?: string;
}

interface Recommendation {
	description?: string;
	priority?: string;
	recommendation?: string;
}

interface SecurityConcern {
	description?: string;
	severity?: string;
}

interface ValidationResult {
	issues?: number;
	score?: number;
	status?: string;
}

/**
 * Presenter for review-code command output
 */
export class ReviewCodePresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Code Review Summary');
		this.displayDecision(outputs);
		this.displayChangedFiles(outputs);
		this.displayValidationResults(outputs);
		this.displayIssues(outputs);
		this.displayBlockingIssues(outputs);
		this.displaySecurityConcerns(outputs);
		this.displayRecommendations(outputs);
		this.displayNextSteps(outputs);
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'review-code';
	}

	private displayBlockingIssues(outputs: Record<string, unknown>): void {
		const blockingIssues = this.getArray<BlockingIssue>(outputs, 'blocking_issues');
		if (!blockingIssues || blockingIssues.length === 0) return;

		this.console.print(`\n🚨 Blocking Issues (${blockingIssues.length}):`);
		for (const issue of blockingIssues.slice(0, 3)) {
			const desc = issue.description ?? 'Blocking issue';
			this.console.print(`   • ${desc}`);
			if (issue.file) {
				this.console.print(`     at ${issue.file}`);
			}
			if (issue.impact) {
				this.console.print(`     Impact: ${issue.impact}`);
			}
		}
		if (blockingIssues.length > 3) {
			this.console.print(`   ... and ${blockingIssues.length - 3} more`);
		}
	}

	private displayChangedFiles(outputs: Record<string, unknown>): void {
		const changedFiles = this.getArray<ChangedFile>(outputs, 'changed_files');
		if (!changedFiles || changedFiles.length === 0) return;

		this.console.print(`\n📁 Files Reviewed (${changedFiles.length}):`);
		this.displayList(changedFiles, (file) => {
			const filePath = file.path ?? file.file ?? 'Unknown file';
			const criticality = file.criticality ? ` [${file.criticality}]` : '';
			return `${filePath}${criticality}`;
		});
	}

	private displayDecision(outputs: Record<string, unknown>): void {
		const reviewDecision = this.getString(outputs, 'review_decision');
		const qualityScore = this.getNumber(outputs, 'quality_score');

		if (reviewDecision) {
			const decisionIcon = this.getDecisionIcon(reviewDecision);
			const decisionText = this.normalizeDecision(reviewDecision);
			this.console.print(`\n${decisionIcon} Decision: ${decisionText}`);
		}

		if (qualityScore !== undefined) {
			const scoreIcon = qualityScore >= 80 ? '✓' : qualityScore >= 60 ? '○' : '✗';
			this.console.print(`   Quality Score: ${qualityScore}/100 ${scoreIcon}`);
		}
	}

	private displayDefaultNextSteps(reviewDecision?: string): void {
		const upper = reviewDecision?.toUpperCase() ?? '';
		if (['APPROVE', 'APPROVED'].includes(upper)) {
			this.console.print('   → Ready for functional review');
			this.console.print('   Run: valora review-functional');
		} else if (['BLOCK', 'BLOCKED'].includes(upper)) {
			this.console.print('   → Address blocking issues before proceeding');
			this.console.print('   Run: valora implement (to fix issues)');
		} else {
			this.console.print('   → Address requested changes');
			this.console.print('   Run: valora implement (to address feedback)');
		}
	}

	private displayIssues(outputs: Record<string, unknown>): void {
		const issuesFound = this.getArray<Issue>(outputs, 'issues_found');
		if (!issuesFound || issuesFound.length === 0) return;

		const bySeverity = this.groupBySeverity(issuesFound);
		const severityOrder = ['critical', 'high', 'medium', 'low'];

		this.console.print(`\n⚠️  Issues Found (${issuesFound.length}):`);
		for (const severity of severityOrder) {
			this.displaySeverityGroup(severity, bySeverity.get(severity));
		}
	}

	/**
	 * Display a group of issues by severity
	 */
	private displaySeverityGroup(severity: string, issues: Issue[] | undefined): void {
		if (!issues || issues.length === 0) return;

		const icon = this.getSeverityIcon(severity);
		const label = severity.charAt(0).toUpperCase() + severity.slice(1);
		this.console.print(`   ${icon} ${label}: ${issues.length}`);

		for (const issue of issues.slice(0, 2)) {
			this.displayIssueItem(issue);
		}
		if (issues.length > 2) {
			this.console.print(`      ... and ${issues.length - 2} more`);
		}
	}

	/**
	 * Display a single issue item
	 */
	private displayIssueItem(issue: Issue): void {
		const desc = issue.description ?? 'Issue found';
		this.console.print(`      • ${desc}`);
		if (issue.file) {
			const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
			this.console.print(`        at ${location}`);
		}
	}

	private displayNextSteps(outputs: Record<string, unknown>): void {
		const nextSteps = this.getArray<string>(outputs, 'next_steps');
		const reviewDecision = this.getString(outputs, 'review_decision');

		this.console.print('\n🚀 Next Steps:');
		if (nextSteps && nextSteps.length > 0) {
			for (const step of nextSteps.slice(0, 3)) {
				this.console.print(`   → ${step}`);
			}
		} else {
			this.displayDefaultNextSteps(reviewDecision);
		}
	}

	private displayRecommendations(outputs: Record<string, unknown>): void {
		const recommendations = this.getArray<Recommendation>(outputs, 'recommendations');
		if (!recommendations || recommendations.length === 0) return;

		this.console.print(`\n💡 Recommendations (${recommendations.length}):`);
		for (const rec of recommendations.slice(0, 5)) {
			const priority = rec.priority ? `[${rec.priority}]` : '';
			const text = rec.recommendation ?? rec.description ?? 'Recommendation';
			this.console.print(`   • ${priority} ${text}`);
		}
		if (recommendations.length > 5) {
			this.console.print(`   ... and ${recommendations.length - 5} more`);
		}
	}

	private displaySecurityConcerns(outputs: Record<string, unknown>): void {
		const securityConcerns = this.getArray<SecurityConcern>(outputs, 'security_concerns');
		if (!securityConcerns || securityConcerns.length === 0) return;

		this.console.print(`\n🔒 Security Concerns (${securityConcerns.length}):`);
		for (const concern of securityConcerns.slice(0, 3)) {
			const severity = concern.severity ? `[${concern.severity.toUpperCase()}]` : '';
			const desc = concern.description ?? 'Security concern';
			this.console.print(`   • ${severity} ${desc}`);
		}
		if (securityConcerns.length > 3) {
			this.console.print(`   ... and ${securityConcerns.length - 3} more`);
		}
	}

	private displayValidationResults(outputs: Record<string, unknown>): void {
		const validationResults = this.getObject<Record<string, ValidationResult>>(outputs, 'validation_results');
		if (!validationResults || Object.keys(validationResults).length === 0) return;

		this.console.print('\n📊 Validation Results:');
		const entries = Object.entries(validationResults);
		for (const [category, data] of entries) {
			const statusIcon = data.status ? this.getStatusIcon(data.status) : '○';
			const score = data.score !== undefined ? ` (${data.score}/100)` : '';
			const issues = data.issues !== undefined && data.issues > 0 ? ` - ${data.issues} issue(s)` : '';
			const formattedCategory = this.formatKey(category);
			this.console.print(`   ${statusIcon} ${formattedCategory}${score}${issues}`);
		}
	}

	private groupBySeverity(issues: Issue[]): Map<string, Issue[]> {
		const grouped = new Map<string, Issue[]>();
		for (const issue of issues) {
			const severity = issue.severity ?? 'medium';
			const existing = grouped.get(severity) ?? [];
			existing.push(issue);
			grouped.set(severity, existing);
		}
		return grouped;
	}

	private normalizeDecision(decision: string): string {
		const upper = decision.toUpperCase();
		if (['APPROVE', 'APPROVED'].includes(upper)) return 'APPROVED';
		if (['BLOCK', 'BLOCKED'].includes(upper)) return 'BLOCKED';
		return 'CHANGES REQUESTED';
	}
}
