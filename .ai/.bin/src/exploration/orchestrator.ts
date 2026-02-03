/**
 * Exploration Orchestrator - Main coordinator for parallel explorations
 *
 * Coordinates the entire exploration lifecycle from initialization to cleanup
 */

import type { Exploration, ExplorationConfig, ExplorationSummary, WorktreeExploration } from 'types/exploration.types';

import { getLogger } from 'output/logger';
import * as path from 'path';

import { ContainerManager } from './container-manager';
import { createExecutionStrategy, type ExecutionContext, type ExecutionResult } from './execution-modes';
import { getExplorationEvents } from './exploration-events';
import { ExplorationStateManager } from './exploration-state';
import { ResourceAllocator } from './resource-allocator';
import { ResultComparator } from './result-comparator';
import { SafetyValidator } from './safety-validator';
import { SharedVolumeManager } from './shared-volume-manager';
import { type CreateWorktreeOptions, WorktreeManager } from './worktree-manager';

const logger = getLogger();

/**
 * Get error message from unknown error
 */
export interface OrchestratorOptions {
	config: ExplorationConfig;
	task: string;
}

export interface OrchestratorResult {
	comparison_report_path?: string;
	execution_result: ExecutionResult;
	exploration_id: string;
	success: boolean;
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
 * Main orchestrator for exploration lifecycle
 */
export class ExplorationOrchestrator {
	private containerManager: ContainerManager;
	private resourceAllocator: ResourceAllocator;
	private safetyValidator: SafetyValidator;
	private stateManager: ExplorationStateManager;
	private worktreeManager: WorktreeManager;

	constructor() {
		this.stateManager = new ExplorationStateManager();
		this.worktreeManager = new WorktreeManager();
		this.resourceAllocator = new ResourceAllocator();
		this.containerManager = new ContainerManager();
		this.safetyValidator = new SafetyValidator();
	}

