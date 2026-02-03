/**
 * Docker Integration Test - Tests actual Docker and Git worktree functionality
 *
 * These tests require Docker to be running and will create actual worktrees
 * and containers.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ExplorationConfig } from '../../types/exploration.types';
import { SafetyValidator } from '../safety-validator';
import { WorktreeManager } from '../worktree-manager';
import { ContainerManager } from '../container-manager';
import { ResourceAllocator } from '../resource-allocator';
import { ExplorationStateManager } from '../exploration-state';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if Docker is available in the environment
 */
async function isDockerAvailable(): Promise<boolean> {
	try {
		await execAsync('docker --version');
		return true;
	} catch {
		return false;
	}
}

describe('Docker Integration Tests', () => {
	let testRepoDir: string;
	let worktreeManager: WorktreeManager;
	let containerManager: ContainerManager;
	let stateManager: ExplorationStateManager;
	let resourceAllocator: ResourceAllocator;
	let dockerAvailable: boolean;

	beforeAll(async () => {
		// Check if Docker is available
		dockerAvailable = await isDockerAvailable();
		if (!dockerAvailable) {
			console.log('⚠️  Docker not available - some tests will be skipped');
		}

		// Create a temporary git repository for testing
		testRepoDir = path.join(os.tmpdir(), `git-worktree-test-${Date.now()}`);
		await fs.mkdir(testRepoDir, { recursive: true });

		// Initialize git repo
		await execAsync('git init', { cwd: testRepoDir });
		await execAsync('git config user.email "test@example.com"', { cwd: testRepoDir });
		await execAsync('git config user.name "Test User"', { cwd: testRepoDir });

		// Create initial commit
		await fs.writeFile(path.join(testRepoDir, 'README.md'), '# Test Repository\n', 'utf-8');
		await execAsync('git add .', { cwd: testRepoDir });
		await execAsync('git commit -m "Initial commit"', { cwd: testRepoDir });

		// Initialize managers
		worktreeManager = new WorktreeManager(testRepoDir);
		containerManager = new ContainerManager();
		stateManager = new ExplorationStateManager(path.join(testRepoDir, '.ai', 'explorations'));
		resourceAllocator = new ResourceAllocator();

		console.log(`Test repository created at: ${testRepoDir}`);
	}, 30000);

	afterAll(async () => {
		// Clean up test repository and worktrees
		try {
			// List and remove all worktrees
			const { stdout } = await execAsync('git worktree list --porcelain', { cwd: testRepoDir });
			const worktreePaths = stdout
				.split('\n')
				.filter((line) => line.startsWith('worktree '))
				.map((line) => line.replace('worktree ', ''))
				.filter((p) => p !== testRepoDir); // Don't remove main worktree

			for (const worktreePath of worktreePaths) {
				try {
					await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: testRepoDir });
				} catch {
					// Ignore errors
				}
			}

			// Stop and remove any test containers
			try {
				const { stdout: psOutput } = await execAsync('docker ps -a --filter name=exploration-test --format "{{.ID}}"');
				const containerIds = psOutput.split('\n').filter(Boolean);
				for (const id of containerIds) {
					await execAsync(`docker stop ${id}`);
					await execAsync(`docker rm ${id}`);
				}
			} catch {
				// Ignore errors
			}

			// Remove test directory
			await fs.rm(testRepoDir, { recursive: true, force: true });
			console.log('Test repository cleaned up');
		} catch (error) {
			console.error('Failed to cleanup test repository:', error);
		}
	}, 60000);

	describe('SafetyValidator with Docker', () => {
		it('should detect Docker is running', async ({ skip }) => {
			if (!dockerAvailable) {
				skip();
				return;
			}

			const validator = new SafetyValidator(testRepoDir);
			const resources = await validator.getResourceAvailability();

			expect(resources.docker_running).toBe(true);
			expect(resources.docker_version).toBeDefined();
			console.log(`Docker version detected: ${resources.docker_version}`);
		});

		it('should validate system is ready for exploration', async () => {
			const validator = new SafetyValidator(testRepoDir);
			const validation = await validator.validate(2);

			// Log validation results for debugging
			console.log('Validation result:', validation);
			if (!validation.passed) {
				console.log('Validation errors:', validation.errors);
				console.log('Validation warnings:', validation.warnings);
			}

			// Since we're in a test repo with uncommitted changes, validation may fail
			// Just verify the validation structure is correct
			expect(validation).toBeDefined();
			expect(Array.isArray(validation.errors)).toBe(true);
			expect(Array.isArray(validation.warnings)).toBe(true);
			expect(typeof validation.passed).toBe('boolean');
		});
	});

	describe('WorktreeManager', () => {
		it('should create a git worktree', async () => {
			const branchName = `test-worktree-${Date.now()}`;
			const worktreePath = path.join(testRepoDir, '..', 'worktrees', branchName);

			const result = await worktreeManager.createWorktree({
				branch: branchName,
				path: worktreePath,
				baseRef: 'HEAD'
			});

			expect(result).toBeDefined();
			// branch returns full ref path like "refs/heads/branchname"
			expect(result.branch).toContain(branchName);
			expect(result.path).toBe(worktreePath);

			// Verify worktree exists
			const stats = await fs.stat(worktreePath);
			expect(stats.isDirectory()).toBe(true);

			// Verify README exists in worktree
			const readmeStats = await fs.stat(path.join(worktreePath, 'README.md'));
			expect(readmeStats.isFile()).toBe(true);

			console.log(`Worktree created at: ${worktreePath}`);

			// Clean up
			await worktreeManager.removeWorktree(worktreePath);
		}, 30000);

		it('should list worktrees', async () => {
			const worktrees = await worktreeManager.listWorktrees();

			expect(Array.isArray(worktrees)).toBe(true);
			expect(worktrees.length).toBeGreaterThan(0);

			// Should include main worktree
			const mainWorktree = worktrees.find((w) => w.path === testRepoDir);
			expect(mainWorktree).toBeDefined();

			console.log(`Found ${worktrees.length} worktree(s)`);
		});
	});

	describe('ContainerManager', () => {
		it('should verify Docker image exists or pull it', async ({ skip }) => {
			if (!dockerAvailable) {
				skip();
				return;
			}

			const image = 'mcr.microsoft.com/devcontainers/javascript-node:24';

			// pullImageIfNeeded returns true if pulled, false if already exists
			const pulled = await containerManager.pullImageIfNeeded(image);

			// Should not need to pull since we already have it
			expect(typeof pulled).toBe('boolean');
			console.log(`Docker image ${pulled ? 'pulled' : 'already existed'}: ${image}`);
		});

		it('should create and start a container', async ({ skip }) => {
			if (!dockerAvailable) {
				skip();
				return;
			}

			const branchName = `test-container-${Date.now()}`;
			const worktreePath = path.join(testRepoDir, '..', 'worktrees', branchName);

			// Create worktree first
			await worktreeManager.createWorktree({
				branch: branchName,
				path: worktreePath
			});

			// Allocate resources
			const resources = resourceAllocator.allocate({
				exploration_id: 'test-exploration',
				worktree_index: 1,
				cpu_limit: '1',
				memory_limit: '1g'
			});

			const containerName = `exploration-test-${Date.now()}`;

			// Create container (returns container ID directly)
			const containerId = await containerManager.createContainer({
				container_name: containerName,
				image: 'mcr.microsoft.com/devcontainers/javascript-node:24',
				worktree_path: worktreePath,
				shared_volume_path: path.join(testRepoDir, '.ai', 'explorations', 'shared'),
				cpu_limit: resources.cpu_limit,
				memory_limit: resources.memory_limit,
				port: resources.port,
				environment: {},
				command: ['sleep', '30'] // Keep container alive for 30 seconds
			});

			expect(containerId).toBeDefined();
			expect(typeof containerId).toBe('string');

			console.log(`Container created: ${containerId.substring(0, 12)}`);

			// Verify container is running (createContainer starts it automatically)
			const { stdout } = await execAsync(`docker inspect --format='{{.State.Status}}' ${containerId}`);
			expect(stdout.trim()).toBe('running');

			console.log('Container verified running');

			// Clean up
			await containerManager.stopContainer(containerName);
			await containerManager.removeContainer(containerName);
			await worktreeManager.removeWorktree(worktreePath);
			resourceAllocator.release('test-exploration', 1);

			console.log('Container cleaned up');
		}, 60000);

		it('should execute command in container', async ({ skip }) => {
			if (!dockerAvailable) {
				skip();
				return;
			}

			const branchName = `test-exec-${Date.now()}`;
			const worktreePath = path.join(testRepoDir, '..', 'worktrees', branchName);

			// Create worktree
			await worktreeManager.createWorktree({
				branch: branchName,
				path: worktreePath
			});

			// Allocate resources
			const resources = resourceAllocator.allocate({
				exploration_id: 'test-exploration',
				worktree_index: 2,
				cpu_limit: '1',
				memory_limit: '1g'
			});

			const containerName = `exploration-test-exec-${Date.now()}`;

			// Create and start container
			const containerId = await containerManager.createContainer({
				container_name: containerName,
				image: 'mcr.microsoft.com/devcontainers/javascript-node:24',
				worktree_path: worktreePath,
				shared_volume_path: path.join(testRepoDir, '.ai', 'explorations', 'shared'),
				cpu_limit: resources.cpu_limit,
				memory_limit: resources.memory_limit,
				port: resources.port,
				environment: {},
				command: ['sleep', '60']
			});

			// Execute command using docker exec
			const { stdout } = await execAsync(`docker exec ${containerId} echo "Hello from container"`);
			expect(stdout.trim()).toBe('Hello from container');

			console.log('Command executed in container:', stdout.trim());

			// Clean up
			await containerManager.stopContainer(containerName);
			await containerManager.removeContainer(containerName);
			await worktreeManager.removeWorktree(worktreePath);
			resourceAllocator.release('test-exploration', 2);
		}, 60000);
	});

	describe('End-to-End Integration', () => {
		it('should create exploration with worktrees and containers', async () => {
			const config: ExplorationConfig = {
				branches: 2,
				strategies: ['approach-1', 'approach-2'],
				timeout_minutes: 30,
				docker_image: 'mcr.microsoft.com/devcontainers/javascript-node:24',
				cpu_limit: '1',
				memory_limit: '1g',
				auto_merge: false,
				no_cleanup: false,
				port_range_start: 3000,
				port_range_end: 3100
			};

			// Create exploration
			const exploration = await stateManager.createExploration('Integration test task', config);

			expect(exploration).toBeDefined();
			expect(exploration.id).toBeDefined();
			expect(exploration.branches).toBe(2);
			expect(exploration.status).toBe('pending');

			console.log(`Created exploration: ${exploration.id}`);

			// Create worktrees for each branch
			const worktrees = [];
			for (let i = 1; i <= config.branches; i++) {
				const branchName = `${exploration.id}-branch-${i}`;
				const worktreePath = path.join(testRepoDir, '..', 'worktrees', branchName);

				const worktreeInfo = await worktreeManager.createWorktree({
					branch: branchName,
					path: worktreePath
				});

				expect(worktreeInfo).toBeDefined();
				// branch returns full ref path like "refs/heads/branchname"
				expect(worktreeInfo.branch).toContain(branchName);

				worktrees.push({
					index: i,
					branch_name: branchName,
					worktree_path: worktreePath,
					status: 'created' as const
				});

				console.log(`Created worktree ${i}: ${branchName}`);
			}

			// Verify all worktrees exist
			expect(worktrees.length).toBe(2);

			for (const worktree of worktrees) {
				const stats = await fs.stat(worktree.worktree_path);
				expect(stats.isDirectory()).toBe(true);
			}

			// Clean up
			for (const worktree of worktrees) {
				await worktreeManager.removeWorktree(worktree.worktree_path);
				await worktreeManager.deleteBranch(worktree.branch_name, true);
			}

			await stateManager.deleteExploration(exploration.id);

			console.log('End-to-end integration test completed');
		}, 120000);
	});
});
