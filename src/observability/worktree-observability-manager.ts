import { WorktreeLogBuffer } from './worktree-log-buffer';
import { WorktreeMetricsRegistry } from './worktree-metrics-registry';

interface WorktreeState {
	logs: WorktreeLogBuffer;
	metrics: WorktreeMetricsRegistry;
}

export class WorktreeObservabilityManager {
	private readonly worktrees = new Map<string, WorktreeState>();

	activeWorktrees(): string[] {
		return [...this.worktrees.keys()];
	}

	getLogBuffer(worktreeId: string): null | WorktreeLogBuffer {
		return this.worktrees.get(worktreeId)?.logs ?? null;
	}

	getMetricsRegistry(worktreeId: string): null | WorktreeMetricsRegistry {
		return this.worktrees.get(worktreeId)?.metrics ?? null;
	}

	onComplete(worktreeId: string): void {
		this.worktrees.delete(worktreeId);
	}

	onCreate(worktreeId: string): void {
		this.worktrees.set(worktreeId, {
			logs: new WorktreeLogBuffer(),
			metrics: new WorktreeMetricsRegistry()
		});
	}

	onFailure(worktreeId: string): void {
		this.worktrees.delete(worktreeId);
	}
}

let managerInstance: null | WorktreeObservabilityManager = null;

export function getWorktreeObservabilityManager(): WorktreeObservabilityManager {
	managerInstance ??= new WorktreeObservabilityManager();
	return managerInstance;
}
