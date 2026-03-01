/**
 * Explore command - Multi-agent parallel exploration
 *
 * Enables multiple AI agents to explore different solution approaches simultaneously
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { ExplorationConfig } from 'types/exploration.types';

import { CollaborationCoordinator } from 'exploration/collaboration-coordinator';
import { ExplorationStateManager } from 'exploration/exploration-state';
import { MergeOrchestrator, type MergeStrategy } from 'exploration/merge-orchestrator';
import { ExplorationOrchestrator } from 'exploration/orchestrator';
import { ResultComparator } from 'exploration/result-comparator';
import { SafetyValidator } from 'exploration/safety-validator';
import { WorktreeManager } from 'exploration/worktree-manager';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { getSpinnerAdapter } from 'ui/spinner-adapter.interface';
import { formatError } from 'utils/error-handler';

const prompt = getPromptAdapter();
const spinner = getSpinnerAdapter();

/**
 * Valid color names for status display
 */
type StatusColor = 'cyan' | 'green' | 'red' | 'yellow';

/**
 * Get color function for status
 */
function getStatusColor(status: string): StatusColor {
	if (status === 'completed') return 'green';
	if (status === 'running') return 'cyan';
	if (status === 'failed') return 'red';
	return 'yellow';
}

/**
 * Get icon for status
 */
function getStatusIcon(status: string): string {
	if (status === 'completed') return '✓';
	if (status === 'running') return '▶';
	if (status === 'failed') return '✗';
	return '○';
}

/**
 * Parse and validate exploration task
 */
function validateTask(task: string): void {
	const color = getColorAdapter();
	if (!task || task.trim() === '') {
		console.error(color.red('Error: Task description is required'));
		process.exit(1);
	}
}

/**
 * Parse and validate branches count
 */
function parseBranches(branchesStr: string): number {
	const color = getColorAdapter();
	const branches = parseInt(branchesStr, 10);
	if (isNaN(branches) || branches < 1 || branches > 10) {
		console.error(color.red('Error: Branches must be between 1 and 10'));
		process.exit(1);
	}
	return branches;
}

/**
 * Parse and validate strategies
 */
function parseStrategies(strategiesStr: string | undefined, branches: number): string[] | undefined {
	const color = getColorAdapter();
	if (!strategiesStr) return undefined;

	const strategies = strategiesStr.split(',').map((s) => s.trim());
	if (strategies.length !== branches) {
		console.error(color.red(`Error: Number of strategies (${strategies.length}) must match branches (${branches})`));
		process.exit(1);
	}
	return strategies;
}

/**
 * Run safety validation
 */
async function runSafetyValidation(branches: number): Promise<void> {
	const color = getColorAdapter();
	const loading = spinner.create('Running safety checks...').start();
	const validator = new SafetyValidator();
	const validation = await validator.validate(branches);

	if (!validation.passed) {
		loading.fail(color.red('Safety checks failed'));
		console.log(color.red('\nErrors:'));
		validation.errors.forEach((error) => console.log(color.red(`  • ${error}`)));
		process.exit(1);
	}

	loading.succeed(color.green('Safety checks passed'));
}

/**
 * Display exploration configuration
 */
function displayExplorationConfig(
	task: string,
	branches: number,
	strategies: string[] | undefined,
	config: ExplorationConfig
): void {
	const color = getColorAdapter();
	console.log(color.cyan('\n📋 Exploration Configuration:'));
	console.log(color.gray(`  Task: ${task}`));
	console.log(color.gray(`  Branches: ${branches}`));
	console.log(color.gray(`  Strategies: ${strategies?.join(', ') ?? 'auto'}`));
	console.log(color.gray(`  Docker Image: ${config.docker_image}`));
	console.log(color.gray(`  Resources: ${config.cpu_limit} CPU, ${config.memory_limit} RAM`));
}

/**
 * Display exploration results
 */
function displayExplorationResults(result: {
	comparison_report_path?: string;
	execution_result: {
		completed_branches: number;
		duration_ms: number;
		mode: string;
		total_branches: number;
		winner_index?: number;
	};
	exploration_id: string;
}): void {
	const color = getColorAdapter();
	console.log(color.getRawFn('cyan.bold')('\n📊 Exploration Results\n'));
	console.log(color.gray(`Exploration ID: ${result.exploration_id}`));
	console.log(color.gray(`Mode: ${result.execution_result.mode}`));
	console.log(
		color.gray(
			`Completed: ${result.execution_result.completed_branches}/${result.execution_result.total_branches} branches`
		)
	);
	console.log(color.gray(`Duration: ${(result.execution_result.duration_ms / 1000).toFixed(2)}s`));

	if (result.execution_result.winner_index) {
		console.log(color.green(`\n✓ Winner: Worktree ${result.execution_result.winner_index}`));
	} else {
		console.log(color.yellow('\n⚠️  No successful worktree found'));
	}

	if (result.comparison_report_path) {
		console.log(color.gray(`\nComparison report: ${result.comparison_report_path}`));
	}
}

