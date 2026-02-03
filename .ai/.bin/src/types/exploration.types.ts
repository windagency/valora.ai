/**
 * Exploration type definitions for multi-agent parallel exploration
 */

export type ExecutionMode = 'parallel' | 'sequential';
export type ExplorationStatus = 'completed' | 'failed' | 'pending' | 'running' | 'stopped';
export type InsightType = 'approach' | 'decision' | 'finding' | 'issue';

/**
 * Main exploration metadata
 */
export interface Exploration {
	branches: number; // Number of worktrees
	completed_at?: string;
	completed_branches: number; // Number of successfully completed worktrees
	config: ExplorationConfig;
	created_at: string;
	duration_ms?: number; // Total duration
	id: string; // exp-{nanoid}
	mode: ExecutionMode;
	results?: ExplorationResults;
	started_at?: string;
	status: ExplorationStatus;
	task: string; // User's task description
	worktrees: WorktreeExploration[];
	// Merge tracking
	merge_backup_branch?: string; // Backup branch created before merge
	merge_strategy?: 'direct' | 'rebase' | 'squash'; // Strategy used for merge
	merge_target_branch?: string; // Branch that was merged into
	merged_at?: string; // ISO 8601 timestamp when merged
	merged_worktree?: number; // Index of worktree that was merged
}

/**
 * Individual worktree exploration
 */
export interface WorktreeExploration {
	allocated_resources?: AllocatedResources;
	branch_name: string; // exploration/{task}-{index}-{id}
	completed_at?: string;
	container_id?: string; // Docker container ID
	container_stats?: ContainerStats;
	index: number; // 1, 2, 3...
	progress: WorktreeProgress;
	session_id?: string; // AI session ID
	started_at?: string;
	status: ExplorationStatus;
	strategy?: string; // User-specified strategy tag (e.g., "jwt", "session")
	worktree_path: string; // .ai/worktrees/{id}-{index}
}

/**
 * Progress tracking for a worktree
 */
export interface WorktreeProgress {
	current_stage: string; // e.g., "Planning", "Coding", "Testing"
	errors: string[];
	insights_published: number;
	last_update: string;
	percentage: number; // 0-100
	stages_completed: string[];
}

/**
 * Resources allocated to a worktree/container
 */
export interface AllocatedResources {
	container_name?: string; // Docker container name
	cpu_limit: string; // e.g., "1.5"
	memory_limit: string; // e.g., "2g"
	port?: number; // Assigned port from pool
}

/**
 * Exploration configuration
 */
export interface ExplorationConfig {
	auto_merge: boolean;
	branches: number; // Number of parallel explorations
	cpu_limit: string;
	docker_image: string;
	memory_limit: string;
	mode?: 'parallel' | 'sequential'; // Execution mode
	no_cleanup: boolean;
	port_range_end: number;
	port_range_start: number;
	strategies?: string[]; // Optional strategy tags
	timeout_minutes: number;
}

/**
 * Exploration results and comparison
 */
export interface ExplorationResults {
	comparison?: WorktreeComparison[];
	comparison_report?: string; // Path to comparison report
	decisions_made: number;
	insights_collected: number;
	total_duration_ms?: number;
	winner?: number; // Index of winning worktree
}

/**
 * Comparison data for a single worktree
 */
export interface WorktreeComparison {
	code_quality_score?: number;
	duration_ms: number;
	errors_count: number;
	index: number;
	insights_count: number;
	progress_percentage: number;
	status: ExplorationStatus;
	strategy?: string;
	tests_passing: boolean;
}

/**
 * Shared insight published by agents
 */
export interface Insight {
	content: string;
	id: string; // insight-{uuid}
	metadata: Record<string, unknown>;
	tags: string[];
	timestamp: string; // ISO 8601
	title: string;
	type: InsightType;
	worktree_id: string; // exploration-exp123-1
}

/**
 * Collaborative decision
 */
export interface Decision {
	chosen_option?: number;
	id: string; // decision-{uuid}
	options: DecisionOption[];
	rationale?: string;
	timestamp: string;
	topic: string; // What decision is about
	votes: Record<string, number>; // worktree_id -> option_index
}

/**
 * Decision option
 */
export interface DecisionOption {
	cons: string[];
	description: string;
	index: number;
	label: string;
	pros: string[];
}

/**
 * Shared insights pool (file format)
 */
export interface InsightsPool {
	exploration_id: string;
	insights: Insight[];
	last_updated: string;
	total_count: number;
}

/**
 * Decisions pool (file format)
 */
export interface DecisionsPool {
	decisions: Decision[];
	exploration_id: string;
	last_updated: string;
	total_count: number;
}

/**
 * File lock metadata
 */
export interface FileLock {
	acquired_at: string;
	acquired_by: string; // worktree_id
	expires_at: string;
	lock_id: string;
}

/**
 * Exploration state (persisted to disk)
 */
export interface ExplorationState {
	allocated_ports: number[];
	container_ids: string[];
	exploration: Exploration;
	last_saved: string;
	lock_status: Record<string, FileLock>;
	shared_volume_path: string;
	worktree_paths: string[];
}

/**
 * Safety validation result
 */
export interface SafetyValidation {
	checks: SafetyCheck[];
	errors: string[];
	passed: boolean;
	warnings: string[];
}

/**
 * Individual safety check result
 */
export interface SafetyCheck {
	details?: unknown;
	message: string;
	name: string;
	passed: boolean;
}

/**
 * Resource availability check
 */
export interface ResourceAvailability {
	available_cpu_cores: number;
	available_disk_gb: number;
	available_memory_gb: number;
	docker_running: boolean;
	docker_version?: string;
}

/**
 * Git state information
 */
export interface GitState {
	current_branch: string;
	existing_worktrees: string[];
	is_clean: boolean;
	main_branch_up_to_date: boolean;
	uncommitted_changes: number;
}

/**
 * Container statistics
 */
export interface ContainerStats {
	container_id: string;
	cpu_usage_percent: number;
	exit_code?: number;
	memory_limit_mb: number;
	memory_usage_mb: number;
	status: 'error' | 'exited' | 'running' | 'stopped';
	uptime_seconds: number;
	worktree_index: number;
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
	all?: boolean;
	dry_run?: boolean;
	exploration_id?: string;
	failed_only?: boolean;
	older_than_hours?: number;
	preserve_successful?: boolean;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
	containers_removed: number;
	disk_space_freed_mb: number;
	errors: string[];
	explorations_deleted: number;
	worktrees_removed: number;
}

/**
 * Merge options
 */
export interface MergeOptions {
	create_backup?: boolean; // Default: true
	delete_worktree?: boolean; // Default: true
	exploration_id: string;
	target_branch?: string; // Default: main branch
	worktree_index: number;
}

/**
 * Merge result
 */
export interface MergeResult {
	backup_branch?: string;
	conflicts: string[];
	files_changed: number;
	merged_branch: string;
	success: boolean;
	target_branch: string;
}

/**
 * Exploration list filters
 */
export interface ExplorationListFilters {
	active_only?: boolean;
	created_after?: string;
	created_before?: string;
	status?: ExplorationStatus;
}

/**
 * Exploration summary for list view
 */
export interface ExplorationSummary {
	branches: number;
	completed_branches: number;
	created_at: string;
	duration_ms?: number;
	id: string;
	insights_count?: number;
	mode: ExecutionMode;
	status: ExplorationStatus;
	task: string;
}
