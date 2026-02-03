/**
 * Execution Modes - Parallel and sequential exploration strategies
 *
 * Coordinates execution of multiple explorations with different strategies
 */

import type { ContainerStats, Exploration, ExplorationResults, WorktreeExploration } from 'types/exploration.types';

import { getLogger } from 'output/logger';
import { formatErrorMessage } from 'utils/error-utils';

import type { ContainerConfig, ContainerManager } from './container-manager';
import type { ExplorationStateManager } from './exploration-state';
import type { ResourceAllocator } from './resource-allocator';
import type { SharedVolumeManager } from './shared-volume-manager';
import type { WorktreeManager } from './worktree-manager';

const logger = getLogger();

/**
 * Get error message from unknown error
 */
export interface ExecutionContext {
	containerManager: ContainerManager;
	exploration: Exploration;
	resourceAllocator: ResourceAllocator;
	sharedVolumeManager: SharedVolumeManager;
	stateManager: ExplorationStateManager;
	worktreeManager: WorktreeManager;
}

export interface ExecutionResult {
	completed_branches: number;
	duration_ms: number;
	exploration_id: string;
	mode: 'parallel' | 'sequential';
	results: ExplorationResults;
	success: boolean;
	total_branches: number;
	winner_index?: number;
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

/**
 * Base execution strategy
 */
export abstract class ExecutionStrategy {
	protected context: ExecutionContext;

	constructor(context: ExecutionContext) {
		this.context = context;
	}

	/**
	 * Execute the exploration strategy
	 */
	abstract execute(): Promise<ExecutionResult>;

	/**
	 * Create container configuration for a worktree
	 */
	protected createContainerConfig(worktree: WorktreeExploration, index: number): ContainerConfig {
		const { exploration } = this.context;
		const sharedVolumePath = this.context.stateManager.getSharedVolumePath(exploration.id);

		return {
			command: this.getContainerCommand(worktree),
			container_name: `exploration-${exploration.id}-worktree-${index}`,
			cpu_limit: exploration.config.cpu_limit,
			environment: {
				EXPLORATION_ID: exploration.id,
				SHARED_VOLUME: '/shared',
				STRATEGY: worktree.strategy ?? 'default',
				TASK: exploration.task,
				WORKTREE_ID: `worktree-${index}`,
				WORKTREE_INDEX: index.toString(),
				...this.getAdditionalEnvironment(worktree)
			},
			image: exploration.config.docker_image,
			memory_limit: exploration.config.memory_limit,
			port: worktree.allocated_resources?.port,
			shared_volume_path: sharedVolumePath,
			worktree_path: worktree.worktree_path
		};
	}

	/**
	 * Get additional environment variables (can be overridden)
	 */
	protected getAdditionalEnvironment(_worktree: WorktreeExploration): Record<string, string> {
		return {};
	}

	/**
	 * Get container command (can be overridden)
	 */
	protected getContainerCommand(_worktree: WorktreeExploration): string[] | undefined {
		// Default: keep container running with sleep
		// In real implementation, this would launch the AI agent
		return ['sleep', 'infinity'];
	}

	/**
	 * Monitor containers and update progress
	 */
	protected async monitorContainers(
		containerIds: string[],
		worktreeIndices: number[],
		timeoutMs: number
	): Promise<void> {
		const startTime = Date.now();
		const checkInterval = 5000; // Check every 5 seconds

		while (Date.now() - startTime < timeoutMs) {
			const shouldContinue = await this.monitorIteration(containerIds, worktreeIndices);
			if (!shouldContinue) {
				break;
			}
			await this.sleep(checkInterval);
		}

		this.checkTimeout(startTime, timeoutMs);
	}

