/**
 * Exploration State Manager - State persistence and recovery
 *
 * Handles loading and saving exploration state to disk for recovery and tracking
 */

import type {
	Exploration,
	ExplorationConfig,
	ExplorationState,
	ExplorationSummary,
	WorktreeExploration
} from 'types/exploration.types';

import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureDir, resolveAIPath } from 'utils/file-utils';
import { generateExplorationId } from 'utils/id-generator';

/**
 * Type guard to check if error has a code property (NodeJS error)
 */
function hasErrorCode(error: unknown): error is { code: string } {
	return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Get error message from unknown error
 */
export class ExplorationStateManager {
	private explorationsDir: string;

	constructor(explorationsDir?: string) {
		this.explorationsDir = explorationsDir ?? resolveAIPath('explorations');
	}

	/**
	 * Create a new exploration
	 */
	async createExploration(task: string, config: ExplorationConfig): Promise<Exploration> {
		await ensureDir(this.explorationsDir);

		const id = generateExplorationId();
		const exploration: Exploration = {
			branches: config.branches,
			completed_branches: 0,
			config,
			created_at: new Date().toISOString(),
			id,
			mode: config.mode ?? 'parallel',
			status: 'pending',
			task,
			worktrees: []
		};

		// Create exploration directory
		const explorationDir = path.join(this.explorationsDir, id);
		await ensureDir(explorationDir);
		await ensureDir(path.join(explorationDir, 'shared'));
		await ensureDir(path.join(explorationDir, 'shared', 'locks'));

		// Save initial state
		await this.saveExploration(exploration);

		return exploration;
	}

	/**
	 * Load an exploration by ID
	 */
	async loadExploration(explorationId: string): Promise<Exploration> {
		const metadataPath = this.getMetadataPath(explorationId);

		try {
			const data = await fs.readFile(metadataPath, 'utf-8');
			return JSON.parse(data) as Exploration;
		} catch (error) {
			if (hasErrorCode(error) && error.code === 'ENOENT') {
				throw new Error(`Exploration ${explorationId} not found`);
			}
			throw new Error(`Failed to load exploration: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Save exploration to disk
	 */
	async saveExploration(exploration: Exploration): Promise<void> {
		const metadataPath = this.getMetadataPath(exploration.id);
		const data = JSON.stringify(exploration, null, 2);

		await fs.writeFile(metadataPath, data, 'utf-8');
	}

	/**
	 * Load exploration state (includes runtime information)
	 */
	async loadState(explorationId: string): Promise<ExplorationState | null> {
		const statePath = this.getStatePath(explorationId);

		try {
			const data = await fs.readFile(statePath, 'utf-8');
			return JSON.parse(data) as ExplorationState;
		} catch (error) {
			if (hasErrorCode(error) && error.code === 'ENOENT') {
				return null;
			}
			throw new Error(`Failed to load state: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Save exploration state
	 */
	async saveState(state: ExplorationState): Promise<void> {
		const statePath = this.getStatePath(state.exploration.id);
		const data = JSON.stringify(
			{
				...state,
				last_saved: new Date().toISOString()
			},
			null,
			2
		);

		await fs.writeFile(statePath, data, 'utf-8');
	}

	/**
	 * Update exploration status
	 */
	async updateStatus(
		explorationId: string,
		status: Exploration['status'],
		additionalUpdates?: Partial<Exploration>
	): Promise<void> {
		const exploration = await this.loadExploration(explorationId);

		// Build timestamp updates based on status (immutable pattern)
		const timestampUpdates: Partial<Exploration> = {};
		if (status === 'running' && !exploration.started_at) {
			timestampUpdates.started_at = new Date().toISOString();
		} else if ((status === 'completed' || status === 'failed' || status === 'stopped') && !exploration.completed_at) {
			timestampUpdates.completed_at = new Date().toISOString();
		}

		// Create updated exploration (immutable pattern)
		const updatedExploration: Exploration = {
			...exploration,
			...timestampUpdates,
			...additionalUpdates,
			status
		};

		await this.saveExploration(updatedExploration);
	}

	/**
	 * Update worktree status
	 */
	async updateWorktree(
		explorationId: string,
		worktreeIndex: number,
		updates: Partial<WorktreeExploration>
	): Promise<void> {
		const exploration = await this.loadExploration(explorationId);
		const worktreeIdx = exploration.worktrees.findIndex((wt) => wt.index === worktreeIndex);

		if (worktreeIdx === -1) {
			throw new Error(`Worktree ${worktreeIndex} not found in exploration ${explorationId}`);
		}

		// Create updated exploration with immutable worktree update
		const updatedExploration: Exploration = {
			...exploration,
			worktrees: exploration.worktrees.map((wt, idx) => (idx === worktreeIdx ? { ...wt, ...updates } : wt))
		};

		await this.saveExploration(updatedExploration);
	}

	/**
	 * List all explorations
	 */
	async listExplorations(): Promise<ExplorationSummary[]> {
		await ensureDir(this.explorationsDir);

		try {
			const entries = await fs.readdir(this.explorationsDir, { withFileTypes: true });
			const summaries: ExplorationSummary[] = [];

			for (const entry of entries) {
				if (entry.isDirectory() && entry.name.startsWith('exp-')) {
					try {
						const exploration = await this.loadExploration(entry.name);
						summaries.push(this.toSummary(exploration));
					} catch (error) {
						// Skip corrupted explorations
						console.warn(`Skipping corrupted exploration: ${entry.name}`);
					}
				}
			}

			// Sort by created date (newest first)
			return summaries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
		} catch (error) {
			throw new Error(`Failed to list explorations: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Delete an exploration
	 */
	async deleteExploration(explorationId: string): Promise<void> {
		const explorationDir = this.getExplorationDir(explorationId);

		try {
			await fs.rm(explorationDir, { force: true, recursive: true });
		} catch (error) {
			throw new Error(`Failed to delete exploration: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Check if exploration exists
	 */
	async explorationExists(explorationId: string): Promise<boolean> {
		try {
			await this.loadExploration(explorationId);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get active explorations
	 */
	async getActiveExplorations(): Promise<ExplorationSummary[]> {
		const all = await this.listExplorations();
		return all.filter((exp) => exp.status === 'running' || exp.status === 'pending');
	}

	/**
	 * Get explorations root directory
	 */
	getExplorationsDir(): string {
		return this.explorationsDir;
	}

	/**
	 * Get exploration directory path
	 */
	getExplorationDir(explorationId: string): string {
		return path.join(this.explorationsDir, explorationId);
	}

	/**
	 * Get shared volume path
	 */
	getSharedVolumePath(explorationId: string): string {
		return path.join(this.getExplorationDir(explorationId), 'shared');
	}

	/**
	 * Get insights for an exploration
	 */
	async getInsightsForExploration(explorationId: string): Promise<Array<{ chosen_option?: unknown }>> {
		try {
			const insightsPoolPath = path.join(this.getSharedVolumePath(explorationId), 'insights-pool.json');
			const data = await fs.readFile(insightsPoolPath, 'utf-8');
			const pool = JSON.parse(data) as { insights?: Array<{ chosen_option?: unknown }> };
			return pool.insights ?? [];
		} catch {
			return [];
		}
	}

	/**
	 * Get decisions for an exploration
	 */
	async getDecisionsForExploration(explorationId: string): Promise<Array<{ chosen_option?: unknown }>> {
		try {
			const decisionsPoolPath = path.join(this.getSharedVolumePath(explorationId), 'decisions-pool.json');
			const data = await fs.readFile(decisionsPoolPath, 'utf-8');
			const pool = JSON.parse(data) as { decisions?: Array<{ chosen_option?: unknown }> };
			return pool.decisions ?? [];
		} catch {
			return [];
		}
	}

	/**
	 * Get worktree data path
	 */
	getWorktreeDataPath(explorationId: string, worktreeIndex: number): string {
		return path.join(this.getSharedVolumePath(explorationId), `worktree-${worktreeIndex}`);
	}

	/**
	 * Initialize worktree data directory
	 */
	async initializeWorktreeData(explorationId: string, worktreeIndex: number): Promise<void> {
		const worktreeDataPath = this.getWorktreeDataPath(explorationId, worktreeIndex);
		await ensureDir(worktreeDataPath);

		// Create empty files
		const files = ['latest-insight.json', 'metrics.json', 'progress.json'];

		for (const file of files) {
			const filePath = path.join(worktreeDataPath, file);
			await fs.writeFile(filePath, JSON.stringify({}), 'utf-8');
		}
	}

	/**
	 * Get metadata file path
	 */
	private getMetadataPath(explorationId: string): string {
		return path.join(this.getExplorationDir(explorationId), 'metadata.json');
	}

	/**
	 * Get state file path
	 */
	private getStatePath(explorationId: string): string {
		return path.join(this.getExplorationDir(explorationId), 'state.json');
	}

	/**
	 * Convert exploration to summary
	 */
	private toSummary(exploration: Exploration): ExplorationSummary {
		const completedBranches = exploration.worktrees.filter((wt) => wt.status === 'completed').length;

		let durationMs: number | undefined;
		if (exploration.started_at) {
			const end = exploration.completed_at ? new Date(exploration.completed_at) : new Date();
			durationMs = end.getTime() - new Date(exploration.started_at).getTime();
		}

		return {
			branches: exploration.worktrees.length,
			completed_branches: completedBranches,
			created_at: exploration.created_at,
			duration_ms: durationMs,
			id: exploration.id,
			insights_count: exploration.results?.insights_collected,
			mode: exploration.mode,
			status: exploration.status,
			task: exploration.task
		};
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	return String(error);
}
