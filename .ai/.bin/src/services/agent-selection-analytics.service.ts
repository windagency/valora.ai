/**
 * Agent Selection Analytics Service
 *
 * Tracks and analyses dynamic agent selection metrics for Phase 7 rollout monitoring
 */

import type { AgentSelection, TaskContext } from 'types/agent.types';
import type { AgentRole } from 'types/command.types';

import { getLogger } from 'output/logger';

export interface AgentSelectionEvent {
	commandName: string;
	confidence: number;
	fallbackUsed: boolean;
	featureFlags: {
		agent_selection_analytics: boolean;
		dynamic_agent_selection: boolean;
		dynamic_agent_selection_implement_only: boolean;
	};
	manualOverride: boolean;
	metadata: Record<string, unknown>;
	previousAgent?: AgentRole;
	reasons: string[];
	selectedAgent: AgentRole;
	sessionId: string;
	taskDescription: string;
	timestamp: number;
}

export interface AgentSelectionMetrics {
	agentDistribution: Record<AgentRole, number>;
	averageConfidence: number;
	commandDistribution: Record<string, number>;
	fallbackRate: number;
	manualOverrideRate: number;
	reasonDistribution: Record<string, number>;
	timeRange: {
		end: number;
		start: number;
	};
	totalSelections: number;
}

export class AgentSelectionAnalyticsService {
	private events: AgentSelectionEvent[] = [];
	private logger = getLogger();

	/**
	 * Record an agent selection event
	 */
	recordAgentSelection(
		sessionId: string,
		commandName: string,
		taskContext: TaskContext,
		agentSelection: AgentSelection,
		featureFlags: unknown,
		manualOverride: boolean = false,
		previousAgent?: AgentRole
	): void {
		const event = this.createSelectionEvent(
			sessionId,
			commandName,
			taskContext,
			agentSelection,
			featureFlags,
			manualOverride,
			previousAgent
		);

		this.events.push(event);
		this.logSelectionEvent(event, sessionId, commandName, manualOverride);
	}

	/**
	 * Create agent selection event
	 */
	private createSelectionEvent(
		sessionId: string,
		commandName: string,
		taskContext: TaskContext,
		agentSelection: AgentSelection,
		featureFlags: unknown,
		manualOverride: boolean,
		previousAgent?: AgentRole
	): AgentSelectionEvent {
		return {
			commandName,
			confidence: agentSelection.confidence,
			fallbackUsed: agentSelection.confidence < 0.75,
			featureFlags: this.parseFeatureFlags(featureFlags),
			manualOverride,
			metadata: this.createEventMetadata(taskContext),
			previousAgent,
			reasons: agentSelection.reasons,
			selectedAgent: agentSelection.selectedAgent as AgentRole,
			sessionId,
			taskDescription: taskContext.description,
			timestamp: Date.now()
		};
	}

	/**
	 * Parse feature flags from unknown type
	 */
	private parseFeatureFlags(featureFlags: unknown): {
		agent_selection_analytics: boolean;
		dynamic_agent_selection: boolean;
		dynamic_agent_selection_implement_only: boolean;
	} {
		const flags = featureFlags as Record<string, boolean> | undefined;
		return {
			agent_selection_analytics: flags?.['agent_selection_analytics'] ?? false,
			dynamic_agent_selection: flags?.['dynamic_agent_selection'] ?? false,
			dynamic_agent_selection_implement_only: flags?.['dynamic_agent_selection_implement_only'] ?? true
		};
	}

	/**
	 * Create event metadata from task context
	 */
	private createEventMetadata(taskContext: TaskContext): Record<string, unknown> {
		return {
			affectedFiles: taskContext.affectedFiles?.length ?? 0,
			args: taskContext.metadata?.['args'],
			complexity: taskContext.complexity,
			dependencies: taskContext.dependencies?.length ?? 0,
			flags: taskContext.metadata?.['flags']
		};
	}

	/**
	 * Log selection event
	 */
	private logSelectionEvent(
		event: AgentSelectionEvent,
		sessionId: string,
		commandName: string,
		manualOverride: boolean
	): void {
		this.logger.debug('Agent selection recorded', {
			commandName,
			confidence: event.confidence,
			fallbackUsed: event.fallbackUsed,
			manualOverride,
			selectedAgent: event.selectedAgent,
			sessionId
		});
	}