	/**
	 * Single monitoring iteration
	 */
	private async monitorIteration(containerIds: string[], worktreeIndices: number[]): Promise<boolean> {
		try {
			const containerNames = this.buildContainerNames(containerIds, worktreeIndices);
			const stats = await this.context.containerManager.getMultipleContainerStats(containerNames, worktreeIndices);

			this.updateWorktreeStats(stats, worktreeIndices);
			await this.context.stateManager.saveExploration(this.context.exploration);

			return !this.allContainersExited(stats);
		} catch (error) {
			this.handleMonitoringError(error);
			return true; // Continue monitoring despite errors
		}
	}

	/**
	 * Build container names from IDs and indices
	 */
	private buildContainerNames(containerIds: string[], worktreeIndices: number[]): string[] {
		return containerIds.map(
			(_id, idx) => `exploration-${this.context.exploration.id}-worktree-${worktreeIndices[idx]}`
		);
	}

	/**
	 * Update worktree statistics
	 */
	private updateWorktreeStats(stats: Array<ContainerStats | null>, worktreeIndices: number[]): void {
		for (let i = 0; i < stats.length; i++) {
			const stat = stats[i];
			if (!stat) continue;

			const worktreeIndex = worktreeIndices[i];
			if (worktreeIndex === undefined) continue;

			const worktree = this.context.exploration.worktrees[worktreeIndex - 1];
			if (!worktree) continue;

			worktree.container_stats = stat;
			this.updateWorktreeStatus(worktree, stat);
		}
	}

	/**
	 * Update worktree status based on container stats
	 */
	private updateWorktreeStatus(worktree: WorktreeExploration, stat: ContainerStats): void {
		if (stat.status === 'exited') {
			worktree.status = stat.exit_code === 0 ? 'completed' : 'failed';
		}
	}

	/**
	 * Check if all containers have exited
	 */
	private allContainersExited(stats: Array<ContainerStats | null>): boolean {
		const allDone = stats.every((s) => s?.status === 'exited');
		if (allDone) {
			logger.info('All containers have exited');
		}
		return allDone;
	}

	/**
	 * Handle monitoring errors
	 */
	private handleMonitoringError(error: unknown): void {
		logger.error(`Error monitoring containers: ${formatErrorMessage(error)}`);
	}

	/**
	 * Check if timeout was reached
	 */
	private checkTimeout(startTime: number, timeoutMs: number): void {
		if (Date.now() - startTime >= timeoutMs) {
			logger.warn(`Exploration timeout reached (${timeoutMs}ms)`);
		}
	}

	/**
	 * Collect results from all worktrees
	 */
	protected async collectResults(): Promise<ExplorationResults> {
		const { exploration } = this.context;
		const insights = await this.context.stateManager.getInsightsForExploration(exploration.id);
		const decisions = await this.context.stateManager.getDecisionsForExploration(exploration.id);

		// Determine winner (simple heuristic: first completed)
		let winnerIndex: number | undefined;
		for (let i = 0; i < exploration.worktrees.length; i++) {
			const worktree = exploration.worktrees[i];
			if (!worktree) continue;

			if (worktree.status === 'completed') {
				winnerIndex = i + 1;
				break;
			}
		}

		return {
			comparison_report: this.generateComparisonReport(),
			decisions_made: this.countResolvedDecisions(decisions),
			insights_collected: insights.length,
			winner: winnerIndex
		};
	}

	/**
	 * Count decisions with chosen options
	 */
	private countResolvedDecisions(decisions: Array<{ chosen_option?: unknown }>): number {
		return decisions.filter((d) => d.chosen_option !== undefined).length;
	}

