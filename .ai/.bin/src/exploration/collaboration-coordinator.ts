/**
 * Collaboration Coordinator - Manage shared insights and collaborative decisions
 *
 * Enables active collaboration between agents in different worktrees
 */

import type { Decision, DecisionsPool, Insight, InsightsPool } from 'types/exploration.types';

import { getLogger } from 'output/logger';
import { getFileLockManager } from 'utils/file-lock';
import { generateDecisionId, generateInsightId } from 'utils/id-generator';

const logger = getLogger();

export interface ProposeDecisionOptions {
	options: Array<{ cons?: string[]; description: string; label: string; pros?: string[] }>;
	rationale?: string;
	topic: string;
	worktree_id: string;
}

export interface PublishInsightOptions {
	content: string;
	metadata?: Record<string, unknown>;
	tags?: string[];
	title: string;
	type: Insight['type'];
	worktree_id: string;
}

export interface VoteOnDecisionOptions {
	decision_id: string;
	option_index: number;
	worktree_id: string;
}

export class CollaborationCoordinator {
	private decisionsPoolPath: string;
	private explorationId: string;
	private insightsPoolPath: string;
	private lockManager = getFileLockManager();

	constructor(insightsPoolPath: string, decisionsPoolPath: string, explorationId: string) {
		this.insightsPoolPath = insightsPoolPath;
		this.decisionsPoolPath = decisionsPoolPath;
		this.explorationId = explorationId;
	}

	/**
	 * Publish an insight to the shared pool
	 */
	async publishInsight(options: PublishInsightOptions): Promise<Insight> {
		const insight: Insight = {
			content: options.content,
			id: generateInsightId(),
			metadata: options.metadata ?? {},
			tags: options.tags ?? [],
			timestamp: new Date().toISOString(),
			title: options.title,
			type: options.type,
			worktree_id: options.worktree_id
		};

		// Update insights pool with locking
		await this.lockManager.updateWithLock<InsightsPool>(
			this.insightsPoolPath,
			options.worktree_id,
			(pool) => {
				pool ??= {
					exploration_id: this.explorationId,
					insights: [],
					last_updated: new Date().toISOString(),
					total_count: 0
				};

				pool.insights.push(insight);
				pool.total_count = pool.insights.length;
				pool.last_updated = new Date().toISOString();

				return pool;
			},
			{ pretty: true }
		);

		logger.info(`Insight published: ${insight.title} by ${options.worktree_id}`);
		return insight;
	}

	/**
	 * Get all insights from the pool
	 */
	async getAllInsights(): Promise<Insight[]> {
		const pool = await this.lockManager.readWithLock<InsightsPool>(this.insightsPoolPath, 'coordinator');

		if (!pool) {
			return [];
		}

		return pool.insights;
	}

	/**
	 * Get insights by type
	 */
	async getInsightsByType(type: Insight['type']): Promise<Insight[]> {
		const allInsights = await this.getAllInsights();
		return allInsights.filter((insight) => insight.type === type);
	}

	/**
	 * Get insights by tags
	 */
	async getInsightsByTags(tags: string[]): Promise<Insight[]> {
		const allInsights = await this.getAllInsights();
		return allInsights.filter((insight) => tags.some((tag) => insight.tags.includes(tag)));
	}

	/**
	 * Get insights from other worktrees (exclude own insights)
	 */
	async getInsightsFromOthers(worktreeId: string): Promise<Insight[]> {
		const allInsights = await this.getAllInsights();
		return allInsights.filter((insight) => insight.worktree_id !== worktreeId);
	}

	/**
	 * Get recent insights (last N)
	 */
	async getRecentInsights(count: number = 10): Promise<Insight[]> {
		const allInsights = await this.getAllInsights();
		return allInsights.slice(-count);
	}