	/**
	 * Get metrics for a time range
	 */
	getMetrics(hoursBack: number = 24): AgentSelectionMetrics {
		const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;
		const recentEvents = this.events.filter((e) => e.timestamp >= cutoffTime);

		const totalSelections = recentEvents.length;
		const totalConfidence = recentEvents.reduce((sum, e) => sum + e.confidence, 0);
		const fallbackCount = recentEvents.filter((e) => e.fallbackUsed).length;
		const manualOverrideCount = recentEvents.filter((e) => e.manualOverride).length;

		// Build distributions using reduce
		const agentDistribution = recentEvents.reduce(
			(acc, event) => {
				acc[event.selectedAgent] = (acc[event.selectedAgent] ?? 0) + 1;
				return acc;
			},
			{} as Record<AgentRole, number>
		);

		const commandDistribution = recentEvents.reduce(
			(acc, event) => {
				acc[event.commandName] = (acc[event.commandName] ?? 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);

		const reasonDistribution = recentEvents.reduce(
			(acc, event) => {
				event.reasons.forEach((reason) => {
					acc[reason] = (acc[reason] ?? 0) + 1;
				});
				return acc;
			},
			{} as Record<string, number>
		);

		return {
			agentDistribution,
			averageConfidence: totalSelections > 0 ? totalConfidence / totalSelections : 0,
			commandDistribution,
			fallbackRate: totalSelections > 0 ? fallbackCount / totalSelections : 0,
			manualOverrideRate: totalSelections > 0 ? manualOverrideCount / totalSelections : 0,
			reasonDistribution,
			timeRange: {
				end: Date.now(),
				start: cutoffTime
			},
			totalSelections
		};
	}

	/**
	 * Get success metrics for rollout evaluation
	 */
	getSuccessMetrics(hoursBack: number = 168): {
		// 7 days default
		accuracy: number; // % of high-confidence selections
		completionRate: number; // % of successful resolutions
		insights: string[];
		performance: number; // average confidence score
		userSatisfaction: number; // inverse of manual override rate
	} {
		const metrics = this.getMetrics(hoursBack);
		const highConfidenceSelections = this.events.filter(
			(e) => e.timestamp >= metrics.timeRange.start && e.confidence >= 0.85
		).length;

		const accuracy = metrics.totalSelections > 0 ? highConfidenceSelections / metrics.totalSelections : 0;
		const completionRate = 1 - metrics.fallbackRate; // Successful resolutions
		const userSatisfaction = 1 - metrics.manualOverrideRate; // Lower overrides = higher satisfaction

		const insights: string[] = [];

		// Generate insights
		if (metrics.fallbackRate > 0.15) {
			insights.push(
				`⚠️ High fallback rate (${(metrics.fallbackRate * 100).toFixed(1)}%) indicates potential classification issues`
			);
		}

		if (metrics.manualOverrideRate > 0.2) {
			insights.push(
				`⚠️ High manual override rate (${(metrics.manualOverrideRate * 100).toFixed(1)}%) suggests user dissatisfaction`
			);
		}

		if (accuracy < 0.85) {
			insights.push(`⚠️ Accuracy below target (${(accuracy * 100).toFixed(1)}% < 85%) - review classification logic`);
		}

		const topAgent = Object.entries(metrics.agentDistribution).sort(([, a], [, b]) => b - a)[0];
		if (topAgent) {
			insights.push(`📊 Most selected agent: ${topAgent[0]} (${topAgent[1]} times)`);
		}

		const topCommand = Object.entries(metrics.commandDistribution).sort(([, a], [, b]) => b - a)[0];
		if (topCommand) {
			insights.push(`📊 Most used command: ${topCommand[0]} (${topCommand[1]} times)`);
		}

		return {
			accuracy,
			completionRate,
			insights,
			performance: metrics.averageConfidence,
			userSatisfaction
		};
	}

	/**
	 * Export events for analysis
	 */
	exportEvents(hoursBack?: number): AgentSelectionEvent[] {
		if (!hoursBack) {
			return [...this.events];
		}

		const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;
		return this.events.filter((e) => e.timestamp >= cutoffTime);
	}

	/**
	 * Clear old events (for memory management)
	 */
	clearOldEvents(hoursBack: number = 168): number {
		// Keep 7 days by default
		const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;
		const oldCount = this.events.length;
		this.events = this.events.filter((e) => e.timestamp >= cutoffTime);
		const removedCount = oldCount - this.events.length;

		this.logger.info(`Cleared ${removedCount} old agent selection events`, {
			cutoffHours: hoursBack,
			kept: this.events.length
		});

		return removedCount;
	}

	/**
	 * Get current event count
	 */
	getEventCount(): number {
		return this.events.length;
	}
}