	/**
	 * Generate comparison report
	 */
	protected generateComparisonReport(): string {
		const { exploration } = this.context;
		let report = `# Exploration Results: ${exploration.id}\n\n`;
		report += `Task: ${exploration.task}\n`;
		report += `Mode: ${exploration.mode}\n\n`;

		report += `## Worktree Results\n\n`;
		for (let i = 0; i < exploration.worktrees.length; i++) {
			const worktree = exploration.worktrees[i];
			if (!worktree) continue;

			report += `### Worktree ${i + 1}: ${worktree.strategy ?? 'default'}\n`;
			report += `- Status: ${worktree.status}\n`;
			report += `- Progress: ${worktree.progress.percentage}%\n`;

			if (worktree.container_stats) {
				report += `- CPU Usage: ${worktree.container_stats.cpu_usage_percent.toFixed(2)}%\n`;
				report += `- Memory Usage: ${worktree.container_stats.memory_usage_mb.toFixed(2)} MB\n`;
				report += `- Uptime: ${worktree.container_stats.uptime_seconds}s\n`;
			}

			if (worktree.progress.errors.length > 0) {
				report += `- Errors: ${worktree.progress.errors.length}\n`;
			}

			report += '\n';
		}

		return report;
	}

	/**
	 * Sleep helper
	 */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Parallel execution strategy - run all explorations simultaneously
 */
export class ParallelExecutionStrategy extends ExecutionStrategy {
	async execute(): Promise<ExecutionResult> {
		const startTime = Date.now();
		const { exploration } = this.context;

		logger.info(`Starting parallel execution for ${exploration.worktrees.length} worktrees`);

		try {
			// Update exploration status
			exploration.status = 'running';
			exploration.started_at = new Date().toISOString();
			await this.context.stateManager.saveExploration(exploration);

			// Create container configs for all worktrees
			const containerConfigs: ContainerConfig[] = exploration.worktrees.map((worktree, index) =>
				this.createContainerConfig(worktree, index + 1)
			);

			// Start all containers in parallel
			logger.info('Starting all containers in parallel...');
			const containerIds = await this.context.containerManager.createMultipleContainers(containerConfigs);

			// Update worktrees with container IDs
			for (let i = 0; i < containerIds.length; i++) {
				const worktree = exploration.worktrees[i];
				if (!worktree) continue;

				const containerId = containerIds[i];
				if (!containerId) continue;

				worktree.container_id = containerId;
				worktree.status = 'running';
			}
			await this.context.stateManager.saveExploration(exploration);

			// Monitor containers until completion or timeout
			const timeoutMs = exploration.config.timeout_minutes * 60 * 1000;
			await this.monitorContainers(
				containerIds,
				exploration.worktrees.map((_, i) => i + 1),
				timeoutMs
			);

			// Stop all containers
			logger.info('Stopping all containers...');
			const containerNames = containerIds.map((_id, idx) => `exploration-${exploration.id}-worktree-${idx + 1}`);
			await this.context.containerManager.stopMultipleContainers(containerNames, 30);

			// Collect results
			const results = await this.collectResults();

			// Update exploration status
			exploration.status = 'completed';
			exploration.completed_at = new Date().toISOString();
			exploration.duration_ms = Date.now() - startTime;
			exploration.results = results;
			exploration.completed_branches = exploration.worktrees.filter((w) => w.status === 'completed').length;

			await this.context.stateManager.saveExploration(exploration);

			logger.info(`Parallel execution completed: ${exploration.completed_branches}/${exploration.branches} succeeded`);

			return {
				completed_branches: exploration.completed_branches,
				duration_ms: exploration.duration_ms,
				exploration_id: exploration.id,
				mode: 'parallel',
				results,
				success: exploration.completed_branches > 0,
				total_branches: exploration.branches,
				winner_index: results.winner
			};
		} catch (error) {
			logger.error(`Parallel execution failed: ${getErrorMessage(error)}`);

			// Update exploration status
			exploration.status = 'failed';
			exploration.completed_at = new Date().toISOString();
			exploration.duration_ms = Date.now() - startTime;
			await this.context.stateManager.saveExploration(exploration);

			throw error;
		}
	}
}

/**
 * Sequential execution strategy - try one approach at a time until one succeeds
 */
export class SequentialExecutionStrategy extends ExecutionStrategy {
	async execute(): Promise<ExecutionResult> {
		const startTime = Date.now();
		const { exploration } = this.context;

		logger.info(`Starting sequential execution for ${exploration.worktrees.length} worktrees`);

		try {
			// Update exploration status
			exploration.status = 'running';
			exploration.started_at = new Date().toISOString();
			await this.context.stateManager.saveExploration(exploration);

			let winnerIndex: number | undefined;

			// Try each worktree sequentially
			for (let i = 0; i < exploration.worktrees.length; i++) {
				const worktree = exploration.worktrees[i];
				if (!worktree) continue;

				const worktreeIndex = i + 1;

				logger.info(`Trying worktree ${worktreeIndex}: ${worktree.strategy ?? 'default'}`);

				// Create container config
				const containerConfig = this.createContainerConfig(worktree, worktreeIndex);

				// Start container
				const containerId = await this.context.containerManager.createContainer(containerConfig);
				worktree.container_id = containerId;
				worktree.status = 'running';
				await this.context.stateManager.saveExploration(exploration);

				// Monitor this container
				const timeoutMs = exploration.config.timeout_minutes * 60 * 1000;
				await this.monitorContainers([containerId], [worktreeIndex], timeoutMs);

				// Stop container
				const containerName = `exploration-${exploration.id}-worktree-${worktreeIndex}`;
				await this.context.containerManager.stopContainer(containerName, 30);

				// Reload exploration to get updated status (monitorContainers updates it)
				const updatedExploration = await this.context.stateManager.loadExploration(exploration.id);
				const updatedWorktree = updatedExploration.worktrees[i];
				if (!updatedWorktree) {
					logger.error(`Failed to load updated worktree ${worktreeIndex}`);
					continue;
				}

				// Check if this worktree succeeded
				if (updatedWorktree.status === 'completed') {
					logger.info(`Worktree ${worktreeIndex} succeeded!`);
					worktree.status = 'completed'; // Update local reference
					winnerIndex = worktreeIndex;
					break; // Stop trying other approaches
				} else {
					logger.warn(`Worktree ${worktreeIndex} failed, trying next approach`);
					worktree.status = updatedWorktree.status; // Update local reference
				}
			}

			// Collect results
			const results = await this.collectResults();
			results.winner = winnerIndex;

			// Update exploration status
			exploration.status = winnerIndex !== undefined ? 'completed' : 'failed';
			exploration.completed_at = new Date().toISOString();
			exploration.duration_ms = Date.now() - startTime;
			exploration.results = results;
			exploration.completed_branches = winnerIndex !== undefined ? 1 : 0;

			await this.context.stateManager.saveExploration(exploration);

			logger.info(
				`Sequential execution ${winnerIndex !== undefined ? 'completed' : 'failed'}: ${exploration.completed_branches}/${exploration.branches} succeeded`
			);

			return {
				completed_branches: exploration.completed_branches,
				duration_ms: exploration.duration_ms,
				exploration_id: exploration.id,
				mode: 'sequential',
				results,
				success: winnerIndex !== undefined,
				total_branches: exploration.branches,
				winner_index: winnerIndex
			};
		} catch (error) {
			logger.error(`Sequential execution failed: ${getErrorMessage(error)}`);

			// Update exploration status
			exploration.status = 'failed';
			exploration.completed_at = new Date().toISOString();
			exploration.duration_ms = Date.now() - startTime;
			await this.context.stateManager.saveExploration(exploration);

			throw error;
		}
	}
}

/**
 * Create execution strategy based on mode
 */
export function createExecutionStrategy(mode: 'parallel' | 'sequential', context: ExecutionContext): ExecutionStrategy {
	const strategyFactories: Record<typeof mode, () => ExecutionStrategy> = {
		parallel: () => new ParallelExecutionStrategy(context),
		sequential: () => new SequentialExecutionStrategy(context)
	};

	const factory = strategyFactories[mode];
	if (!factory) {
		throw new Error(`Unknown execution mode: ${mode}`);
	}

	return factory();
}
