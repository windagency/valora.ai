/**
 * Worktree Stats Tracker - Event-driven worktree usage statistics
 *
 * Subscribes to ExplorationEventEmitter and accumulates stats for session tracking
 */

import type { WorktreeExploration } from 'types/exploration.types';
import type { WorktreeSessionSummary, WorktreeUsageStats } from 'types/session.types';

import { getExplorationEvents, type WorktreeEvent } from 'exploration/exploration-events';

export class WorktreeStatsTracker {
	private activeWorktrees = new Map<number, { explorationId: string; startedAt: string }>();
	private explorationIds = new Set<string>();
	private listeners: Array<{ event: string; handler: (event: WorktreeEvent) => void }> = [];
	private maxConcurrent = 0;
	private totalCreated = 0;
	private totalDurationMs = 0;
	private worktreeSummaries: WorktreeSessionSummary[] = [];

	/**
	 * Subscribe to exploration events
	 */
	subscribe(): void {
		const events = getExplorationEvents();

		const onCreated = (event: WorktreeEvent): void => {
			this.handleWorktreeCreated(event);
		};
		const onStarted = (event: WorktreeEvent): void => {
			this.handleWorktreeStarted(event);
		};
		const onCompleted = (event: WorktreeEvent): void => {
			this.handleWorktreeCompleted(event);
		};
		const onFailed = (event: WorktreeEvent): void => {
			this.handleWorktreeFailed(event);
		};

		events.on('worktree:created', onCreated);
		events.on('worktree:started', onStarted);
		events.on('worktree:completed', onCompleted);
		events.on('worktree:failed', onFailed);

		this.listeners = [
			{ event: 'worktree:created', handler: onCreated },
			{ event: 'worktree:started', handler: onStarted },
			{ event: 'worktree:completed', handler: onCompleted },
			{ event: 'worktree:failed', handler: onFailed }
		];
	}

	/**
	 * Unsubscribe from all exploration events
	 */
	unsubscribe(): void {
		const events = getExplorationEvents();
		for (const { event, handler } of this.listeners) {
			events.removeListener(event, handler);
		}
		this.listeners = [];
	}

	/**
	 * Get current worktree usage statistics snapshot
	 */
	getStats(): WorktreeUsageStats {
		return {
			exploration_ids: [...this.explorationIds],
			max_concurrent: this.maxConcurrent,
			total_created: this.totalCreated,
			total_duration_ms: this.totalDurationMs,
			worktree_summaries: [...this.worktreeSummaries]
		};
	}

	private findSummary(event: WorktreeEvent): undefined | WorktreeSessionSummary {
		const worktree = event.data.worktree as WorktreeExploration;
		return this.worktreeSummaries.find(
			(s) => s.exploration_id === event.exploration_id && s.branch_name === worktree.branch_name
		);
	}

	private finishWorktree(event: WorktreeEvent, status: string): void {
		const active = this.activeWorktrees.get(event.worktree_index);
		if (active) {
			const durationMs = new Date(event.timestamp).getTime() - new Date(active.startedAt).getTime();
			this.totalDurationMs += durationMs;
			this.activeWorktrees.delete(event.worktree_index);

			// Update summary
			const summary = this.findSummary(event);
			if (summary) {
				summary.completed_at = event.timestamp;
				summary.duration_ms = durationMs;
				summary.status = status;
			}
		}
	}

	private handleWorktreeCompleted(event: WorktreeEvent): void {
		this.finishWorktree(event, 'completed');
	}

	private handleWorktreeCreated(event: WorktreeEvent): void {
		const worktree = event.data.worktree as WorktreeExploration;
		this.totalCreated++;
		this.explorationIds.add(event.exploration_id);

		this.worktreeSummaries.push({
			branch_name: worktree.branch_name,
			created_at: event.timestamp,
			exploration_id: event.exploration_id,
			status: 'created'
		});
	}

	private handleWorktreeFailed(event: WorktreeEvent): void {
		this.finishWorktree(event, 'failed');
	}

	private handleWorktreeStarted(event: WorktreeEvent): void {
		this.activeWorktrees.set(event.worktree_index, {
			explorationId: event.exploration_id,
			startedAt: event.timestamp
		});

		if (this.activeWorktrees.size > this.maxConcurrent) {
			this.maxConcurrent = this.activeWorktrees.size;
		}

		// Update summary status
		const summary = this.findSummary(event);
		if (summary) {
			summary.status = 'running';
		}
	}
}