	/**
	 * Start a new exploration
	 */
	async startExploration(options: OrchestratorOptions): Promise<OrchestratorResult> {
		const { config, task } = options;

		logger.info(`Starting new exploration: ${task}`);
		logger.info(`Mode: ${config.mode ?? 'parallel'}, Branches: ${config.branches}`);

		let exploration: Exploration | null = null;
		const eventEmitter = getExplorationEvents();

		try {
			// Safety validation
			logger.info('Running safety validation...');
			const validation = await this.safetyValidator.validate(config.branches);

			if (!validation.passed) {
				throw new Error(`Safety validation failed:\n${validation.errors.join('\n')}`);
			}

			logger.info('✓ Safety validation passed');

			// Create exploration state
			logger.info('Creating exploration state...');
			exploration = await this.stateManager.createExploration(task, config);
			logger.info(`✓ Exploration created: ${exploration.id}`);

			// Emit exploration created event
			eventEmitter.emitExplorationCreated(exploration);

			// Pull Docker image if needed
			logger.info('Checking Docker image...');
			const imagePulled = await this.containerManager.pullImageIfNeeded(config.docker_image);
			if (imagePulled) {
				logger.info(`✓ Docker image pulled: ${config.docker_image}`);
			} else {
				logger.info(`✓ Docker image available: ${config.docker_image}`);
			}

			// Create worktrees
			logger.info('Creating git worktrees...');
			const worktrees = await this.createWorktrees(exploration);
			exploration.worktrees = worktrees;
			await this.stateManager.saveExploration(exploration);
			logger.info(`✓ Created ${worktrees.length} worktrees`);

			// Allocate resources
			logger.info('Allocating resources...');
			this.allocateResources(exploration);
			await this.stateManager.saveExploration(exploration);
			logger.info('✓ Resources allocated');

			// Initialize shared volume
			logger.info('Initializing shared volume...');
			const sharedVolumePath = this.stateManager.getSharedVolumePath(exploration.id);
			const sharedVolumeManager = new SharedVolumeManager(sharedVolumePath, exploration.id);
			const sharedVolume = await sharedVolumeManager.initialize(exploration.branches);
			logger.info(`✓ Shared volume initialized at ${sharedVolume.root_path}`);

			// Execute exploration
			logger.info(`Executing ${config.mode ?? 'parallel'} exploration...`);

			// Emit exploration started event
			exploration.status = 'running';
			exploration.started_at = new Date().toISOString();
			await this.stateManager.saveExploration(exploration);
			eventEmitter.emitExplorationStarted(exploration);

			const executionResult = await this.executeExploration(exploration, sharedVolumeManager);
			logger.info(
				`✓ Execution completed: ${executionResult.completed_branches}/${executionResult.total_branches} succeeded`
			);

			// Generate comparison report
			logger.info('Generating comparison report...');
			const reportPath = await this.generateComparisonReport(exploration);
			logger.info(`✓ Comparison report: ${reportPath}`);

			// Cleanup containers (keep worktrees for review)
			logger.info('Cleaning up containers...');
			await this.cleanupContainers(exploration);
			logger.info('✓ Containers cleaned up');

			// Update exploration status
			exploration.status = 'completed';
			exploration.completed_at = new Date().toISOString();
			exploration.duration_ms = executionResult.duration_ms;
			await this.stateManager.saveExploration(exploration);

			// Emit exploration completed event
			eventEmitter.emitExplorationCompleted(exploration);

			// Log summary
			this.logSummary(exploration, executionResult);

			return {
				comparison_report_path: reportPath,
				execution_result: executionResult,
				exploration_id: exploration.id,
				success: executionResult.success
			};
		} catch (error) {
			logger.error(`Exploration failed: ${getErrorMessage(error)}`);

			// Emit exploration failed event
			if (exploration) {
				exploration.status = 'failed';
				exploration.completed_at = new Date().toISOString();
				await this.stateManager.saveExploration(exploration);
				eventEmitter.emitExplorationFailed(
					exploration,
					error instanceof Error ? error : new Error(getErrorMessage(error))
				);

				// Clean up on error
				try {
					await this.cleanup(exploration, true);
				} catch (cleanupError) {
					logger.error(`Cleanup failed: ${(cleanupError as Error).message}`);
				}
			}

			throw error;
		}
	}

	/**
	 * Create worktrees for exploration
	 */
	private async createWorktrees(exploration: Exploration): Promise<WorktreeExploration[]> {
		const worktrees: WorktreeExploration[] = [];
		const explorationsDir = this.stateManager.getExplorationsDir();
		const baseWorktreePath = path.join(explorationsDir, exploration.id);

		// Generate branch names
		const baseBranchName = `exploration/${exploration.id}`;

		// Create worktree options
		const worktreeOptions: CreateWorktreeOptions[] = [];
		for (let i = 1; i <= exploration.config.branches; i++) {
			const strategy = exploration.config.strategies?.[i - 1];
			const branchSuffix = strategy ? `-${strategy}` : `-${i}`;

			worktreeOptions.push({
				baseRef: 'HEAD',
				branch: `${baseBranchName}${branchSuffix}`,
				force: false,
				path: path.join(baseWorktreePath, `worktree-${i}`)
			});
		}

		// Create all worktrees in parallel
		const worktreeInfos = await this.worktreeManager.createMultipleWorktrees(worktreeOptions);

		// Build WorktreeExploration objects
		for (let i = 0; i < worktreeInfos.length; i++) {
			const info = worktreeInfos[i];
			if (!info) {
				throw new Error(`Failed to create worktree at index ${i}`);
			}

			const strategy = exploration.config.strategies?.[i];

			worktrees.push({
				branch_name: info.branch,
				index: i + 1,
				progress: {
					current_stage: 'initializing',
					errors: [],
					insights_published: 0,
					last_update: new Date().toISOString(),
					percentage: 0,
					stages_completed: []
				},
				status: 'pending',
				strategy,
				worktree_path: info.path
			});
		}

		return worktrees;
	}