/**
 * Display next steps after exploration
 */
function displayNextSteps(result: {
	comparison_report_path?: string;
	execution_result: { winner_index?: number };
	exploration_id: string;
}): void {
	const color = getColorAdapter();
	console.log(color.cyan('\n📋 Next Steps:'));
	console.log(color.gray(`  • Review results: valora explore status ${result.exploration_id}`));
	if (result.comparison_report_path) {
		console.log(color.gray(`  • View comparison: cat ${result.comparison_report_path}`));
	}
	if (result.execution_result.winner_index) {
		console.log(
			color.gray(
				`  • Merge winner: valora explore merge ${result.exploration_id} ${result.execution_result.winner_index}`
			)
		);
	}
	console.log(color.gray(`  • Cleanup: valora explore cleanup ${result.exploration_id}\n`));
}

/**
 * Exploration summary type
 */
interface ExplorationSummary {
	branches: number;
	completed_branches: number;
	created_at: string;
	duration_ms?: number;
	id: string;
	insights_count?: number;
	mode: string;
	status: string;
	task: string;
}

/**
 * Filter explorations based on options
 */
function filterExplorations(explorations: ExplorationSummary[], options: ExploreListOptions): ExplorationSummary[] {
	let filtered = explorations;

	if (options.activeOnly) {
		filtered = filtered.filter((exp) => exp.status === 'running' || exp.status === 'pending');
	}

	if (options.status) {
		filtered = filtered.filter((exp) => exp.status === options.status);
	}

	return filtered;
}

/**
 * Display single exploration summary
 */
function displayExplorationSummary(exp: ExplorationSummary): void {
	const color = getColorAdapter();
	const statusColor = getStatusColor(exp.status);
	const statusIcon = getStatusIcon(exp.status);

	console.log(color.bold(`${statusIcon} ${exp.id}`));
	console.log(color.gray(`  Task: ${exp.task}`));
	console.log(color.getColorFn(statusColor)(`  Status: ${exp.status}`));
	console.log(color.gray(`  Mode: ${exp.mode}`));
	console.log(color.gray(`  Branches: ${exp.completed_branches}/${exp.branches}`));
	console.log(color.gray(`  Created: ${new Date(exp.created_at).toLocaleString()}`));

	if (exp.duration_ms) {
		const minutes = Math.floor(exp.duration_ms / 60000);
		const seconds = Math.floor((exp.duration_ms % 60000) / 1000);
		console.log(color.gray(`  Duration: ${minutes}m ${seconds}s`));
	}

	if (exp.insights_count) {
		console.log(color.gray(`  Insights: ${exp.insights_count}`));
	}

	console.log('');
}

/**
 * Worktree status type
 */
interface WorktreeStatus {
	branch_name: string;
	container_id?: string;
	index: number;
	progress: {
		current_stage: string;
		percentage: number;
	};
	status: string;
	strategy?: string;
	worktree_path: string;
}

/**
 * Display single worktree status
 */
function displayWorktreeStatus(worktree: WorktreeStatus): void {
	const color = getColorAdapter();
	const statusColor = getStatusColor(worktree.status);

	console.log(
		color.getColorFn(statusColor)(`  [${worktree.index}] ${worktree.strategy ?? 'default'} - ${worktree.status}`)
	);
	console.log(color.gray(`      Path: ${worktree.worktree_path}`));
	console.log(color.gray(`      Branch: ${worktree.branch_name}`));
	console.log(color.gray(`      Progress: ${worktree.progress.percentage}% (${worktree.progress.current_stage})`));

	if (worktree.container_id) {
		console.log(color.gray(`      Container: ${worktree.container_id.substring(0, 12)}`));
	}
}

/**
 * Exploration detail type
 */
interface ExplorationDetail {
	completed_at?: string;
	created_at: string;
	mode: string;
	results?: {
		decisions_made: number;
		insights_collected: number;
		winner?: number;
	};
	started_at?: string;
	status: string;
	task: string;
	worktrees: WorktreeStatus[];
}

/**
 * Display exploration basic info
 */
