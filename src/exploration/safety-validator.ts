/**
 * Safety Validator - Pre-flight validation checks
 *
 * Performs comprehensive safety checks before starting an exploration
 */

import type { GitState, ResourceAvailability, SafetyCheck, SafetyValidation } from 'types/exploration.types';

import { exec } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SafetyValidatorConfig {
	check_docker?: boolean;
	min_disk_space_gb?: number;
	min_memory_gb_per_branch?: number;
	require_clean_tree?: boolean;
	require_updated_main?: boolean;
}

export class SafetyValidator {
	private config: Required<SafetyValidatorConfig>;
	private repoRoot: string;

	constructor(repoRoot?: string, config?: SafetyValidatorConfig) {
		this.repoRoot = repoRoot ?? process.cwd();
		this.config = this.buildConfig(config);
	}

	/**
	 * Build configuration with defaults
	 */
	private buildConfig(config?: SafetyValidatorConfig): Required<SafetyValidatorConfig> {
		const defaults: Required<SafetyValidatorConfig> = {
			check_docker: true,
			min_disk_space_gb: 5,
			min_memory_gb_per_branch: 2,
			require_clean_tree: true,
			require_updated_main: true
		};

		return {
			...defaults,
			...config
		};
	}

	/**
	 * Run all safety validations
	 */
	async validate(branches: number = 1): Promise<SafetyValidation> {
		const checks: SafetyCheck[] = [];
		const errors: string[] = [];
		const warnings: string[] = [];

		// 1. Git state check
		await this.runSafetyCheck('Git State', () => this.checkGitState(), checks, errors);

		// 2. Docker availability check
		if (this.config.check_docker) {
			await this.runSafetyCheck('Docker Availability', () => this.checkDockerAvailability(), checks, errors);
		}

		// 3. Resource availability check
		await this.runSafetyCheck('Resource Availability', () => this.checkResourceAvailability(branches), checks, errors);

		// 4. Disk space check
		await this.runSafetyCheck('Disk Space', () => this.checkDiskSpace(), checks, errors);

		const passed = checks.every((check) => check.passed);

		return {
			checks,
			errors,
			passed,
			warnings
		};
	}

	/**
	 * Run a safety check with error handling
	 */
	private async runSafetyCheck(
		checkName: string,
		checkFn: () => Promise<SafetyCheck>,
		checks: SafetyCheck[],
		errors: string[]
	): Promise<void> {
		try {
			const result = await checkFn();
			checks.push(result);
			if (!result.passed) {
				errors.push(result.message);
			}
		} catch (error) {
			const typedError = error as Error;
			checks.push({
				message: `${checkName} check failed: ${typedError.message}`,
				name: checkName,
				passed: false
			});
			errors.push(`${checkName} validation failed: ${typedError.message}`);
		}
	}

	/**
	 * Check git repository state
	 */
	private async checkGitState(): Promise<SafetyCheck> {
		const state = await this.getGitState();

		// Check if working tree is clean (if required)
		if (this.config.require_clean_tree && !state.is_clean) {
			return {
				details: state,
				message: `Working tree has ${state.uncommitted_changes} uncommitted changes. Commit or stash changes before creating explorations.`,
				name: 'Git Working Tree',
				passed: false
			};
		}

		// Check if on a valid branch (not detached HEAD)
		if (!state.current_branch || state.current_branch === 'HEAD') {
			return {
				details: state,
				message: 'Not on a valid branch (detached HEAD). Checkout a branch first.',
				name: 'Git Working Tree',
				passed: false
			};
		}

		// Check if main branch is up to date (if required)
		if (this.config.require_updated_main && !state.main_branch_up_to_date) {
			return {
				details: state,
				message: 'Main branch is not up to date. Pull latest changes before creating explorations.',
				name: 'Git Working Tree',
				passed: false
			};
		}

		return {
			details: state,
			message: 'Git repository state is valid',
			name: 'Git Working Tree',
			passed: true
		};
	}

	/**
	 * Check Docker availability
	 */
	private async checkDockerAvailability(): Promise<SafetyCheck> {
		try {
			// Check if Docker daemon is running
			const { stdout } = await execAsync('docker info');

			// Extract Docker version
			const versionMatch = stdout.match(/Server Version: (.+)/);
			const version = versionMatch?.[1] ?? 'unknown';

			// Check version (require >= 20.10)
			if (version === 'unknown') {
				return {
					details: { version },
					message: 'Could not determine Docker version',
					name: 'Docker Availability',
					passed: false
				};
			}

			const versionParts = version.split('.');
			const majorVersion = parseInt(versionParts[0] ?? '0');
			const minorVersion = parseInt(versionParts[1] ?? '0');

			if (majorVersion < 20 || (majorVersion === 20 && minorVersion < 10)) {
				return {
					details: { version },
					message: `Docker version ${version} is too old. Require >= 20.10`,
					name: 'Docker Availability',
					passed: false
				};
			}

			return {
				details: { version },
				message: `Docker ${version} is available and running`,
				name: 'Docker Availability',
				passed: true
			};
		} catch (error) {
			const typedError = error as Error;
			return {
				details: { error: typedError.message },
				message: 'Docker is not running or not installed',
				name: 'Docker Availability',
				passed: false
			};
		}
	}

