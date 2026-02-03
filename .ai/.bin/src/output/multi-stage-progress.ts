/**
 * Multi-stage progress tracking for long-running operations
 */

export interface ProgressHistory {
	averageDuration: number;
	completions: number;
	stage: string;
}

export interface StageMetadata {
	itemsProcessed?: number;
	message?: string;
	totalItems?: number;
}

export interface StageProgress {
	endTime?: number;
	error?: string;
	metadata?: StageMetadata;
	name: string;
	progress: number; // 0-100
	startTime?: number;
	status: 'completed' | 'failed' | 'pending' | 'running';
}

export class MultiStageProgressTracker {
	private history: Map<string, ProgressHistory> = new Map();
	private stages: Map<string, StageProgress> = new Map();

	/**
	 * Register a stage (optional, will be auto-registered on start)
	 */
	registerStage(name: string): void {
		if (!this.stages.has(name)) {
			this.stages.set(name, {
				name,
				progress: 0,
				status: 'pending'
			});
		}
	}

	/**
	 * Start a stage
	 */
	startStage(name: string, metadata?: StageMetadata): void {
		this.stages.set(name, {
			metadata,
			name,
			progress: 0,
			startTime: Date.now(),
			status: 'running'
		});
	}

	/**
	 * Update stage progress
	 */
	updateStage(name: string, progress: number, message?: string): void {
		const stage = this.stages.get(name);
		if (!stage) {
			throw new Error(`Stage not found: ${name}`);
		}

		stage.progress = Math.max(0, Math.min(100, progress));
		if (message) {
			stage.metadata = { ...stage.metadata, message };
		}
		this.stages.set(name, stage);
	}

	/**
	 * Complete a stage successfully
	 */
	completeStage(name: string): void {
		const stage = this.stages.get(name);
		if (!stage) {
			throw new Error(`Stage not found: ${name}`);
		}

		const endTime = Date.now();
		stage.status = 'completed';
		stage.progress = 100;
		stage.endTime = endTime;
		this.stages.set(name, stage);

		// Update history for ETA calculation
		if (stage.startTime) {
			const duration = endTime - stage.startTime;
			this.updateHistory(name, duration);
		}
	}

	/**
	 * Mark a stage as failed
	 */
	failStage(name: string, error: string): void {
		const stage = this.stages.get(name);
		if (!stage) {
			throw new Error(`Stage not found: ${name}`);
		}

		stage.status = 'failed';
		stage.error = error;
		stage.endTime = Date.now();
		this.stages.set(name, stage);
	}

	/**
	 * Get overall progress across all stages (0-100)
	 */
	getOverallProgress(): number {
		if (this.stages.size === 0) return 0;

		const totalProgress = Array.from(this.stages.values()).reduce((sum, stage) => sum + stage.progress, 0);

		return Math.floor(totalProgress / this.stages.size);
	}

	/**
	 * Get estimated time remaining in milliseconds
	 */
	getEstimatedTimeRemaining(): number {
		const remainingStages = Array.from(this.stages.values()).filter(
			(stage) => stage.status === 'pending' || stage.status === 'running'
		);

		if (remainingStages.length === 0) return 0;

		const totalEstimate = remainingStages.reduce((estimate, stage) => {
			const historyEntry = this.history.get(stage.name);

			if (!historyEntry || historyEntry.averageDuration <= 0) {
				// No history - estimate 30 seconds per stage
				return estimate + 30000;
			}

			// Stage is running - calculate remaining time based on elapsed time
			if (stage.status === 'running' && stage.startTime) {
				const elapsed = Date.now() - stage.startTime;
				const remaining = Math.max(0, historyEntry.averageDuration - elapsed);
				return estimate + remaining;
			}

			// Stage is pending - use full average
			return estimate + historyEntry.averageDuration;
		}, 0);

		return Math.floor(totalEstimate);
	}

	/**
	 * Get all stages
	 */
	getStages(): StageProgress[] {
		return Array.from(this.stages.values());
	}

	/**
	 * Get a specific stage
	 */
	getStage(name: string): StageProgress | undefined {
		return this.stages.get(name);
	}

	/**
	 * Get count of stages by status
	 */
	getStageCount(status?: StageProgress['status']): number {
		if (!status) return this.stages.size;

		return Array.from(this.stages.values()).filter((stage) => stage.status === status).length;
	}

	/**
	 * Clear all stages
	 */
	clear(): void {
		this.stages.clear();
	}

	/**
	 * Update history for a stage
	 */
	private updateHistory(stage: string, duration: number): void {
		const existing = this.history.get(stage);

		if (existing) {
			// Update running average
			const totalDuration = existing.averageDuration * existing.completions;
			const newCompletions = existing.completions + 1;
			const newAverage = (totalDuration + duration) / newCompletions;

			this.history.set(stage, {
				averageDuration: newAverage,
				completions: newCompletions,
				stage
			});
		} else {
			// First completion
			this.history.set(stage, {
				averageDuration: duration,
				completions: 1,
				stage
			});
		}
	}
}

/**
 * Singleton instance
 */
let trackerInstance: MultiStageProgressTracker | null = null;

export function getProgressTracker(): MultiStageProgressTracker {
	trackerInstance ??= new MultiStageProgressTracker();
	return trackerInstance;
}

export function setProgressTracker(tracker: MultiStageProgressTracker): void {
	trackerInstance = tracker;
}