function displayExplorationBasicInfo(exploration: ExplorationDetail): void {
	const color = getColorAdapter();
	console.log(color.bold('Basic Information:'));
	console.log(color.gray(`  Task: ${exploration.task}`));
	console.log(color.gray(`  Status: ${exploration.status}`));
	console.log(color.gray(`  Mode: ${exploration.mode}`));
	console.log(color.gray(`  Created: ${new Date(exploration.created_at).toLocaleString()}`));

	if (exploration.started_at) {
		console.log(color.gray(`  Started: ${new Date(exploration.started_at).toLocaleString()}`));
	}
	if (exploration.completed_at) {
		console.log(color.gray(`  Completed: ${new Date(exploration.completed_at).toLocaleString()}`));
	}
}

/**
 * Display exploration results
 */
function displayExplorationDetailsResults(results: {
	decisions_made: number;
	insights_collected: number;
	winner?: number;
}): void {
	const color = getColorAdapter();
	console.log(color.bold('\nResults:'));
	console.log(color.gray(`  Insights Collected: ${results.insights_collected}`));
	console.log(color.gray(`  Decisions Made: ${results.decisions_made}`));
	if (results.winner !== undefined) {
		console.log(color.green(`  Winner: Worktree ${results.winner}`));
	}
}

/**
 * Display collaboration stats
 */
async function displayCollaborationStats(explorationId: string, stateManager: ExplorationStateManager): Promise<void> {
	const color = getColorAdapter();
	const sharedVolumePath = stateManager.getSharedVolumePath(explorationId);
	const coordinator = new CollaborationCoordinator(
		`${sharedVolumePath}/insights-pool.json`,
		`${sharedVolumePath}/decisions-pool.json`,
		explorationId
	);

	try {
		const stats = await coordinator.getStats();
		console.log(color.bold('\nCollaboration:'));
		console.log(color.gray(`  Total Insights: ${stats.total_insights}`));
		console.log(color.gray(`  Pending Decisions: ${stats.pending_decisions}`));
		console.log(color.gray(`  Resolved Decisions: ${stats.resolved_decisions}`));
	} catch {
		// Ignore if shared volume doesn't exist yet
	}
}

/**
 * Handle merge preview mode
 */
async function handleMergePreview(
	mergeOrchestrator: MergeOrchestrator,
	explorationId: string,
	worktreeIndex: number,
	targetBranch?: string
): Promise<void> {
	const color = getColorAdapter();
	const loading = spinner.create('Previewing merge...').start();

	try {
		const preview = await mergeOrchestrator.previewMerge(explorationId, worktreeIndex, targetBranch);

		loading.succeed(color.green('Preview complete'));

		console.log(color.bold('\n📋 Merge Preview:\n'));
		console.log(color.gray(`Can merge: ${preview.can_merge ? color.green('Yes') : color.red('No')}`));
		console.log(color.gray(`Commits to merge: ${preview.commits_to_merge}`));
		console.log(color.gray(`Files changed: ${preview.files_changed}`));

		if (preview.conflicts.length > 0) {
			console.log(color.red(`\n⚠️  Conflicts detected: ${preview.conflicts.length}\n`));
			for (const conflict of preview.conflicts) {
				console.log(color.yellow(`  • ${conflict.file_path} (${conflict.conflict_type})`));
			}
			console.log(color.yellow('\nUse --auto-resolve-conflicts to attempt automatic resolution\n'));
		} else {
			console.log(color.green('\n✓ No conflicts detected\n'));
		}
	} catch (error) {
		loading.fail(color.red('Preview failed'));
		throw error;
	}
}

/**
 * Validate merge strategy
 */
function validateMergeStrategy(strategy: string): void {
	const color = getColorAdapter();
	if (!['direct', 'rebase', 'squash'].includes(strategy)) {
		console.error(color.red(`Error: Invalid strategy '${strategy}'. Must be: direct, squash, or rebase`));
		process.exit(1);
	}
}

/**
 * Merge result type
 */
interface MergeResult {
	backup_branch?: string;
	commits_merged?: number;
	conflicts?: Array<{ conflict_type: string; file_path: string }>;
	conflicts_detected?: boolean;
	error?: string;
	files_changed?: number;
	merge_commit?: string;
	pr_url?: string;
	source_branch?: string;
	strategy?: string;
	success: boolean;
	target_branch?: string;
}

/**
 * Display successful merge results
 */
