/**
 * Result Comparator - Compare and rank exploration outcomes
 *
 * Provides detailed comparison of different exploration results
 */

import type { Exploration, WorktreeExploration } from 'types/exploration.types';

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { getLogger } from 'output/logger';
import * as path from 'path';
import { promisify } from 'util';

import type { ExplorationStateManager } from './exploration-state';

import { CollaborationCoordinator } from './collaboration-coordinator';

const execAsync = promisify(exec);
const logger = getLogger();

export interface ComparisonMetrics {
	status: string;
	strategy: string;
	worktree_index: number;

	// Performance metrics
	cpu_usage_avg: number;
	duration_seconds: number;
	memory_usage_avg_mb: number;

	// Progress metrics
	errors_count: number;
	progress_percentage: number;
	stages_completed: number;

	// Collaboration metrics
	decisions_participated: number;
	insights_published: number;

	// Code metrics (if available)
	files_changed?: number;
	lines_added?: number;
	lines_removed?: number;
	test_results?: TestResults;

	// Overall score (0-100)
	overall_score: number;
}

export interface ComparisonReport {
	exploration_id: string;
	metrics: ComparisonMetrics[];
	mode: 'parallel' | 'sequential';
	recommendation: string;

	summary: string;
	task: string;
	total_duration_ms: number;
	winner_index?: number;
}

export interface RankingCriteria {
	collaboration_weight: number; // Weight for collaboration
	performance_weight: number; // Weight for resource efficiency
	quality_weight: number; // Weight for code quality/tests
	success_weight: number; // Weight for completion status
}

export interface TestResults {
	coverage_percent?: number;
	failed: number;
	passed: number;
	skipped: number;
	total: number;
}

interface CodeMetrics {
	files_changed: number;
	lines_added: number;
	lines_removed: number;
	test_results?: TestResults;
}

interface JestTestResults {
	coverageMap?: {
		total?: {
			lines?: {
				pct?: number;
			};
		};
	};
	numFailedTests: number;
	numPassedTests: number;
	numPendingTests: number;
	numTotalTests: number;
}

export class ResultComparator {
	private exploration: Exploration;
	private stateManager: ExplorationStateManager;

	constructor(exploration: Exploration, stateManager: ExplorationStateManager) {
		this.exploration = exploration;
		this.stateManager = stateManager;
	}

	/**
	 * Generate comprehensive comparison report
	 */
	async generateComparisonReport(): Promise<ComparisonReport> {
		logger.info(`Generating comparison report for exploration ${this.exploration.id}`);

		// Collect metrics for all worktrees
		const metrics = await this.collectMetricsForAllWorktrees();

		// Rank worktrees
		const rankedMetrics = this.rankWorktrees(metrics);

		// Determine winner
		const winner = rankedMetrics.find((m) => m.status === 'completed');
		const winnerIndex = winner?.worktree_index;

		// Generate summary
		const summary = this.generateSummary(rankedMetrics, winnerIndex);
		const recommendation = this.generateRecommendation(rankedMetrics, winnerIndex);

		return {
			exploration_id: this.exploration.id,
			metrics: rankedMetrics,
			mode: this.exploration.mode,
			recommendation,
			summary,
			task: this.exploration.task,
			total_duration_ms: this.exploration.duration_ms ?? 0,
			winner_index: winnerIndex
		};
	}

	/**
	 * Collect metrics for all worktrees
	 */
	private async collectMetricsForAllWorktrees(): Promise<ComparisonMetrics[]> {
		const metrics: ComparisonMetrics[] = [];

		for (let i = 0; i < this.exploration.worktrees.length; i++) {
			const worktree = this.exploration.worktrees[i];
			if (!worktree) {
				continue;
			}
			const worktreeMetrics = await this.collectWorktreeMetrics(worktree, i + 1);
			metrics.push(worktreeMetrics);
		}

		return metrics;
	}

	/**
	 * Collect metrics for a single worktree
	 */
	private async collectWorktreeMetrics(worktree: WorktreeExploration, index: number): Promise<ComparisonMetrics> {
		const duration = worktree.container_stats?.uptime_seconds ?? 0;
		const collaborationStats = await this.getCollaborationStats(index);
		const codeMetrics = await this.getCodeMetrics(worktree);

		const score = this.calculateOverallScore(worktree, {
			codeMetrics,
			decisionsParticipated: collaborationStats.decisionsParticipated,
			duration,
			insightsPublished: collaborationStats.insightsPublished
		});

		return this.buildComparisonMetrics(worktree, index, collaborationStats, codeMetrics, score, duration);
	}