	/**
	 * Search insights by keyword
	 */
	async searchInsights(keyword: string): Promise<Insight[]> {
		const allInsights = await this.getAllInsights();
		const lowerKeyword = keyword.toLowerCase();

		return allInsights.filter(
			(insight) =>
				insight.title.toLowerCase().includes(lowerKeyword) ||
				insight.content.toLowerCase().includes(lowerKeyword) ||
				insight.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword))
		);
	}

	/**
	 * Propose a decision for collaborative voting
	 */
	async proposeDecision(options: ProposeDecisionOptions): Promise<Decision> {
		const decision: Decision = {
			id: generateDecisionId(),
			options: options.options.map((opt, index) => ({
				cons: opt.cons ?? [],
				description: opt.description,
				index,
				label: opt.label,
				pros: opt.pros ?? []
			})),
			rationale: options.rationale,
			timestamp: new Date().toISOString(),
			topic: options.topic,
			votes: {}
		};

		// Update decisions pool with locking
		await this.lockManager.updateWithLock<DecisionsPool>(
			this.decisionsPoolPath,
			options.worktree_id,
			(pool) => {
				pool ??= {
					decisions: [],
					exploration_id: this.explorationId,
					last_updated: new Date().toISOString(),
					total_count: 0
				};

				pool.decisions.push(decision);
				pool.total_count = pool.decisions.length;
				pool.last_updated = new Date().toISOString();

				return pool;
			},
			{ pretty: true }
		);

		logger.info(`Decision proposed: ${decision.topic} by ${options.worktree_id}`);
		return decision;
	}

	/**
	 * Vote on a decision
	 */
	async voteOnDecision(options: VoteOnDecisionOptions): Promise<Decision | null> {
		const updatedPool = await this.lockManager.updateWithLock<DecisionsPool>(
			this.decisionsPoolPath,
			options.worktree_id,
			(pool) => {
				// Initialize empty pool if null
				pool ??= {
					decisions: [],
					exploration_id: this.explorationId,
					last_updated: new Date().toISOString(),
					total_count: 0
				};

				const decision = pool.decisions.find((d) => d.id === options.decision_id);
				if (!decision) {
					return pool;
				}

				// Record vote
				decision.votes[options.worktree_id] = options.option_index;

				// Check if decision is resolved (majority vote)
				const voteCounts = this.countVotes(decision);
				const totalVotes = Object.keys(decision.votes).length;
				const majorityThreshold = Math.ceil(totalVotes / 2);

				for (const [optionIndex, count] of Object.entries(voteCounts)) {
					if (count >= majorityThreshold) {
						decision.chosen_option = parseInt(optionIndex);
						break;
					}
				}

				pool.last_updated = new Date().toISOString();
				return pool;
			},
			{ pretty: true }
		);

		const decision = updatedPool?.decisions.find((d) => d.id === options.decision_id);

		if (decision) {
			logger.info(
				`Vote recorded: ${options.worktree_id} voted for option ${options.option_index} on ${decision.topic}`
			);
		}

		return decision ?? null;
	}

	/**
	 * Get all decisions
	 */
	async getAllDecisions(): Promise<Decision[]> {
		const pool = await this.lockManager.readWithLock<DecisionsPool>(this.decisionsPoolPath, 'coordinator');

		if (!pool) {
			return [];
		}

		return pool.decisions;
	}

	/**
	 * Get pending decisions (not yet resolved)
	 */
	async getPendingDecisions(): Promise<Decision[]> {
		const allDecisions = await this.getAllDecisions();
		return allDecisions.filter((decision) => decision.chosen_option === undefined);
	}

	/**
	 * Get resolved decisions
	 */
	async getResolvedDecisions(): Promise<Decision[]> {
		const allDecisions = await this.getAllDecisions();
		return allDecisions.filter((decision) => decision.chosen_option !== undefined);
	}

	/**
	 * Get decision by ID
	 */
	async getDecision(decisionId: string): Promise<Decision | null> {
		const allDecisions = await this.getAllDecisions();
		return allDecisions.find((d) => d.id === decisionId) ?? null;
	}

	/**
	 * Get collaboration statistics
	 */
	async getStats(): Promise<{
		insights_by_type: Record<string, number>;
		insights_by_worktree: Record<string, number>;
		participation_rate: number;
		pending_decisions: number;
		resolved_decisions: number;
		total_decisions: number;
		total_insights: number;
	}> {
		const insights = await this.getAllInsights();
		const decisions = await this.getAllDecisions();

		// Count insights by type
		const insightsByType: Record<string, number> = {};
		for (const insight of insights) {
			insightsByType[insight.type] = (insightsByType[insight.type] ?? 0) + 1;
		}

		// Count insights by worktree
		const insightsByWorktree: Record<string, number> = {};
		for (const insight of insights) {
			insightsByWorktree[insight.worktree_id] = (insightsByWorktree[insight.worktree_id] ?? 0) + 1;
		}

		// Count decisions
		const pendingDecisions = decisions.filter((d) => d.chosen_option === undefined).length;
		const resolvedDecisions = decisions.filter((d) => d.chosen_option !== undefined).length;

		// Calculate participation rate (how many worktrees have contributed)
		const participatingWorktrees = new Set(insights.map((i) => i.worktree_id));
		const participationRate = participatingWorktrees.size; // Just the count for now

		return {
			insights_by_type: insightsByType,
			insights_by_worktree: insightsByWorktree,
			participation_rate: participationRate,
			pending_decisions: pendingDecisions,
			resolved_decisions: resolvedDecisions,
			total_decisions: decisions.length,
			total_insights: insights.length
		};
	}

	/**
	 * Clear all insights (for testing or cleanup)
	 */
	async clearInsights(): Promise<void> {
		await this.lockManager.writeWithLock<InsightsPool>(
			this.insightsPoolPath,
			{
				exploration_id: this.explorationId,
				insights: [],
				last_updated: new Date().toISOString(),
				total_count: 0
			},
			'coordinator',
			{ pretty: true }
		);

		logger.info('All insights cleared');
	}

	/**
	 * Clear all decisions (for testing or cleanup)
	 */
	async clearDecisions(): Promise<void> {
		await this.lockManager.writeWithLock<DecisionsPool>(
			this.decisionsPoolPath,
			{
				decisions: [],
				exploration_id: this.explorationId,
				last_updated: new Date().toISOString(),
				total_count: 0
			},
			'coordinator',
			{ pretty: true }
		);

		logger.info('All decisions cleared');
	}

	/**
	 * Export insights to JSON
	 */
	async exportInsights(): Promise<string> {
		const insights = await this.getAllInsights();
		return JSON.stringify(insights, null, 2);
	}

	/**
	 * Export decisions to JSON
	 */
	async exportDecisions(): Promise<string> {
		const decisions = await this.getAllDecisions();
		return JSON.stringify(decisions, null, 2);
	}

	/**
	 * Get insights summary (for display)
	 */
	async getInsightsSummary(): Promise<string> {
		const insights = await this.getAllInsights();
		const stats = await this.getStats();

		let summary = `# Insights Summary\n\n`;
		summary += `Total Insights: ${stats.total_insights}\n\n`;

		summary += `## By Type\n`;
		for (const [type, count] of Object.entries(stats.insights_by_type)) {
			summary += `- ${type}: ${count}\n`;
		}

		summary += `\n## By Worktree\n`;
		for (const [worktreeId, count] of Object.entries(stats.insights_by_worktree)) {
			summary += `- ${worktreeId}: ${count}\n`;
		}

		summary += `\n## Recent Insights (Last 5)\n`;
		const recent = insights.slice(-5);
		for (const insight of recent) {
			summary += `- [${insight.type}] ${insight.title} (${insight.worktree_id})\n`;
		}

		return summary;
	}

	/**
	 * Get decisions summary (for display)
	 */
	async getDecisionsSummary(): Promise<string> {
		const decisions = await this.getAllDecisions();
		const stats = await this.getStats();

		let summary = `# Decisions Summary\n\n`;
		summary += `Total Decisions: ${stats.total_decisions}\n`;
		summary += `Pending: ${stats.pending_decisions}\n`;
		summary += `Resolved: ${stats.resolved_decisions}\n\n`;

		summary += `## Pending Decisions\n`;
		const pending = decisions.filter((d) => d.chosen_option === undefined);
		for (const decision of pending) {
			summary += `- ${decision.topic} (${Object.keys(decision.votes).length} votes)\n`;
		}

		summary += `\n## Resolved Decisions\n`;
		const resolved = decisions.filter((d) => d.chosen_option !== undefined);
		for (const decision of resolved) {
			const chosenOptionIndex = decision.chosen_option;
			if (chosenOptionIndex === undefined) continue;

			const chosenOption = decision.options[chosenOptionIndex];
			if (!chosenOption) continue;

			summary += `- ${decision.topic} → ${chosenOption.label}\n`;
		}

		return summary;
	}

	/**
	 * Count votes for a decision
	 */
	private countVotes(decision: Decision): Record<number, number> {
		const counts: Record<number, number> = {};

		for (const optionIndex of Object.values(decision.votes)) {
			counts[optionIndex] = (counts[optionIndex] ?? 0) + 1;
		}

		return counts;
	}
}