function displayMergeSuccess(result: MergeResult): void {
	const color = getColorAdapter();
	console.log(color.bold('\n📊 Merge Results:\n'));
	console.log(color.gray(`Strategy: ${result.strategy}`));
	console.log(color.gray(`Source: ${result.source_branch}`));
	console.log(color.gray(`Target: ${result.target_branch}`));

	if (result.backup_branch) {
		console.log(color.gray(`Backup: ${result.backup_branch}`));
	}

	if (result.merge_commit) {
		console.log(color.gray(`Merge commit: ${result.merge_commit.substring(0, 8)}`));
	}

	if (result.commits_merged) {
		console.log(color.gray(`Commits merged: ${result.commits_merged}`));
	}

	if (result.files_changed) {
		console.log(color.gray(`Files changed: ${result.files_changed}`));
	}

	if (result.pr_url) {
		console.log(color.cyan(`\n📋 Pull request: ${result.pr_url}`));
	}

	console.log(color.green('\n✓ Exploration successfully merged!\n'));
}

/**
 * Display merge failure
 */
function displayMergeFailure(result: MergeResult): void {
	const color = getColorAdapter();
	console.log(color.bold('\n❌ Merge Failed:\n'));
	console.log(color.red(`Error: ${result.error}`));

	if (result.conflicts_detected && result.conflicts) {
		console.log(color.yellow(`\n⚠️  Conflicts detected: ${result.conflicts.length}\n`));
		for (const conflict of result.conflicts) {
			console.log(color.yellow(`  • ${conflict.file_path} (${conflict.conflict_type})`));
		}
		console.log(color.gray('\nResolve conflicts manually or use --auto-resolve-conflicts\n'));
	}
}

/**
 * Clean up single exploration
 */
async function cleanupSingleExploration(
	explorationId: string,
	stateManager: ExplorationStateManager,
	worktreeManager: WorktreeManager,
	dryRun: boolean
): Promise<void> {
	const color = getColorAdapter();
	const loading = spinner.create(`Cleaning up exploration ${explorationId}...`).start();
	const exploration = await stateManager.loadExploration(explorationId);

	if (dryRun) {
		loading.info(color.cyan('Dry run - would remove:'));
		console.log(color.gray(`  Exploration: ${explorationId}`));
		console.log(color.gray(`  Worktrees: ${exploration.worktrees.length}`));
		console.log(color.gray(`  Shared volume: ${stateManager.getSharedVolumePath(explorationId)}`));
		return;
	}

	// Remove worktrees
	for (const worktree of exploration.worktrees) {
		try {
			await worktreeManager.removeWorktree(worktree.worktree_path, true);
			await worktreeManager.deleteBranch(worktree.branch_name, true);
		} catch (error) {
			loading.warn(color.yellow(`Failed to remove worktree ${worktree.index}: ${(error as Error).message}`));
		}
	}

	// Delete exploration
	await stateManager.deleteExploration(explorationId);
	loading.succeed(color.green(`Exploration ${explorationId} cleaned up`));
}

/**
 * Filter explorations for cleanup
 */
function filterExplorationsForCleanup(
	explorations: ExplorationSummary[],
	options: { failedOnly?: boolean; olderThan?: string }
): ExplorationSummary[] {
	let toClean = explorations;

	if (options.failedOnly) {
		toClean = toClean.filter((exp) => exp.status === 'failed');
	}

	if (options.olderThan) {
		const hours = parseInt(options.olderThan, 10);
		const cutoff = Date.now() - hours * 60 * 60 * 1000;
		toClean = toClean.filter((exp) => new Date(exp.created_at).getTime() < cutoff);
	}

	return toClean;
}

/**
 * Clean up multiple explorations
 */
async function cleanupMultipleExplorations(
	explorations: ExplorationSummary[],
	stateManager: ExplorationStateManager,
	worktreeManager: WorktreeManager
): Promise<number> {
	const color = getColorAdapter();
	let cleaned = 0;

	for (const exp of explorations) {
		try {
			const exploration = await stateManager.loadExploration(exp.id);

			// Remove worktrees
			for (const worktree of exploration.worktrees) {
				try {
					await worktreeManager.removeWorktree(worktree.worktree_path, true);
					await worktreeManager.deleteBranch(worktree.branch_name, true);
				} catch {
					// Ignore errors
				}
			}

			// Delete exploration
			await stateManager.deleteExploration(exp.id);
			cleaned++;
		} catch (error) {
			console.error(color.red(`Failed to clean ${exp.id}: ${(error as Error).message}`));
		}
	}

	return cleaned;
}

/**
 * Handle bulk cleanup with confirmation
 */