	/**
	 * Get collaboration statistics for a worktree
	 */
	private async getCollaborationStats(
		index: number
	): Promise<{ decisionsParticipated: number; insightsPublished: number }> {
		const sharedVolumePath = this.stateManager.getSharedVolumePath(this.exploration.id);
		const coordinator = new CollaborationCoordinator(
			`${sharedVolumePath}/insights-pool.json`,
			`${sharedVolumePath}/decisions-pool.json`,
			this.exploration.id
		);

		try {
			const insights = await coordinator.getAllInsights();
			const insightsPublished = insights.filter((i) => i.worktree_id === `worktree-${index}`).length;

			const decisions = await coordinator.getAllDecisions();
			const decisionsParticipated = decisions.filter((d) => Object.keys(d.votes).includes(`worktree-${index}`)).length;

			return { decisionsParticipated, insightsPublished };
		} catch {
			return { decisionsParticipated: 0, insightsPublished: 0 };
		}
	}

	/**
	 * Build comparison metrics object
	 */
	private buildComparisonMetrics(
		worktree: WorktreeExploration,
		index: number,
		collaborationStats: { decisionsParticipated: number; insightsPublished: number },
		codeMetrics: CodeMetrics | null,
		score: number,
		duration: number
	): ComparisonMetrics {
		return {
			cpu_usage_avg: worktree.container_stats?.cpu_usage_percent ?? 0,
			decisions_participated: collaborationStats.decisionsParticipated,
			duration_seconds: duration,
			errors_count: worktree.progress.errors.length,
			files_changed: codeMetrics?.files_changed,
			insights_published: collaborationStats.insightsPublished,
			lines_added: codeMetrics?.lines_added,
			lines_removed: codeMetrics?.lines_removed,
			memory_usage_avg_mb: worktree.container_stats?.memory_usage_mb ?? 0,
			overall_score: score,
			progress_percentage: worktree.progress.percentage,
			stages_completed: worktree.progress.stages_completed.length,
			status: worktree.status,
			strategy: worktree.strategy ?? 'default',
			test_results: codeMetrics?.test_results,
			worktree_index: index
		};
	}

	/**
	 * Get code metrics from git diff
	 */
	private async getCodeMetrics(worktree: WorktreeExploration): Promise<CodeMetrics | null> {
		try {
			// Get git diff stats
			const { stdout } = await execAsync(
				`git -C ${worktree.worktree_path} diff --shortstat ${worktree.branch_name}~1 ${worktree.branch_name}`
			);

			// Parse output like: "3 files changed, 45 insertions(+), 12 deletions(-)"
			const filesMatch = stdout.match(/(\d+) file[s]? changed/);
			const insertionsMatch = stdout.match(/(\d+) insertion[s]?\(\+\)/);
			const deletionsMatch = stdout.match(/(\d+) deletion[s]?\(-\)/);

			const filesChanged = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;
			const linesAdded = insertionsMatch?.[1] ? parseInt(insertionsMatch[1], 10) : 0;
			const linesRemoved = deletionsMatch?.[1] ? parseInt(deletionsMatch[1], 10) : 0;

			// Try to get test results if they exist
			const testResults = await this.getTestResults(worktree);

			return {
				files_changed: filesChanged,
				lines_added: linesAdded,
				lines_removed: linesRemoved,
				test_results: testResults
			};
		} catch (error) {
			logger.debug(`Could not get code metrics for worktree ${worktree.worktree_path}: ${(error as Error).message}`);
			return null;
		}
	}

