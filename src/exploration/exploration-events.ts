/**
 * Exploration Events - Event emitter for real-time exploration updates
 *
 * Provides event-driven updates for dashboard and monitoring
 */

import type { ContainerStats, Decision, Exploration, Insight, WorktreeExploration } from 'types/exploration.types';

import { EventEmitter } from 'events';

export interface ContainerStatsEvent extends ExplorationEvent {
	data: {
		stats: ContainerStats;
	};
	worktree_index: number;
}

export interface DecisionEvent extends ExplorationEvent {
	data: {
		decision: Decision;
	};
}

export interface ExplorationEvent {
	data: unknown;
	exploration_id: string;
	timestamp: string;
	type: ExplorationEventType;
}

export type ExplorationEventType =
	| 'container:created'
	| 'container:stats'
	| 'container:stopped'
	| 'decision:proposed'
	| 'decision:resolved'
	| 'decision:voted'
	| 'exploration:completed'
	| 'exploration:created'
	| 'exploration:failed'
	| 'exploration:started'
	| 'exploration:stopped'
	| 'insight:published'
	| 'merge:completed'
	| 'merge:failed'
	| 'merge:started'
	| 'worktree:completed'
	| 'worktree:created'
	| 'worktree:failed'
	| 'worktree:progress'
	| 'worktree:started';

export interface InsightEvent extends ExplorationEvent {
	data: {
		insight: Insight;
	};
}

export interface ProgressEvent extends ExplorationEvent {
	data: {
		current_stage: string;
		percentage: number;
		stages_completed: string[];
	};
	worktree_index: number;
}

export interface WorktreeEvent extends ExplorationEvent {
	data: {
		[key: string]: unknown;
		worktree: WorktreeExploration;
	};
	worktree_index: number;
}

/**
 * Global event emitter for exploration events
 */
class ExplorationEventEmitter extends EventEmitter {
	private static instance: ExplorationEventEmitter;

	private constructor() {
		super();
		this.setMaxListeners(100); // Support many concurrent listeners
	}

	static getInstance(): ExplorationEventEmitter {
		if (!ExplorationEventEmitter.instance) {
			ExplorationEventEmitter.instance = new ExplorationEventEmitter();
		}
		return ExplorationEventEmitter.instance;
	}

	/**
	 * Emit exploration created event
	 */
	emitExplorationCreated(exploration: Exploration): void {
		this.emit('exploration:created', {
			data: { exploration },
			exploration_id: exploration.id,
			timestamp: new Date().toISOString(),
			type: 'exploration:created'
		});
	}

	/**
	 * Emit exploration started event
	 */
	emitExplorationStarted(exploration: Exploration): void {
		this.emit('exploration:started', {
			data: { exploration },
			exploration_id: exploration.id,
			timestamp: new Date().toISOString(),
			type: 'exploration:started'
		});
	}

	/**
	 * Emit exploration completed event
	 */
	emitExplorationCompleted(exploration: Exploration): void {
		this.emit('exploration:completed', {
			data: { exploration },
			exploration_id: exploration.id,
			timestamp: new Date().toISOString(),
			type: 'exploration:completed'
		});
	}

	/**
	 * Emit exploration failed event
	 */
	emitExplorationFailed(exploration: Exploration, error: Error): void {
		this.emit('exploration:failed', {
			data: { error: error.message, exploration },
			exploration_id: exploration.id,
			timestamp: new Date().toISOString(),
			type: 'exploration:failed'
		});
	}

	/**
	 * Emit exploration stopped event
	 */
	emitExplorationStopped(exploration: Exploration): void {
		this.emit('exploration:stopped', {
			data: { exploration },
			exploration_id: exploration.id,
			timestamp: new Date().toISOString(),
			type: 'exploration:stopped'
		});
	}

	/**
	 * Emit worktree created event
	 */
	emitWorktreeCreated(explorationId: string, worktree: WorktreeExploration): void {
		this.emit('worktree:created', {
			data: { worktree },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'worktree:created',
			worktree_index: worktree.index
		});
	}