async function handleBulkCleanup(
	stateManager: ExplorationStateManager,
	worktreeManager: WorktreeManager,
	options: { dryRun?: boolean; failedOnly?: boolean; olderThan?: string }
): Promise<void> {
	const color = getColorAdapter();
	const explorations = await stateManager.listExplorations();
	const toClean = filterExplorationsForCleanup(explorations, options);

	if (toClean.length === 0) {
		console.log(color.yellow('\nNo explorations to clean up\n'));
		return;
	}

	console.log(color.cyan(`\n🗑️  Found ${toClean.length} exploration(s) to clean up\n`));

	if (options.dryRun) {
		for (const exp of toClean) {
			console.log(color.gray(`  • ${exp.id} (${exp.status})`));
		}
		console.log(color.cyan('\n(Dry run - no changes made)\n'));
		return;
	}

	// Confirm
	const answer = await prompt.prompt<{ confirm: boolean }>([
		{
			default: false,
			message: `Remove ${toClean.length} exploration(s)?`,
			name: 'confirm',
			type: 'confirm'
		}
	]);

	if (!answer.confirm) {
		console.log(color.yellow('\nCleanup cancelled\n'));
		return;
	}

	const cleaned = await cleanupMultipleExplorations(toClean, stateManager, worktreeManager);
	console.log(color.green(`\n✓ Cleaned up ${cleaned} exploration(s)\n`));
}

/**
 * CLI options for explore parallel/sequential commands
 */
interface ExploreTaskOptions extends Record<string, unknown> {
	autoMerge?: boolean;
	branches: string;
	confirm?: boolean;
	cpuLimit?: string;
	dockerImage?: string;
	memoryLimit?: string;
	strategies?: string;
	timeout: string;
}

/**
 * CLI options for explore list command
 */
interface ExploreListOptions extends Record<string, unknown> {
	activeOnly?: boolean;
	status?: string;
}

/**
 * CLI options for explore compare command
 */
interface ExploreCompareOptions extends Record<string, unknown> {
	confirm?: boolean;
}

/**
 * Configure explore command and all subcommands
 */
