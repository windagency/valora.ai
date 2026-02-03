/**
 * Review Plan Presenter - Displays plan review summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { BasePresenter } from './base-presenter';

/**
 * Type definitions for review-plan outputs
 */
interface CriticalIssue {
	description?: string;
	id?: string;
}

interface DimensionData {
	score?: number;
	status?: string;
	weight?: number;
	weighted?: number;
}

interface GoNoGoDecision {
	critical_blockers?: number;
	decision?: string;
	next_command?: string;
	rationale?: string;
	threshold?: number;
	threshold_met?: boolean;
}

interface NextSteps {
	before_merging?: string[];
	during_implementation?: string[];
	pre_implementation?: string[];
}

interface RecommendationItem {
	id?: string;
	recommendation?: string;
}

interface Recommendations {
	critical?: RecommendationItem[];
	important?: RecommendationItem[];
	nice_to_have?: RecommendationItem[];
}

/**
 * Presenter for review-plan command output
 */
export class ReviewPlanPresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Plan Review Summary');
		this.displayDecision(outputs);
		this.displayDimensionScores(outputs);
		this.displayCriticalIssues(outputs);
		this.displayRecommendations(outputs);
		this.displayPreImplementationSteps(outputs);
		this.displayRationale(outputs);
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'review-plan';
	}

	private displayCriticalIssues(outputs: Record<string, unknown>): void {
		const criticalIssues = this.getArray<CriticalIssue>(outputs, 'critical_issues');
		if (!criticalIssues || criticalIssues.length === 0) return;

		this.console.print('\n🚨 Critical Issues:');
		for (const issue of criticalIssues) {
			const issueId = issue.id ? `[${issue.id}] ` : '';
			this.console.print(`   • ${issueId}${issue.description ?? 'Unknown issue'}`);
		}
	}

	private displayDecision(outputs: Record<string, unknown>): void {
		const decision = this.getObject<GoNoGoDecision>(outputs, 'go_no_go_decision');
		if (!decision) return;

		const decisionIcon = this.getDecisionIcon(decision.decision ?? 'UNKNOWN');
		this.console.print(`\n${decisionIcon} Decision: ${decision.decision ?? 'UNKNOWN'}`);

		const overallConfidence = this.getNumber(outputs, 'overall_confidence');
		if (overallConfidence !== undefined) {
			const threshold = decision.threshold ?? 7.0;
			const thresholdMet = decision.threshold_met ?? overallConfidence >= threshold;
			const thresholdIcon = thresholdMet ? '✓' : '✗';
			this.console.print(
				`   Confidence: ${overallConfidence.toFixed(1)}/10 (threshold: ${threshold}) ${thresholdIcon}`
			);
		}

		if (decision.critical_blockers !== undefined) {
			this.console.print(`   Critical Blockers: ${decision.critical_blockers}`);
		}

		if (decision.next_command) {
			this.console.print(`   Next Command: ${decision.next_command}`);
		}
	}

	private displayDimensionScores(outputs: Record<string, unknown>): void {
		const dimensionBreakdown = this.getObject<Record<string, DimensionData>>(outputs, 'dimension_breakdown');
		if (!dimensionBreakdown || Object.keys(dimensionBreakdown).length === 0) return;

		this.console.print('\n📊 Dimension Scores:');
		for (const [dimension, data] of Object.entries(dimensionBreakdown)) {
			if (data.score === undefined) continue;

			const statusIcon = this.getDimensionStatusIcon(data.status);
			const formattedDimension = this.formatKey(dimension);
			this.console.print(`   ${statusIcon} ${formattedDimension}: ${data.score.toFixed(1)}/10`);
		}
	}

	private displayPreImplementationSteps(outputs: Record<string, unknown>): void {
		const nextSteps = this.getObject<NextSteps>(outputs, 'next_steps');
		if (!nextSteps?.pre_implementation || nextSteps.pre_implementation.length === 0) return;

		this.console.print('\n🚀 Pre-Implementation Steps:');
		for (const step of nextSteps.pre_implementation.slice(0, 3)) {
			this.console.print(`   • ${step}`);
		}
		if (nextSteps.pre_implementation.length > 3) {
			this.console.print(`   ... and ${nextSteps.pre_implementation.length - 3} more`);
		}
	}

	private displayRationale(outputs: Record<string, unknown>): void {
		const decision = this.getObject<GoNoGoDecision>(outputs, 'go_no_go_decision');
		if (!decision?.rationale) return;

		this.console.print('\n💡 Rationale:');
		const rationale = this.truncate(decision.rationale, 300);
		this.console.print(`   ${rationale}`);
	}

	private displayRecommendations(outputs: Record<string, unknown>): void {
		const recommendations = this.getObject<Recommendations>(outputs, 'improvement_recommendations');
		if (!recommendations) return;

		const criticalCount = recommendations.critical?.length ?? 0;
		const importantCount = recommendations.important?.length ?? 0;
		const niceToHaveCount = recommendations.nice_to_have?.length ?? 0;
		const totalCount = criticalCount + importantCount + niceToHaveCount;

		if (totalCount === 0) return;

		this.console.print(`\n📋 Recommendations (${totalCount}):`);

		this.displayRecommendationCategory('🔴 Critical', recommendations.critical, 3, false);
		this.displayRecommendationCategory('🟡 Important', recommendations.important, 3, true);

		if (niceToHaveCount > 0) {
			this.console.print(`   🟢 Nice-to-have: ${niceToHaveCount}`);
		}
	}

	/**
	 * Display a category of recommendations
	 */
	private displayRecommendationCategory(
		label: string,
		items: Array<{ recommendation?: string }> | undefined,
		maxItems: number,
		showOverflow: boolean
	): void {
		if (!items || items.length === 0) return;

		this.console.print(`   ${label}: ${items.length}`);
		for (const rec of items.slice(0, maxItems)) {
			this.console.print(`      • ${rec.recommendation ?? 'No description'}`);
		}
		if (showOverflow && items.length > maxItems) {
			this.console.print(`      ... and ${items.length - maxItems} more`);
		}
	}

	private getDimensionStatusIcon(status?: string): string {
		if (!status) return '○';
		const icons: Record<string, string> = {
			acceptable: '○',
			excellent: '★',
			good: '✓'
		};
		return icons[status.toLowerCase()] ?? '✗';
	}
}