	/**
	 * Emit worktree started event
	 */
	emitWorktreeStarted(explorationId: string, worktree: WorktreeExploration): void {
		this.emit('worktree:started', {
			data: { worktree },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'worktree:started',
			worktree_index: worktree.index
		});
	}

	/**
	 * Emit worktree progress event
	 */
	emitWorktreeProgress(
		explorationId: string,
		worktreeIndex: number,
		percentage: number,
		currentStage: string,
		stagesCompleted: string[]
	): void {
		this.emit('worktree:progress', {
			data: {
				current_stage: currentStage,
				percentage,
				stages_completed: stagesCompleted
			},
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'worktree:progress',
			worktree_index: worktreeIndex
		});
	}

	/**
	 * Emit worktree completed event
	 */
	emitWorktreeCompleted(explorationId: string, worktree: WorktreeExploration): void {
		this.emit('worktree:completed', {
			data: { worktree },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'worktree:completed',
			worktree_index: worktree.index
		});
	}

	/**
	 * Emit worktree failed event
	 */
	emitWorktreeFailed(explorationId: string, worktree: WorktreeExploration, error: string): void {
		this.emit('worktree:failed', {
			data: { error, worktree },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'worktree:failed',
			worktree_index: worktree.index
		});
	}

	/**
	 * Emit container created event
	 */
	emitContainerCreated(explorationId: string, worktreeIndex: number, containerId: string): void {
		this.emit('container:created', {
			data: { container_id: containerId },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'container:created',
			worktree_index: worktreeIndex
		});
	}

	/**
	 * Emit container stats event
	 */
	emitContainerStats(explorationId: string, worktreeIndex: number, stats: ContainerStats): void {
		this.emit('container:stats', {
			data: { stats },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'container:stats',
			worktree_index: worktreeIndex
		});
	}

	/**
	 * Emit container stopped event
	 */
	emitContainerStopped(explorationId: string, worktreeIndex: number): void {
		this.emit('container:stopped', {
			data: {},
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'container:stopped',
			worktree_index: worktreeIndex
		});
	}

	/**
	 * Emit insight published event
	 */
	emitInsightPublished(explorationId: string, insight: Insight): void {
		this.emit('insight:published', {
			data: { insight },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'insight:published'
		});
	}

	/**
	 * Emit decision proposed event
	 */
	emitDecisionProposed(explorationId: string, decision: Decision): void {
		this.emit('decision:proposed', {
			data: { decision },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'decision:proposed'
		});
	}

	/**
	 * Emit decision voted event
	 */
	emitDecisionVoted(explorationId: string, decision: Decision, worktreeId: string): void {
		this.emit('decision:voted', {
			data: { decision, worktree_id: worktreeId },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'decision:voted'
		});
	}

	/**
	 * Emit decision resolved event
	 */
	emitDecisionResolved(explorationId: string, decision: Decision): void {
		this.emit('decision:resolved', {
			data: { decision },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'decision:resolved'
		});
	}

	/**
	 * Emit merge started event
	 */
	emitMergeStarted(explorationId: string, worktreeIndex: number, strategy: string): void {
		this.emit('merge:started', {
			data: { strategy, worktree_index: worktreeIndex },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'merge:started'
		});
	}

	/**
	 * Emit merge completed event
	 */
	emitMergeCompleted(explorationId: string, worktreeIndex: number, mergeCommit: string): void {
		this.emit('merge:completed', {
			data: { merge_commit: mergeCommit, worktree_index: worktreeIndex },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'merge:completed'
		});
	}

	/**
	 * Emit merge failed event
	 */
	emitMergeFailed(explorationId: string, worktreeIndex: number, error: string): void {
		this.emit('merge:failed', {
			data: { error, worktree_index: worktreeIndex },
			exploration_id: explorationId,
			timestamp: new Date().toISOString(),
			type: 'merge:failed'
		});
	}
}

/**
 * Get global exploration event emitter
 */
export function getExplorationEvents(): ExplorationEventEmitter {
	return ExplorationEventEmitter.getInstance();
}