export function configureExploreCommand(program: CommandAdapter): void {
	const exploreCmd = program
		.command('explore')
		.description('Multi-agent parallel exploration of different solution approaches');

	// Parallel exploration
	exploreCmd
		.command('parallel <task>')
		.description('Start multiple parallel explorations with different strategies')
		.option('-b, --branches <n>', 'Number of parallel explorations', '3')
		.option('-s, --strategies <list>', 'Comma-separated approach tags (e.g., "jwt,session,oauth")')
		.option('-t, --timeout <minutes>', 'Max duration per exploration', '60')
		.option('--docker-image <image>', 'Custom Docker image', 'mcr.microsoft.com/devcontainers/javascript-node:24')
		.option('--cpu-limit <cores>', 'CPU limit per container', '1.5')
		.option('--memory-limit <size>', 'Memory limit per container', '2g')
		.option('--auto-merge', 'Auto-merge winning exploration')
		.option('--no-cleanup', 'Keep explorations for debugging')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const task = args[0] as unknown as string;
			const options = args[1] as unknown as ExploreTaskOptions;
			const color = getColorAdapter();
			try {
				console.log(color.getRawFn('cyan.bold')('\n🔬 Starting Parallel Exploration\n'));

				// Validate and parse inputs
				validateTask(task);
				const branches = parseBranches(options['branches'] as string);
				const strategies = parseStrategies(options.strategies, branches);

				// Run safety validation
				await runSafetyValidation(branches);

				// Build configuration
				const config: ExplorationConfig = {
					auto_merge: (options['autoMerge'] as boolean | undefined) ?? false,
					branches,
					cpu_limit: (options['cpuLimit'] as string | undefined) ?? '1.5',
					docker_image:
						(options['dockerImage'] as string | undefined) ?? 'mcr.microsoft.com/devcontainers/javascript-node:24',
					memory_limit: (options['memoryLimit'] as string | undefined) ?? '2g',
					no_cleanup: !(options['cleanup'] as boolean | undefined),
					port_range_end: 3100,
					port_range_start: 3000,
					strategies,
					timeout_minutes: parseInt(options['timeout'] as string, 10)
				};

				displayExplorationConfig(task, branches, strategies, config);

				// Start orchestrator
				const orchestratorSpinner = spinner.create('Starting exploration orchestrator...').start();
				const orchestrator = new ExplorationOrchestrator();

				try {
					const result = await orchestrator.startExploration({ config, task });
					orchestratorSpinner.succeed(color.green('Exploration completed!'));

					// Display results and next steps
					displayExplorationResults(result);
					displayNextSteps(result);
				} catch (error) {
					orchestratorSpinner.fail(color.red('Exploration failed'));
					throw error;
				}
			} catch (error) {
				console.error(color.red('Failed to start parallel exploration:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Sequential exploration
	exploreCmd
		.command('sequential <task>')
		.description('Try different approaches sequentially until one succeeds')
		.option('-b, --branches <n>', 'Number of approaches to try', '3')
		.option('-s, --strategies <list>', 'Comma-separated approach tags')
		.option('-t, --timeout <minutes>', 'Max duration per approach', '30')
		.option('--docker-image <image>', 'Custom Docker image', 'mcr.microsoft.com/devcontainers/javascript-node:24')
		.option('--cpu-limit <cores>', 'CPU limit per container', '1.5')
		.option('--memory-limit <size>', 'Memory limit per container', '2g')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const task = args[0] as unknown as string;
			const options = args[1] as unknown as ExploreTaskOptions;
			const color = getColorAdapter();
			try {
				console.log(color.getRawFn('cyan.bold')('\n🔬 Starting Sequential Exploration\n'));

				// Parse configuration (same as parallel)
				const branches = parseInt(options['branches'] as string, 10);
				let strategies: string[] | undefined;
				const strategiesStr = options['strategies'] as string | undefined;
				if (strategiesStr) {
					strategies = strategiesStr.split(',').map((s: string) => s.trim());
				}

				const config: ExplorationConfig = {
					auto_merge: false,
					branches,
					cpu_limit: (options['cpuLimit'] as string | undefined) ?? '1.5',
					docker_image:
						(options['dockerImage'] as string | undefined) ?? 'mcr.microsoft.com/devcontainers/javascript-node:24',
					memory_limit: (options['memoryLimit'] as string | undefined) ?? '2g',
					mode: 'sequential',
					no_cleanup: false,
					port_range_end: 3100,
					port_range_start: 3000,
					strategies,
					timeout_minutes: parseInt(options['timeout'] as string, 10)
				};

				// Start orchestrator
				const loading = spinner.create('Starting sequential exploration...').start();
				const orchestrator = new ExplorationOrchestrator();

				const result = await orchestrator.startExploration({ config, task });

				loading.succeed(color.green('Sequential exploration completed!'));

				// Display results
				console.log(color.getRawFn('cyan.bold')('\n📊 Exploration Results\n'));
				console.log(color.gray(`Exploration ID: ${result.exploration_id}`));
				console.log(color.gray(`Mode: sequential`));
				console.log(
					color.gray(
						`Tried: ${result.execution_result.completed_branches}/${result.execution_result.total_branches} approaches`
					)
				);
				console.log(color.gray(`Duration: ${(result.execution_result.duration_ms / 1000).toFixed(2)}s`));

				if (result.execution_result.winner_index) {
					console.log(color.green(`\n✓ Successful approach: Worktree ${result.execution_result.winner_index}`));
				} else {
					console.log(color.yellow('\n⚠️  All approaches failed'));
				}

				if (result.comparison_report_path) {
					console.log(color.gray(`\nComparison report: ${result.comparison_report_path}\n`));
				}
			} catch (error) {
				console.error(color.red('Sequential exploration failed:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// List explorations
	exploreCmd
		.command('list')
		.description('List all explorations')
		.option('--active-only', 'Show only active explorations')
		.option('--status <status>', 'Filter by status (pending, running, completed, failed, stopped)')
		.action(async (options: ExploreListOptions) => {
			const color = getColorAdapter();
			try {
				const stateManager = new ExplorationStateManager();
				const explorations = await stateManager.listExplorations();

				// Apply filters
				const filtered = filterExplorations(explorations, options);

				if (filtered.length === 0) {
					console.log(color.yellow('\nNo explorations found\n'));
					return;
				}

				console.log(color.getRawFn('cyan.bold')(`\n📊 Explorations (${filtered.length})\n`));

				// Display each exploration
				filtered.forEach((exp) => displayExplorationSummary(exp));
			} catch (error) {
				console.error(color.red('Failed to list explorations:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Show exploration status
	exploreCmd
		.command('status <exploration-id>')
		.description('Show detailed exploration status')
		.option('--watch', 'Watch status in real-time')
		.option('--logs', 'Show container logs')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const explorationId = args[0] as unknown as string;
			const color = getColorAdapter();
			try {
				const stateManager = new ExplorationStateManager();
				const exploration = await stateManager.loadExploration(explorationId);

				console.log(color.getRawFn('cyan.bold')(`\n📊 Exploration Status: ${explorationId}\n`));

				// Display basic info
				displayExplorationBasicInfo(exploration);

				// Display worktrees
				console.log(color.bold('\nWorktrees:'));
				exploration.worktrees.forEach((worktree) => displayWorktreeStatus(worktree));

				// Display results
				if (exploration.results) {
					displayExplorationDetailsResults(exploration.results);
				}

				// Display collaboration stats
				await displayCollaborationStats(explorationId, stateManager);

				console.log('');
			} catch (error) {
				console.error(color.red('Failed to get exploration status:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Compare explorations
	exploreCmd
		.command('compare <exploration-id>')
		.description('Compare results from different worktrees')
		.option('--interactive', 'Interactive comparison mode')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const explorationId = args[0] as unknown as string;
			const color = getColorAdapter();
			try {
				console.log(color.getRawFn('cyan.bold')(`\n📊 Comparing Exploration: ${explorationId}\n`));

				const stateManager = new ExplorationStateManager();
				const exploration = await stateManager.loadExploration(explorationId);

				// Generate comparison
				const comparator = new ResultComparator(exploration, stateManager);
				const report = await comparator.generateComparisonReport();

				// Display comparison table
				console.log(color.bold('Comparison Table:\n'));
				const table = comparator.generateComparisonTable(report.metrics);
				console.log(table);

				// Display summary
				console.log(color.bold('\nSummary:'));
				console.log(color.gray(report.summary));

				// Display recommendation
				console.log(color.bold('\nRecommendation:'));
				console.log(color.cyan(report.recommendation));

				// Show comparison report location
				const explorationDir = stateManager.getExplorationDir(explorationId);
				console.log(color.gray(`\nFull report: ${explorationDir}/comparison-report.md\n`));
			} catch (error) {
				console.error(color.red('Failed to compare exploration:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Merge exploration
	exploreCmd
		.command('merge <exploration-id> <worktree-index>')
		.description('Merge successful exploration back to main branch')
		.option('--target-branch <branch>', 'Target branch (default: current branch)')
		.option('--strategy <strategy>', 'Merge strategy: direct, squash, rebase (default: direct)', 'direct')
		.option('--no-delete-worktree', 'Keep worktree after merge')
		.option('--no-backup', 'Skip creating backup branch')
		.option('--auto-resolve-conflicts', 'Automatically resolve conflicts (use with caution)')
		.option('--message <message>', 'Custom commit message')
		.option('--create-pr', 'Create pull request instead of direct merge')
		.option('--pr-title <title>', 'Pull request title')
		.option('--pr-body <body>', 'Pull request body')
		.option('--preview', 'Preview merge without executing')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const explorationId = args[0] as unknown as string;
			const worktreeIndexStr = args[1] as unknown as string;
			const options = args[2] as unknown as ExploreCompareOptions;
			const color = getColorAdapter();
			try {
				const worktreeIndex = parseInt(worktreeIndexStr, 10);

				if (isNaN(worktreeIndex) || worktreeIndex < 1) {
					console.error(color.red('Error: Invalid worktree index'));
					process.exit(1);
				}

				console.log(
					color.getRawFn('cyan.bold')(`\n🔀 Merge Exploration: ${explorationId} (Worktree ${worktreeIndex})\n`)
				);

				const mergeOrchestrator = new MergeOrchestrator();

				// Handle preview mode
				if (options['preview'] as boolean | undefined) {
					await handleMergePreview(
						mergeOrchestrator,
						explorationId,
						worktreeIndex,
						options['targetBranch'] as string | undefined
					);
					return;
				}

				// Validate strategy
				const strategy = options['strategy'] as string;
				validateMergeStrategy(strategy);

				// Confirm merge
				const answer = await prompt.prompt<{ confirm: boolean }>([
					{
						default: false,
						message: `Merge exploration ${explorationId} worktree ${worktreeIndex} using ${strategy} strategy?`,
						name: 'confirm',
						type: 'confirm'
					}
				]);

				if (!answer.confirm) {
					console.log(color.yellow('\nMerge cancelled\n'));
					return;
				}

				// Execute merge
				const loading = spinner.create('Executing merge...').start();

				const result = await mergeOrchestrator.mergeExploration(explorationId, worktreeIndex, {
					auto_resolve_conflicts: (options['autoResolveConflicts'] as boolean | undefined) ?? false,
					commit_message: options['message'] as string | undefined,
					create_backup: !(options['noBackup'] as boolean | undefined),
					create_pr: (options['createPr'] as boolean | undefined) ?? false,
					delete_worktree: !(options['noDeleteWorktree'] as boolean | undefined),
					pr_body: options['prBody'] as string | undefined,
					pr_title: options['prTitle'] as string | undefined,
					strategy: strategy as MergeStrategy,
					target_branch: options['targetBranch'] as string | undefined
				});

				if (result.success) {
					loading.succeed(color.green('Merge completed successfully!'));
					displayMergeSuccess(result);
				} else {
					loading.fail(color.red('Merge failed'));
					displayMergeFailure(result);
					process.exit(1);
				}
			} catch (error) {
				console.error(color.red('\nMerge failed:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Dashboard command
	exploreCmd
		.command('dashboard <exploration-id>')
		.description('Launch real-time dashboard for active exploration')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const explorationId = args[0] as unknown as string;
			const color = getColorAdapter();
			try {
				const stateManager = new ExplorationStateManager();
				const exploration = await stateManager.loadExploration(explorationId);

				console.log(color.cyan(`\n📊 Launching dashboard for ${explorationId}...\n`));

				// Import and launch dashboard
				const { launchDashboard } = await import('exploration/dashboard-ui');
				launchDashboard(explorationId, exploration);
			} catch (error) {
				console.error(color.red('Failed to launch dashboard:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Cleanup explorations
	exploreCmd
		.command('cleanup [exploration-id]')
		.description('Clean up explorations')
		.option('--all', 'Clean up all explorations')
		.option('--failed-only', 'Clean up only failed explorations')
		.option('--older-than <hours>', 'Clean up explorations older than N hours')
		.option('--dry-run', 'Preview cleanup without actually removing')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const explorationId = args[0] as string | undefined;
			const options = args[1] as Record<string, unknown>;
			const color = getColorAdapter();
			try {
				const stateManager = new ExplorationStateManager();
				const worktreeManager = new WorktreeManager();

				if (explorationId) {
					// Clean up specific exploration
					await cleanupSingleExploration(
						explorationId,
						stateManager,
						worktreeManager,
						(options['dryRun'] as boolean | undefined) ?? false
					);
				} else if (options['all'] ?? options['failedOnly'] ?? options['olderThan']) {
					// Bulk cleanup
					await handleBulkCleanup(stateManager, worktreeManager, {
						dryRun: options['dryRun'] as boolean | undefined,
						failedOnly: options['failedOnly'] as boolean | undefined,
						olderThan: options['olderThan'] as string | undefined
					});
				} else {
					console.error(color.red('Error: Specify exploration ID or use --all, --failed-only, or --older-than'));
					process.exit(1);
				}
			} catch (error) {
				console.error(color.red('Failed to cleanup explorations:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Help command
	exploreCmd
		.command('help')
		.description('Show exploration help and examples')
		.action(() => {
			const color = getColorAdapter();
			console.log(color.getRawFn('cyan.bold')('\n🔬 Multi-Agent Parallel Exploration\n'));
			console.log(color.bold('Description:'));
			console.log(
				color.gray(
					'  Enable multiple AI agents to explore different solution approaches simultaneously\n' +
						'  using git worktrees and Docker containers for complete isolation.\n'
				)
			);

			console.log(color.bold('Commands:'));
			console.log(color.cyan('  valora explore parallel <task>     ') + color.gray('Start parallel explorations'));
			console.log(color.cyan('  valora explore sequential <task>   ') + color.gray('Try approaches sequentially'));
			console.log(color.cyan('  valora explore list                ') + color.gray('List all explorations'));
			console.log(color.cyan('  valora explore status <id>         ') + color.gray('Show exploration status'));
			console.log(color.cyan('  valora explore dashboard <id>      ') + color.gray('Launch real-time dashboard'));
			console.log(color.cyan('  valora explore compare <id>        ') + color.gray('Compare results'));
			console.log(color.cyan('  valora explore merge <id> <index>  ') + color.gray('Merge winning exploration'));
			console.log(color.cyan('  valora explore cleanup [id]        ') + color.gray('Clean up explorations'));

			console.log(color.bold('\nExamples:'));
			console.log(color.gray('  # Start 3 parallel explorations'));
			console.log(color.cyan('  valora explore parallel "Implement user authentication" --branches 3'));

			console.log(color.gray('\n  # Try different strategies'));
			console.log(color.cyan('  valora explore parallel "Add caching" --strategies "redis,memcached,file"'));

			console.log(color.gray('\n  # List active explorations'));
			console.log(color.cyan('  valora explore list --active-only'));

			console.log(color.gray('\n  # Preview merge (dry run)'));
			console.log(color.cyan('  valora explore merge exp-abc123 1 --preview'));

			console.log(color.gray('\n  # Merge with squash strategy'));
			console.log(color.cyan('  valora explore merge exp-abc123 1 --strategy squash'));

			console.log(color.gray('\n  # Merge with custom message'));
			console.log(color.cyan('  valora explore merge exp-abc123 1 --message "feat: add authentication"'));

			console.log(color.gray('\n  # Create pull request instead of direct merge'));
			console.log(color.cyan('  valora explore merge exp-abc123 1 --create-pr --pr-title "Add auth"'));

			console.log(color.gray('\n  # Clean up failed explorations'));
			console.log(color.cyan('  valora explore cleanup --failed-only\n'));
		});
}