	/**
	 * Allocate resources for all worktrees
	 */
	private allocateResources(exploration: Exploration): void {
		for (let i = 0; i < exploration.worktrees.length; i++) {
			const worktree = exploration.worktrees[i];
			if (!worktree) {
				throw new Error(`Worktree at index ${i} is undefined`);
			}

			const resources = this.resourceAllocator.allocate({
				cpu_limit: exploration.config.cpu_limit,
				exploration_id: exploration.id,
				memory_limit: exploration.config.memory_limit,
				worktree_index: i + 1
			});

			worktree.allocated_resources = resources;
		}
	}

	/**
	 * Execute exploration using appropriate strategy
	 */
	private async executeExploration(
		exploration: Exploration,
		sharedVolumeManager: SharedVolumeManager
	): Promise<ExecutionResult> {
		const context: ExecutionContext = {
			containerManager: this.containerManager,
			exploration,
			resourceAllocator: this.resourceAllocator,
			sharedVolumeManager,
			stateManager: this.stateManager,
			worktreeManager: this.worktreeManager
		};

		const mode = exploration.config.mode ?? 'parallel';
		const strategy = createExecutionStrategy(mode, context);

		return strategy.execute();
	}

	/**
	 * Generate comparison report
	 */
	private async generateComparisonReport(exploration: Exploration): Promise<string> {
		const comparator = new ResultComparator(exploration, this.stateManager);

		// Generate report
		await comparator.generateComparisonReport();

		// Export to both JSON and Markdown
		const explorationsDir = this.stateManager.getExplorationsDir();
		const reportDir = path.join(explorationsDir, exploration.id);

		const jsonPath = path.join(reportDir, 'comparison-report.json');
		const markdownPath = path.join(reportDir, 'comparison-report.md');

		await comparator.exportToJson(jsonPath);
		await comparator.exportToMarkdown(markdownPath);

		return markdownPath;
	}

	/**
	 * Cleanup containers
	 */
	private async cleanupContainers(exploration: Exploration): Promise<void> {
		const containerNames = exploration.worktrees
			.filter((_w) => _w.container_id)
			.map((_w, i) => `exploration-${exploration.id}-worktree-${i + 1}`);

		if (containerNames.length > 0) {
			try {
				// Stop containers
				await this.containerManager.stopMultipleContainers(containerNames, 30);

				// Remove containers
				await this.containerManager.removeMultipleContainers(containerNames, true);
			} catch (error) {
				logger.warn(`Failed to cleanup some containers: ${(error as Error).message}`);
			}
		}
	}

	/**
	 * Full cleanup (containers, worktrees, state)
	 */
	async cleanup(exploration: Exploration, force: boolean = false): Promise<void> {
		logger.info(`Cleaning up exploration ${exploration.id}...`);

		// Cleanup containers
		await this.cleanupContainers(exploration);

		// Release resources
		for (const worktree of exploration.worktrees) {
			if (worktree.allocated_resources) {
				this.resourceAllocator.release(exploration.id, worktree.index);
			}
		}

		// Remove worktrees
		for (const worktree of exploration.worktrees) {
			try {
				await this.worktreeManager.removeWorktree(worktree.worktree_path, force);
				await this.worktreeManager.deleteBranch(worktree.branch_name, force);
			} catch (error) {
				logger.warn(`Failed to remove worktree ${worktree.index}: ${(error as Error).message}`);
			}
		}

		// Delete exploration state
		if (!(exploration.config.no_cleanup ?? false) || force) {
			await this.stateManager.deleteExploration(exploration.id);
		}

		logger.info('✓ Cleanup completed');
	}

