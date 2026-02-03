/**
 * Shared Volume Manager - Initialize and manage shared volumes for collaboration
 *
 * Sets up the shared volume structure that allows agents to collaborate
 */

import type { DecisionsPool, InsightsPool } from 'types/exploration.types';

import { promises as fs } from 'fs';
import { getLogger } from 'output/logger';
import * as path from 'path';
import { ensureDir } from 'utils/file-utils';

const logger = getLogger();

export interface SharedVolumeStructure {
	decisions_pool_path: string;
	insights_pool_path: string;
	locks_dir: string;
	root_path: string;
	worktree_data_dirs: string[];
}

export class SharedVolumeManager {
	private explorationId: string;
	private sharedVolumePath: string;

	constructor(sharedVolumePath: string, explorationId: string) {
		this.sharedVolumePath = sharedVolumePath;
		this.explorationId = explorationId;
	}

	/**
	 * Initialize the shared volume structure
	 */
	async initialize(worktreeCount: number): Promise<SharedVolumeStructure> {
		logger.info(`Initializing shared volume for exploration ${this.explorationId}`);

		// Create root directory
		await ensureDir(this.sharedVolumePath);

		// Create locks directory
		const locksDir = path.join(this.sharedVolumePath, 'locks');
		await ensureDir(locksDir);

		// Initialize insights pool
		const insightsPoolPath = path.join(this.sharedVolumePath, 'insights-pool.json');
		await this.initializeInsightsPool(insightsPoolPath);

		// Initialize decisions pool
		const decisionsPoolPath = path.join(this.sharedVolumePath, 'decisions-pool.json');
		await this.initializeDecisionsPool(decisionsPoolPath);

		// Create worktree data directories
		const worktreeDataDirs: string[] = [];
		for (let i = 1; i <= worktreeCount; i++) {
			const worktreeDir = path.join(this.sharedVolumePath, `worktree-${i}`);
			await this.initializeWorktreeData(worktreeDir, i);
			worktreeDataDirs.push(worktreeDir);
		}

		// Create README for documentation
		await this.createReadme();

		const structure: SharedVolumeStructure = {
			decisions_pool_path: decisionsPoolPath,
			insights_pool_path: insightsPoolPath,
			locks_dir: locksDir,
			root_path: this.sharedVolumePath,
			worktree_data_dirs: worktreeDataDirs
		};

		logger.info(`Shared volume initialized at ${this.sharedVolumePath}`);
		return structure;
	}

	/**
	 * Initialize insights pool file
	 */
	private async initializeInsightsPool(filePath: string): Promise<void> {
		const pool: InsightsPool = {
			exploration_id: this.explorationId,
			insights: [],
			last_updated: new Date().toISOString(),
			total_count: 0
		};

		await fs.writeFile(filePath, JSON.stringify(pool, null, 2), 'utf-8');
		logger.debug(`Insights pool initialized: ${filePath}`);
	}

	/**
	 * Initialize decisions pool file
	 */
	private async initializeDecisionsPool(filePath: string): Promise<void> {
		const pool: DecisionsPool = {
			decisions: [],
			exploration_id: this.explorationId,
			last_updated: new Date().toISOString(),
			total_count: 0
		};

		await fs.writeFile(filePath, JSON.stringify(pool, null, 2), 'utf-8');
		logger.debug(`Decisions pool initialized: ${filePath}`);
	}

	/**
	 * Initialize worktree data directory
	 */
	private async initializeWorktreeData(worktreeDir: string, index: number): Promise<void> {
		await ensureDir(worktreeDir);

		// Create latest-insight.json
		const latestInsightPath = path.join(worktreeDir, 'latest-insight.json');
		await fs.writeFile(
			latestInsightPath,
			JSON.stringify(
				{
					insight: null,
					last_updated: new Date().toISOString(),
					worktree_index: index
				},
				null,
				2
			),
			'utf-8'
		);

		// Create metrics.json
		const metricsPath = path.join(worktreeDir, 'metrics.json');
		await fs.writeFile(
			metricsPath,
			JSON.stringify(
				{
					decisions_participated: 0,
					insights_published: 0,
					last_updated: new Date().toISOString(),
					worktree_index: index
				},
				null,
				2
			),
			'utf-8'
		);

		// Create progress.json
		const progressPath = path.join(worktreeDir, 'progress.json');
		await fs.writeFile(
			progressPath,
			JSON.stringify(
				{
					current_stage: 'initializing',
					errors: [],
					last_updated: new Date().toISOString(),
					percentage: 0,
					stages_completed: [],
					worktree_index: index
				},
				null,
				2
			),
			'utf-8'
		);

		logger.debug(`Worktree data initialized: ${worktreeDir}`);
	}