	/**
	 * Get test results if available
	 */
	private async getTestResults(worktree: WorktreeExploration): Promise<TestResults | undefined> {
		try {
			// Try to find test results file
			const testResultsPaths = [
				path.join(worktree.worktree_path, 'test-results.json'),
				path.join(worktree.worktree_path, 'coverage', 'coverage-summary.json'),
				path.join(worktree.worktree_path, '.test-results.json')
			];

			for (const testPath of testResultsPaths) {
				try {
					const data = await fs.readFile(testPath, 'utf-8');
					const results: unknown = JSON.parse(data);

					// Try to parse different test result formats
					if (isJestTestResults(results)) {
						// Jest format
						const coveragePercent = results.coverageMap?.total?.lines?.pct;
						const failed = results.numFailedTests;
						const passed = results.numPassedTests;
						const skipped = results.numPendingTests;
						const total = results.numTotalTests;

						return {
							coverage_percent: coveragePercent,
							failed,
							passed,
							skipped,
							total
						};
					}
				} catch {
					// Try next path
				}
			}
		} catch {
			// No test results available
		}

		return undefined;
	}

	/**
	 * Calculate overall score for a worktree
	 */
	private calculateOverallScore(
		worktree: WorktreeExploration,
		additionalMetrics: {
			codeMetrics: CodeMetrics | null;
			decisionsParticipated: number;
			duration: number;
			insightsPublished: number;
		}
	): number {
		let score = 0;

		// Success status (40 points) - using status scoring map
		const statusScores: Record<string, number> = {
			completed: 40,
			failed: 0,
			running: 20
		};
		score += statusScores[worktree.status] ?? 0;

		// Progress (20 points)
		score += (worktree.progress.percentage / 100) * 20;

		// Code quality (20 points)
		if (additionalMetrics.codeMetrics?.test_results) {
			const testScore =
				(additionalMetrics.codeMetrics.test_results.passed / additionalMetrics.codeMetrics.test_results.total) * 15;
			score += testScore;

			if (additionalMetrics.codeMetrics.test_results.coverage_percent) {
				score += (additionalMetrics.codeMetrics.test_results.coverage_percent / 100) * 5;
			}
		}

		// Collaboration (10 points)
		const collaborationScore = Math.min(
			10,
			additionalMetrics.insightsPublished * 2 + additionalMetrics.decisionsParticipated * 3
		);
		score += collaborationScore;

		// Errors penalty (up to -10 points)
		const errorsPenalty = Math.min(10, worktree.progress.errors.length * 2);
		score -= errorsPenalty;

		return Math.max(0, Math.min(100, score));
	}

	/**
	 * Rank worktrees by overall score
	 */
	private rankWorktrees(metrics: ComparisonMetrics[], _criteria?: RankingCriteria): ComparisonMetrics[] {
		// Sort by overall score (descending)
		return metrics.sort((a, b) => b.overall_score - a.overall_score);
	}

	/**
	 * Generate summary text
	 */
	private generateSummary(metrics: ComparisonMetrics[], winnerIndex?: number): string {
		const completed = metrics.filter((m) => m.status === 'completed').length;

		let summary = `Exploration completed with ${completed}/${metrics.length} successful worktrees.\n\n`;

		if (winnerIndex) {
			const winner = metrics.find((m) => m.worktree_index === winnerIndex);
			if (winner) {
				summary += `Winner: Worktree ${winnerIndex} (${winner.strategy}) with score ${winner.overall_score.toFixed(1)}/100\n`;
				summary += `- Duration: ${winner.duration_seconds}s\n`;
				summary += `- Progress: ${winner.progress_percentage}%\n`;
				summary += `- Insights Published: ${winner.insights_published}\n`;

				if (winner.test_results) {
					summary += `- Tests: ${winner.test_results.passed}/${winner.test_results.total} passed`;
					if (winner.test_results.coverage_percent) {
						summary += ` (${winner.test_results.coverage_percent.toFixed(1)}% coverage)`;
					}
					summary += '\n';
				}
			}
		}

		return summary;
	}