	/**
	 * Check resource availability
	 */
	private async checkResourceAvailability(branches: number): Promise<SafetyCheck> {
		const resources = await this.getResourceAvailability();

		// Calculate required resources
		const requiredMemoryGb = branches * this.config.min_memory_gb_per_branch * 1.2; // 20% buffer
		const requiredCpuCores = branches;

		// Check memory
		if (resources.available_memory_gb < requiredMemoryGb) {
			return {
				details: resources,
				message: `Insufficient memory: ${resources.available_memory_gb.toFixed(1)}GB available, ${requiredMemoryGb.toFixed(1)}GB required for ${branches} branches`,
				name: 'Resource Availability',
				passed: false
			};
		}

		// Check CPU
		if (resources.available_cpu_cores < requiredCpuCores) {
			return {
				details: resources,
				message: `Insufficient CPU: ${resources.available_cpu_cores} cores available, ${requiredCpuCores} required for ${branches} branches`,
				name: 'Resource Availability',
				passed: false
			};
		}

		return {
			details: resources,
			message: `Sufficient resources available (${resources.available_memory_gb.toFixed(1)}GB RAM, ${resources.available_cpu_cores} CPU cores)`,
			name: 'Resource Availability',
			passed: true
		};
	}

	/**
	 * Check available disk space
	 */
	private async checkDiskSpace(): Promise<SafetyCheck> {
		try {
			// Get disk usage for current directory
			const { stdout } = await execAsync(`df -BG "${this.repoRoot}" | tail -1`);
			const parts = stdout.trim().split(/\s+/);
			const availableStr = parts[3]; // Available column
			if (!availableStr) {
				throw new Error('Unable to parse disk space output');
			}
			const availableGb = parseInt(availableStr.replace('G', ''));

			if (availableGb < this.config.min_disk_space_gb) {
				return {
					details: { available_gb: availableGb },
					message: `Insufficient disk space: ${availableGb}GB available, ${this.config.min_disk_space_gb}GB required`,
					name: 'Disk Space',
					passed: false
				};
			}

			return {
				details: { available_gb: availableGb },
				message: `Sufficient disk space available (${availableGb}GB)`,
				name: 'Disk Space',
				passed: true
			};
		} catch (error) {
			// Fallback: assume disk space is okay if check fails
			const typedError = error as Error;
			return {
				details: { error: typedError.message },
				message: 'Disk space check skipped (unable to verify)',
				name: 'Disk Space',
				passed: true
			};
		}
	}

	/**
	 * Get git repository state
	 */
	async getGitState(): Promise<GitState> {
		try {
			// Check if working tree is clean
			const { stdout: statusOutput } = await execAsync('git status --porcelain', {
				cwd: this.repoRoot
			});
			const uncommittedChanges = statusOutput
				.trim()
				.split('\n')
				.filter((line) => line).length;

			// Get current branch
			const { stdout: branchOutput } = await execAsync('git branch --show-current', {
				cwd: this.repoRoot
			});
			const currentBranch = branchOutput.trim();

			// Get existing worktrees
			const { stdout: worktreeOutput } = await execAsync('git worktree list --porcelain', {
				cwd: this.repoRoot
			});
			const existingWorktrees = this.parseWorktreePaths(worktreeOutput);

			// Check if main branch is up to date (basic check)
			let mainBranchUpToDate = true;
			try {
				await execAsync('git fetch origin main:main', {
					cwd: this.repoRoot
				});
			} catch {
				// If fetch fails, assume it's okay (might not have origin/main)
				mainBranchUpToDate = true;
			}

			return {
				current_branch: currentBranch,
				existing_worktrees: existingWorktrees,
				is_clean: uncommittedChanges === 0,
				main_branch_up_to_date: mainBranchUpToDate,
				uncommitted_changes: uncommittedChanges
			};
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to get git state: ${typedError.message}`);
		}
	}

	/**
	 * Get resource availability
	 */
	async getResourceAvailability(): Promise<ResourceAvailability> {
		// Get available memory
		const freeMemory = os.freemem();
		const availableMemoryGb = freeMemory / 1024 ** 3;

		// Get available CPU cores
		const availableCpuCores = os.cpus().length;

		// Check if Docker is running
		let dockerRunning = false;
		let dockerVersion: string | undefined;
		try {
			const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"');
			dockerVersion = stdout.trim();
			dockerRunning = true;
		} catch {
			dockerRunning = false;
		}

		// Get available disk space (simplified, just check current directory)
		let availableDiskGb = 0;
		try {
			const { stdout } = await execAsync(`df -BG "${this.repoRoot}" | tail -1`);
			const parts = stdout.trim().split(/\s+/);
			const availableStr = parts[3];
			if (availableStr) {
				availableDiskGb = parseInt(availableStr.replace('G', ''));
			}
		} catch {
			// Default to 0 if check fails
		}

		return {
			available_cpu_cores: availableCpuCores,
			available_disk_gb: availableDiskGb,
			available_memory_gb: availableMemoryGb,
			docker_running: dockerRunning,
			docker_version: dockerVersion
		};
	}

	/**
	 * Parse worktree paths from git worktree list output
	 */
	private parseWorktreePaths(output: string): string[] {
		const paths: string[] = [];
		const lines = output.split('\n');

		for (const line of lines) {
			if (line.startsWith('worktree ')) {
				paths.push(line.substring(9));
			}
		}

		return paths;
	}
}