	/**
	 * Create README file explaining the shared volume structure
	 */
	private async createReadme(): Promise<void> {
		const readmePath = path.join(this.sharedVolumePath, 'README.md');
		const content = `# Shared Exploration Volume

This directory contains shared data for parallel exploration: ${this.explorationId}

## Structure

\`\`\`
shared/
├── README.md                  # This file
├── insights-pool.json         # Aggregated insights from all agents
├── decisions-pool.json        # Collaborative decisions
├── locks/                     # File locks for coordination
└── worktree-{N}/              # Per-worktree data
    ├── latest-insight.json    # Most recent insight published
    ├── metrics.json           # Worktree metrics
    └── progress.json          # Progress tracking
\`\`\`

## Usage

### Publishing Insights

Agents write insights to \`insights-pool.json\` using the file locking mechanism.

### Reading Insights

Agents read from \`insights-pool.json\` to learn from other explorations.

### Making Decisions

Agents propose and vote on decisions via \`decisions-pool.json\`.

### Tracking Progress

Each worktree writes its progress to \`worktree-{N}/progress.json\` for monitoring.

## File Locking

All shared files use atomic operations with file locks (\`.lock\` files) to prevent race conditions.
Locks automatically expire after 5 seconds.

## Generated

Created: ${new Date().toISOString()}
Exploration ID: ${this.explorationId}
`;

		await fs.writeFile(readmePath, content, 'utf-8');
	}

	/**
	 * Get shared volume paths
	 */
	getPaths(): {
		decisions_pool: string;
		insights_pool: string;
		locks_dir: string;
		root: string;
		worktreeData: (index: number) => string;
	} {
		return {
			decisions_pool: path.join(this.sharedVolumePath, 'decisions-pool.json'),
			insights_pool: path.join(this.sharedVolumePath, 'insights-pool.json'),
			locks_dir: path.join(this.sharedVolumePath, 'locks'),
			root: this.sharedVolumePath,
			worktreeData: (index: number) => path.join(this.sharedVolumePath, `worktree-${index}`)
		};
	}

	/**
	 * Clean up shared volume (remove all files)
	 */
	async cleanup(): Promise<void> {
		try {
			logger.info(`Cleaning up shared volume: ${this.sharedVolumePath}`);
			await fs.rm(this.sharedVolumePath, { force: true, recursive: true });
			logger.info(`Shared volume cleaned up`);
		} catch (error) {
			const typedError = error as Error;
			logger.error(`Failed to cleanup shared volume: ${typedError.message}`);
			throw error;
		}
	}

	/**
	 * Validate shared volume structure
	 */
	async validate(): Promise<{
		errors: string[];
		missing_files: string[];
		valid: boolean;
	}> {
		const missingFiles: string[] = [];
		const errors: string[] = [];

		try {
			// Check root directory
			try {
				await fs.access(this.sharedVolumePath);
			} catch {
				missingFiles.push(this.sharedVolumePath);
			}

			// Check insights pool
			const insightsPoolPath = path.join(this.sharedVolumePath, 'insights-pool.json');
			try {
				await fs.access(insightsPoolPath);
			} catch {
				missingFiles.push(insightsPoolPath);
			}

			// Check decisions pool
			const decisionsPoolPath = path.join(this.sharedVolumePath, 'decisions-pool.json');
			try {
				await fs.access(decisionsPoolPath);
			} catch {
				missingFiles.push(decisionsPoolPath);
			}

			// Check locks directory
			const locksDir = path.join(this.sharedVolumePath, 'locks');
			try {
				await fs.access(locksDir);
			} catch {
				missingFiles.push(locksDir);
			}

			return {
				errors,
				missing_files: missingFiles,
				valid: missingFiles.length === 0 && errors.length === 0
			};
		} catch (error) {
			const typedError = error as Error;
			errors.push(typedError.message);
			return {
				errors,
				missing_files: missingFiles,
				valid: false
			};
		}
	}

	/**
	 * Get shared volume size in bytes
	 */
	async getSize(): Promise<number> {
		let totalSize = 0;

		async function calculateSize(dirPath: string): Promise<number> {
			let size = 0;
			try {
				const entries = await fs.readdir(dirPath, { withFileTypes: true });

				for (const entry of entries) {
					const entryPath = path.join(dirPath, entry.name);

					if (entry.isDirectory()) {
						size += await calculateSize(entryPath);
					} else if (entry.isFile()) {
						const stats = await fs.stat(entryPath);
						size += stats.size;
					}
				}
			} catch (error) {
				// Ignore errors
			}

			return size;
		}

		totalSize = await calculateSize(this.sharedVolumePath);
		return totalSize;
	}

	/**
	 * Get formatted size
	 */
	async getFormattedSize(): Promise<string> {
		const bytes = await this.getSize();

		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
	}

	/**
	 * Archive shared volume to a tar.gz file
	 */
	async archive(outputPath: string): Promise<void> {
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		try {
			logger.info(`Archiving shared volume to ${outputPath}`);
			await execAsync(
				`tar -czf ${outputPath} -C ${path.dirname(this.sharedVolumePath)} ${path.basename(this.sharedVolumePath)}`
			);
			logger.info(`Shared volume archived successfully`);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to archive shared volume: ${typedError.message}`);
		}
	}
}