	/**
	 * Generate recommendation
	 */
	private generateRecommendation(metrics: ComparisonMetrics[], winnerIndex?: number): string {
		if (!winnerIndex) {
			return 'No successful exploration found. Review the errors and try again with adjusted strategies.';
		}

		const winner = metrics.find((m) => m.worktree_index === winnerIndex);
		if (!winner) {
			return 'Winner not found in metrics.';
		}

		let recommendation = `Recommend merging Worktree ${winnerIndex} (${winner.strategy}). `;

		// Add specific recommendations based on metrics using handler pattern
		const scoreRecommendations: Array<{
			message: string;
			threshold: number;
		}> = [
			{
				message: 'Excellent implementation with high quality and completion.',
				threshold: 90
			},
			{
				message: 'Good implementation, but consider reviewing areas for improvement.',
				threshold: 75
			},
			{
				message: 'Acceptable implementation, but significant improvements may be needed.',
				threshold: 60
			},
			{
				message: 'Low quality score. Consider additional refinement before merging or trying other approaches.',
				threshold: 0
			}
		];

		const scoreRec = scoreRecommendations.find((rec) => winner.overall_score >= rec.threshold);
		recommendation += scoreRec?.message ?? '';

		// Add specific notes
		if (winner.errors_count > 5) {
			recommendation += ` Note: ${winner.errors_count} errors encountered during exploration.`;
		}

		if (winner.test_results && winner.test_results.failed > 0) {
			recommendation += ` Warning: ${winner.test_results.failed} tests failing.`;
		}

		return recommendation;
	}

	/**
	 * Generate detailed comparison table (for CLI output)
	 */
	generateComparisonTable(metrics: ComparisonMetrics[]): string {
		let table = '';

		// Header
		table += '┌─────┬──────────────┬───────────┬──────────┬──────────┬───────┐\n';
		table += '│ WT  │   Strategy   │  Status   │ Progress │  Score   │ Tests │\n';
		table += '├─────┼──────────────┼───────────┼──────────┼──────────┼───────┤\n';

		// Rows
		for (const metric of metrics) {
			const wt = metric.worktree_index.toString().padStart(3);
			const strategy = metric.strategy.substring(0, 12).padEnd(12);
			const status = metric.status.padEnd(9);
			const progress = `${metric.progress_percentage}%`.padStart(8);
			const score = `${metric.overall_score.toFixed(1)}`.padStart(8);

			let tests = 'N/A'.padStart(5);
			if (metric.test_results) {
				tests = `${metric.test_results.passed}/${metric.test_results.total}`.padStart(5);
			}

			table += `│ ${wt} │ ${strategy} │ ${status} │ ${progress} │ ${score} │ ${tests} │\n`;
		}

		table += '└─────┴──────────────┴───────────┴──────────┴──────────┴───────┘\n';

		return table;
	}

	/**
	 * Export comparison report to JSON
	 */
	async exportToJson(outputPath: string): Promise<void> {
		const report = await this.generateComparisonReport();
		await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
		logger.info(`Comparison report exported to ${outputPath}`);
	}

	/**
	 * Export comparison report to Markdown
	 */
	async exportToMarkdown(outputPath: string): Promise<void> {
		const report = await this.generateComparisonReport();

		let markdown = `# Exploration Comparison Report\n\n`;
		markdown += `**Exploration ID**: ${report.exploration_id}\n`;
		markdown += `**Task**: ${report.task}\n`;
		markdown += `**Mode**: ${report.mode}\n`;
		markdown += `**Duration**: ${(report.total_duration_ms / 1000).toFixed(2)}s\n\n`;

		markdown += `## Summary\n\n${report.summary}\n\n`;
		markdown += `## Recommendation\n\n${report.recommendation}\n\n`;

		markdown += `## Detailed Metrics\n\n`;
		markdown += `| WT | Strategy | Status | Progress | Score | CPU | Memory | Insights | Decisions |\n`;
		markdown += `|----|----------|--------|----------|-------|-----|--------|----------|----------|\n`;

		for (const metric of report.metrics) {
			markdown += `| ${metric.worktree_index} `;
			markdown += `| ${metric.strategy} `;
			markdown += `| ${metric.status} `;
			markdown += `| ${metric.progress_percentage}% `;
			markdown += `| ${metric.overall_score.toFixed(1)} `;
			markdown += `| ${metric.cpu_usage_avg.toFixed(1)}% `;
			markdown += `| ${metric.memory_usage_avg_mb.toFixed(0)}MB `;
			markdown += `| ${metric.insights_published} `;
			markdown += `| ${metric.decisions_participated} |\n`;
		}

		await fs.writeFile(outputPath, markdown, 'utf-8');
		logger.info(`Comparison report exported to ${outputPath}`);
	}
}

function isJestTestResults(value: unknown): value is JestTestResults {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj['numTotalTests'] === 'number' &&
		typeof obj['numFailedTests'] === 'number' &&
		typeof obj['numPassedTests'] === 'number' &&
		typeof obj['numPendingTests'] === 'number'
	);
}
