/**
 * Container Manager - Docker container lifecycle management
 *
 * Handles creating, monitoring, and destroying Docker containers for explorations
 */

import type { ContainerStats } from 'types/exploration.types';

import { exec } from 'child_process';
import { getLogger } from 'output/logger';
import * as path from 'path';
import { promisify } from 'util';
import { formatErrorMessage } from 'utils/error-handler';

const execAsync = promisify(exec);
const logger = getLogger();

export interface ContainerConfig {
	command?: string[];
	container_name: string;
	cpu_limit: string;
	environment: Record<string, string>;
	image: string;
	memory_limit: string;
	port?: number;
	shared_volume_path: string;
	worktree_path: string;
}

export interface ContainerInfo {
	container_id: string;
	container_name: string;
	exit_code?: number;
	finished_at?: string;
	started_at?: string;
	status: 'created' | 'dead' | 'exited' | 'paused' | 'running';
}

export class ContainerManager {
	private containers: Map<string, ContainerInfo>;

	constructor() {
		this.containers = new Map();
	}

	/**
	 * Create and start a container
	 */
	async createContainer(config: ContainerConfig): Promise<string> {
		const {
			command,
			container_name: containerName,
			cpu_limit: cpuLimit,
			environment,
			image,
			memory_limit: memoryLimit,
			port,
			shared_volume_path: sharedVolumePath,
			worktree_path: worktreePath
		} = config;

		// Build docker run command
		const dockerArgs: string[] = [
			'run',
			'-d', // Detached mode
			`--name ${containerName}`,
			`--cpus=${cpuLimit}`,
			`--memory=${memoryLimit}`,
			`-v ${path.resolve(worktreePath)}:/workspace`,
			`-v ${path.resolve(sharedVolumePath)}:/shared`,
			'-w /workspace' // Set working directory
		];

		// Add port mapping if specified
		if (port) {
			dockerArgs.push(`-p ${port}:${port}`);
		}

		// Add environment variables
		for (const [key, value] of Object.entries(environment)) {
			dockerArgs.push(`-e ${key}="${value}"`);
		}

		// Add image
		dockerArgs.push(image);

		// Add command if specified
		if (command && command.length > 0) {
			dockerArgs.push(...command.map((arg) => `"${arg}"`));
		}

		const dockerCommand = `docker ${dockerArgs.join(' ')}`;

		try {
			logger.debug(`Creating container: ${dockerCommand}`);
			const { stderr, stdout } = await execAsync(dockerCommand);

			if (stderr && !stderr.includes('WARNING')) {
				logger.warn(`Docker stderr: ${stderr}`);
			}

			const containerId = stdout.trim();

			// Store container info
			this.containers.set(containerName, {
				container_id: containerId,
				container_name: containerName,
				started_at: new Date().toISOString(),
				status: 'running'
			});

			logger.info(`Container ${containerName} created: ${containerId.substring(0, 12)}`);
			return containerId;
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to create container ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Create multiple containers in parallel
	 */
	async createMultipleContainers(configs: ContainerConfig[]): Promise<string[]> {
		const promises = configs.map((config) => this.createContainer(config));
		return Promise.all(promises);
	}

	/**
	 * Stop a container
	 */
	async stopContainer(containerName: string, timeout: number = 30): Promise<void> {
		try {
			logger.debug(`Stopping container: ${containerName} (timeout: ${timeout}s)`);
			await execAsync(`docker stop -t ${timeout} ${containerName}`);

			// Update container info
			const info = this.containers.get(containerName);
			if (info) {
				info.status = 'exited';
				info.finished_at = new Date().toISOString();
			}

			logger.info(`Container ${containerName} stopped`);
		} catch (error: unknown) {
			// If container doesn't exist or already stopped, that's okay
			const errorMessage = formatErrorMessage(error);
			if (!errorMessage.includes('No such container') && !errorMessage.includes('is not running')) {
				throw new Error(`Failed to stop container ${containerName}: ${errorMessage}`);
			}
			logger.warn(`Container ${containerName} not found or already stopped`);
		}
	}

	/**
	 * Stop multiple containers in parallel
	 */
	async stopMultipleContainers(containerNames: string[], timeout: number = 30): Promise<void> {
		const promises = containerNames.map((name) => this.stopContainer(name, timeout));
		await Promise.all(promises);
	}

	/**
	 * Remove a container
	 */
	async removeContainer(containerName: string, force: boolean = false): Promise<void> {
		const forceFlag = force ? '-f' : '';
		const command = `docker rm ${forceFlag} ${containerName}`.trim();

		try {
			logger.debug(`Removing container: ${containerName}`);
			await execAsync(command);

			// Remove from tracking
			this.containers.delete(containerName);

			logger.info(`Container ${containerName} removed`);
		} catch (error: unknown) {
			// If container doesn't exist, that's okay
			const errorMessage = formatErrorMessage(error);
			if (!errorMessage.includes('No such container')) {
				throw new Error(`Failed to remove container ${containerName}: ${errorMessage}`);
			}
			logger.warn(`Container ${containerName} not found`);
		}
	}

	/**
	 * Remove multiple containers in parallel
	 */
	async removeMultipleContainers(containerNames: string[], force: boolean = false): Promise<void> {
		const promises = containerNames.map((name) => this.removeContainer(name, force));
		await Promise.all(promises);
	}

	/**
	 * Get container status
	 */
	async getContainerStatus(containerName: string): Promise<ContainerInfo> {
		try {
			const { stdout } = await execAsync(
				`docker inspect --format="{{.State.Status}}|{{.State.ExitCode}}|{{.State.StartedAt}}|{{.State.FinishedAt}}" ${containerName}`
			);

			const parts = stdout.trim().split('|');
			const status = parts[0] ?? 'exited';
			const exitCode = parts[1] ?? '0';
			const startedAt = parts[2] ?? '0001-01-01T00:00:00Z';
			const finishedAt = parts[3] ?? '0001-01-01T00:00:00Z';

			const info: ContainerInfo = {
				container_id: containerName, // Will be replaced with actual ID below
				container_name: containerName,
				exit_code: exitCode !== '0' ? parseInt(exitCode) : undefined,
				finished_at: finishedAt !== '0001-01-01T00:00:00Z' ? finishedAt : undefined,
				started_at: startedAt !== '0001-01-01T00:00:00Z' ? startedAt : undefined,
				status: status as ContainerInfo['status']
			};

			// Get actual container ID
			const { stdout: idOutput } = await execAsync(`docker inspect --format="{{.Id}}" ${containerName}`);
			info.container_id = idOutput.trim();

			// Update cached info
			this.containers.set(containerName, info);

			return info;
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to get container status for ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Get container statistics
	 */
	async getContainerStats(containerName: string, worktreeIndex: number): Promise<ContainerStats> {
		try {
			// Get container stats (no-stream for single snapshot)
			const { stdout } = await execAsync(
				`docker stats ${containerName} --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}"`
			);

			const parts = stdout.trim().split('|');
			const containerId = parts[0] ?? '';
			const cpuPercStr = parts[1] ?? '0%';
			const memUsageStr = parts[2] ?? '0MiB / 0MiB';

			// Parse CPU percentage (e.g., "15.23%")
			const cpuUsagePercent = parseFloat(cpuPercStr.replace('%', ''));

			// Parse memory usage (e.g., "256MiB / 2GiB")
			const memParts = memUsageStr.split(' / ');
			const memUsageMb = this.parseMemoryString(memParts[0] ?? '0MiB');
			const memLimitMb = this.parseMemoryString(memParts[1] ?? '0MiB');

			// Get container status
			const info = await this.getContainerStatus(containerName);

			return {
				container_id: containerId,
				cpu_usage_percent: cpuUsagePercent,
				exit_code: info.exit_code,
				memory_limit_mb: memLimitMb,
				memory_usage_mb: memUsageMb,
				status: info.status === 'running' ? 'running' : info.status === 'exited' ? 'exited' : 'stopped',
				uptime_seconds: this.calculateUptime(info.started_at, info.finished_at),
				worktree_index: worktreeIndex
			};
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to get container stats for ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Get statistics for multiple containers
	 */
	async getMultipleContainerStats(containerNames: string[], worktreeIndices: number[]): Promise<ContainerStats[]> {
		const promises = containerNames.map((name, index) => this.getContainerStats(name, worktreeIndices[index] ?? 0));
		return Promise.all(promises);
	}

	/**
	 * Get container logs
	 */
	async getContainerLogs(containerName: string, tail: number = 100): Promise<string> {
		try {
			const { stdout } = await execAsync(`docker logs --tail ${tail} ${containerName}`);
			return stdout;
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to get logs for ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Execute a command in a running container
	 */
	async execInContainer(containerName: string, command: string[]): Promise<{ stderr: string; stdout: string }> {
		try {
			const dockerCommand = `docker exec ${containerName} ${command.join(' ')}`;
			const { stderr, stdout } = await execAsync(dockerCommand);
			return { stderr, stdout };
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to execute command in ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Check if a container exists
	 */
	async containerExists(containerName: string): Promise<boolean> {
		try {
			await execAsync(`docker inspect ${containerName}`);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Wait for container to exit
	 */
	async waitForContainer(containerName: string, timeout?: number): Promise<number> {
		try {
			const timeoutArg = timeout ? `-t ${timeout}` : '';
			const { stdout } = await execAsync(`docker wait ${timeoutArg} ${containerName}`.trim());
			return parseInt(stdout.trim());
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to wait for container ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Pull Docker image if not present
	 */
	async pullImageIfNeeded(image: string): Promise<boolean> {
		try {
			// Check if image exists locally
			await execAsync(`docker image inspect ${image}`);
			logger.debug(`Image ${image} already exists locally`);
			return false;
		} catch {
			// Image doesn't exist, pull it
			logger.info(`Pulling Docker image: ${image}`);
			try {
				await execAsync(`docker pull ${image}`);
				logger.info(`Successfully pulled image: ${image}`);
				return true;
			} catch (error: unknown) {
				const errorMessage = formatErrorMessage(error);
				throw new Error(`Failed to pull image ${image}: ${errorMessage}`);
			}
		}
	}

	/**
	 * Pause a container
	 */
	async pauseContainer(containerName: string): Promise<void> {
		try {
			await execAsync(`docker pause ${containerName}`);
			const info = this.containers.get(containerName);
			if (info) {
				info.status = 'paused';
			}
			logger.info(`Container ${containerName} paused`);
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to pause container ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Unpause a container
	 */
	async unpauseContainer(containerName: string): Promise<void> {
		try {
			await execAsync(`docker unpause ${containerName}`);
			const info = this.containers.get(containerName);
			if (info) {
				info.status = 'running';
			}
			logger.info(`Container ${containerName} unpaused`);
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			throw new Error(`Failed to unpause container ${containerName}: ${errorMessage}`);
		}
	}

	/**
	 * Kill a container (force stop)
	 */
	async killContainer(containerName: string, signal: string = 'SIGKILL'): Promise<void> {
		try {
			await execAsync(`docker kill -s ${signal} ${containerName}`);
			const info = this.containers.get(containerName);
			if (info) {
				info.status = 'exited';
				info.finished_at = new Date().toISOString();
			}
			logger.info(`Container ${containerName} killed with ${signal}`);
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			if (!errorMessage.includes('No such container')) {
				throw new Error(`Failed to kill container ${containerName}: ${errorMessage}`);
			}
		}
	}

	/**
	 * Get all tracked containers
	 */
	getTrackedContainers(): ContainerInfo[] {
		return Array.from(this.containers.values());
	}

	/**
	 * Clear tracking for a container
	 */
	untrackContainer(containerName: string): void {
		this.containers.delete(containerName);
	}

	/**
	 * Clear all tracking
	 */
	clearTracking(): void {
		this.containers.clear();
	}

	/**
	 * Parse memory string (e.g., "256MiB", "2GiB") to MB
	 */
	private parseMemoryString(memStr: string): number {
		const match = memStr.match(/^([\d.]+)(MiB|GiB|KiB|B)$/);
		if (!match) {
			return 0;
		}

		const value = match[1] ? parseFloat(match[1]) : 0;
		const unit = match[2] ?? 'MiB';

		const unitMultipliers: Record<string, number> = {
			B: 1 / (1024 * 1024),
			GiB: 1024,
			KiB: 1 / 1024,
			MiB: 1
		};

		return value * (unitMultipliers[unit] ?? 0);
	}

	/**
	 * Calculate uptime in seconds
	 */
	private calculateUptime(startedAt?: string, finishedAt?: string): number {
		if (!startedAt) {
			return 0;
		}

		const start = new Date(startedAt);
		const end = finishedAt ? new Date(finishedAt) : new Date();

		return Math.floor((end.getTime() - start.getTime()) / 1000);
	}
}