	/**
	 * Log exploration summary
	 */
	private logSummary(exploration: Exploration, result: ExecutionResult): void {
		logger.info('\n' + '='.repeat(60));
		logger.info('EXPLORATION SUMMARY');
		logger.info('='.repeat(60));
		logger.info(`ID: ${exploration.id}`);
		logger.info(`Task: ${exploration.task}`);
		logger.info(`Mode: ${exploration.mode}`);
		logger.info(`Duration: ${(result.duration_ms / 1000).toFixed(2)}s`);
		logger.info(`Completed: ${result.completed_branches}/${result.total_branches}`);

		if (result.winner_index) {
			const winner = exploration.worktrees[result.winner_index - 1];
			if (winner) {
				logger.info(`Winner: Worktree ${result.winner_index} (${winner.strategy ?? 'default'})`);
			} else {
				logger.info(`Winner: Worktree ${result.winner_index} (not found)`);
			}
		} else {
			logger.info('Winner: None (all failed)');
		}

		logger.info('='.repeat(60) + '\n');
	}

	/**
	 * Resume a stopped exploration
	 */
	async resumeExploration(explorationId: string): Promise<OrchestratorResult> {
		logger.info(`Resuming exploration: ${explorationId}`);

		const exploration = await this.stateManager.loadExploration(explorationId);

		if (exploration.status === 'completed') {
			throw new Error('Cannot resume completed exploration');
		}

		if (exploration.status === 'running') {
			throw new Error('Exploration is already running');
		}

		// Reset status
		exploration.status = 'pending';

		// Re-execute
		const sharedVolumePath = this.stateManager.getSharedVolumePath(exploration.id);
		const sharedVolumeManager = new SharedVolumeManager(sharedVolumePath, exploration.id);

		const executionResult = await this.executeExploration(exploration, sharedVolumeManager);

		const reportPath = await this.generateComparisonReport(exploration);

		return {
			comparison_report_path: reportPath,
			execution_result: executionResult,
			exploration_id: exploration.id,
			success: executionResult.success
		};
	}

	/**
	 * Stop a running exploration
	 */
	async stopExploration(explorationId: string): Promise<void> {
		logger.info(`Stopping exploration: ${explorationId}`);

		const exploration = await this.stateManager.loadExploration(explorationId);
		const eventEmitter = getExplorationEvents();

		if (exploration.status !== 'running') {
			throw new Error(`Cannot stop exploration with status: ${exploration.status}`);
		}

		// Stop all containers
		await this.cleanupContainers(exploration);

		// Update status
		exploration.status = 'stopped';
		exploration.completed_at = new Date().toISOString();
		await this.stateManager.saveExploration(exploration);

		// Emit exploration stopped event
		eventEmitter.emitExplorationStopped(exploration);

		logger.info('✓ Exploration stopped');
	}

	/**
	 * Get exploration status
	 */
	async getExplorationStatus(explorationId: string): Promise<Exploration> {
		return this.stateManager.loadExploration(explorationId);
	}

	/**
	 * List all explorations
	 */
	async listExplorations(filters?: { activeOnly?: boolean; status?: string }): Promise<ExplorationSummary[]> {
		let explorations = await this.stateManager.listExplorations();

		if (filters?.activeOnly) {
			explorations = explorations.filter((e) => e.status === 'running' || e.status === 'pending');
		}

		if (filters?.status) {
			explorations = explorations.filter((e) => e.status === filters.status);
		}

		return explorations;
	}
}

/**
 * Create and start a new exploration (convenience function)
 */
export async function startExploration(task: string, config: ExplorationConfig): Promise<OrchestratorResult> {
	const orchestrator = new ExplorationOrchestrator();
	return orchestrator.startExploration({ config, task });
}

/**
 * Stop a running exploration (convenience function)
 */
export async function stopExploration(explorationId: string): Promise<void> {
	const orchestrator = new ExplorationOrchestrator();
	await orchestrator.stopExploration(explorationId);
}

/**
 * Cleanup an exploration (convenience function)
 */
export async function cleanupExploration(explorationId: string, force: boolean = false): Promise<void> {
	const orchestrator = new ExplorationOrchestrator();
	const exploration = await orchestrator.getExplorationStatus(explorationId);
	await orchestrator.cleanup(exploration, force);
}
