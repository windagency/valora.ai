/**
 * Feedback Presenter - Displays feedback collection summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { formatDuration } from 'utils/number-format';

import { BasePresenter } from './base-presenter';

/**
 * Bottleneck item structure from performance metrics
 */
interface BottleneckItem {
	[key: string]: unknown;
	command?: string;
	description?: string;
	issue?: string;
	name?: string;
	recommendation?: string;
	severity?: string;
}

/**
 * Recommendation item structure from feedback summary
 */
interface RecommendationItem {
	[key: string]: unknown;
	category?: string;
	description?: string;
	name?: string;
	priority?: string;
	recommendation?: string;
}

/**
 * Presenter for feedback command output
 */
export class FeedbackPresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Feedback Summary');
		this.displayWorkflowHeader(outputs);
		this.displayPerformanceMetrics(outputs);
		this.displayQualityMetrics(outputs);
		this.displayBottlenecks(outputs);
		this.displayKeyInsights(outputs);
		this.displayRecommendations(outputs);
		this.displayNextSteps();
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'feedback';
	}

	private displayBottlenecks(outputs: Record<string, unknown>): void {
		const bottlenecks = this.getArray<BottleneckItem>(outputs, 'bottlenecks_identified');
		if (!bottlenecks || bottlenecks.length === 0) return;

		this.console.print(`\n🐌 Bottlenecks Identified (${bottlenecks.length}):`);
		this.displayList(bottlenecks, (b) => this.formatBottleneck(b), { limit: 3 });
	}

	private displayKeyInsights(outputs: Record<string, unknown>): void {
		const insights = this.getArray<string>(outputs, 'key_insights');
		if (!insights || insights.length === 0) return;

		this.console.print(`\n💡 Key Insights:`);
		this.displayList(insights, (i) => (typeof i === 'string' ? i : String(i)), { limit: 5 });
	}

	private displayNextSteps(): void {
		this.console.print('\n🚀 Next Steps:');
		this.console.print('   → /fetch-task for next task');
		this.console.print('   → Project complete! 🎉 (if all tasks done)');
	}

	private displayPerformanceMetrics(outputs: Record<string, unknown>): void {
		const timeEfficiency = this.getNumber(outputs, 'time_efficiency_score');
		const errorRate = this.getNumber(outputs, 'error_rate');
		const completionRate = this.getNumber(outputs, 'completion_success_rate');

		if (timeEfficiency === undefined && errorRate === undefined && completionRate === undefined) {
			return;
		}

		this.console.print('\n📈 Performance Metrics:');
		if (timeEfficiency !== undefined) {
			this.console.print(`   • Time Efficiency: ${timeEfficiency}/100`);
		}
		if (errorRate !== undefined) {
			this.console.print(`   • Error Rate: ${errorRate}%`);
		}
		if (completionRate !== undefined) {
			this.console.print(`   • Completion Rate: ${completionRate}%`);
		}
	}

	private displayQualityMetrics(outputs: Record<string, unknown>): void {
		const metrics = [
			{ key: 'code_quality_score', label: 'Code Quality' },
			{ key: 'test_quality_score', label: 'Test Quality' },
			{ key: 'review_quality_score', label: 'Review Quality' }
		];

		const values = metrics.map(({ key }) => this.getNumber(outputs, key));
		const overallQuality = this.getNumber(outputs, 'overall_quality_score');

		if (values.every((v) => v === undefined) && overallQuality === undefined) {
			return;
		}

		this.console.print('\n🏆 Quality Metrics:');
		metrics.forEach(({ key, label }) => {
			const value = this.getNumber(outputs, key);
			if (value !== undefined) {
				this.console.print(`   • ${label}: ${value}/100`);
			}
		});

		if (overallQuality !== undefined) {
			const qualityIcon = overallQuality >= 80 ? '✓' : overallQuality >= 60 ? '○' : '✗';
			this.console.print(`   • Overall: ${overallQuality}/100 ${qualityIcon}`);
		}
	}

	private displayRecommendations(outputs: Record<string, unknown>): void {
		const recommendations = this.getArray<RecommendationItem>(outputs, 'recommendations');
		if (!recommendations || recommendations.length === 0) return;

		this.console.print(`\n📋 Recommendations:`);
		this.displayList(recommendations, (r) => this.formatRecommendation(r), { limit: 5 });
	}

	private displayWorkflowHeader(outputs: Record<string, unknown>): void {
		const workflowExecuted = this.getString(outputs, 'workflow_executed');
		const executionDuration = this.getNumber(outputs, 'execution_duration');
		const satisfactionScore = this.getNumber(outputs, 'satisfaction_score');

		if (workflowExecuted) {
			this.console.print(`\n📊 Workflow: ${workflowExecuted}`);
		}
		if (executionDuration !== undefined) {
			this.console.print(`   Duration: ${formatDuration(executionDuration)}`);
		}
		if (satisfactionScore !== undefined) {
			const satIcon = satisfactionScore >= 8 ? '✅' : satisfactionScore >= 5 ? '⚠️' : '❌';
			this.console.print(`   ${satIcon} Satisfaction: ${satisfactionScore}/10`);
		}
	}

	private formatBottleneck(bottleneck: BottleneckItem): string {
		if (typeof bottleneck === 'string') {
			return bottleneck;
		}
		if (typeof bottleneck === 'object' && bottleneck !== null) {
			// Try common properties
			if (bottleneck.issue) {
				const cmd = bottleneck.command ? `[${bottleneck.command}] ` : '';
				return `${cmd}${bottleneck.issue}`;
			}
			if (bottleneck.description) {
				return bottleneck.description;
			}
			if (bottleneck.name) {
				return bottleneck.name;
			}
			// Fallback: stringify first few properties
			const keys = Object.keys(bottleneck).slice(0, 2);
			return keys.map((k) => `${k}: ${bottleneck[k]}`).join(', ');
		}
		return String(bottleneck);
	}

	private formatRecommendation(rec: RecommendationItem): string {
		if (typeof rec === 'string') {
			return rec;
		}
		if (typeof rec === 'object' && rec !== null) {
			const priority = rec.priority ? `[${rec.priority}] ` : '';
			const category = rec.category ? `(${rec.category}) ` : '';
			const desc = rec.description ?? rec.recommendation ?? rec.name ?? '';
			return `${priority}${category}${desc}`;
		}
		return String(rec);
	}
}
