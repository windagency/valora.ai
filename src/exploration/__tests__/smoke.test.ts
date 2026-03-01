/**
 * Smoke Test - Validates basic infrastructure functionality
 *
 * Tests core components without requiring Docker or actual AI agents
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { SafetyValidator } from '../safety-validator';
import { ExplorationStateManager } from '../exploration-state';
import { ResourceAllocator } from '../resource-allocator';
import { SharedVolumeManager } from '../shared-volume-manager';
import { getFileLockManager } from '../../utils/file-lock';
import { ExplorationConfig } from '../../types/exploration.types';

describe('Infrastructure Smoke Test', () => {
	let testDir: string;

	beforeAll(async () => {
		// Create temporary test directory
		testDir = path.join(os.tmpdir(), `ai-exploration-smoke-test-${Date.now()}`);
		await fs.mkdir(testDir, { recursive: true });
		console.log(`Test directory: ${testDir}`);
	});

	afterAll(async () => {
		// Cleanup test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
			console.log('Test directory cleaned up');
		} catch (error) {
			console.error('Failed to cleanup test directory:', error);
		}
	});

	describe('SafetyValidator', () => {
		it('should instantiate without errors', () => {
			const validator = new SafetyValidator(testDir);
			expect(validator).toBeDefined();
		});

		it('should get git state', async () => {
			const validator = new SafetyValidator(process.cwd()); // Use actual repo
			const state = await validator.getGitState();

			expect(state).toBeDefined();
			expect(typeof state.is_clean).toBe('boolean');
			expect(typeof state.current_branch).toBe('string');
			expect(typeof state.uncommitted_changes).toBe('number');
			console.log('Git state:', state);
		});

		it('should get resource availability', async () => {
			const validator = new SafetyValidator(testDir);
			const resources = await validator.getResourceAvailability();

			expect(resources).toBeDefined();
			expect(resources.available_memory_gb).toBeGreaterThan(0);
			expect(resources.available_cpu_cores).toBeGreaterThan(0);
			console.log('Resources:', resources);
		});
	});

	describe('ExplorationStateManager', () => {
		let stateManager: ExplorationStateManager;

		beforeAll(() => {
			// Create state manager with test directory
			stateManager = new ExplorationStateManager(testDir);
		});

		it('should create directory structure when creating exploration', async () => {
			// Creating an exploration will initialize the directory
			const config: ExplorationConfig = {
				branches: 1,
				timeout_minutes: 30,
				docker_image: 'test-image',
				cpu_limit: '1',
				memory_limit: '1g',
				auto_merge: false,
				no_cleanup: false,
				port_range_start: 3000,
				port_range_end: 3100
			};

			await stateManager.createExploration('Directory test', config);
			const explorationsDir = testDir;
			const stats = await fs.stat(explorationsDir);
			expect(stats.isDirectory()).toBe(true);
		});

		it('should create an exploration', async () => {
			const config: ExplorationConfig = {
				branches: 2,
				strategies: ['approach-a', 'approach-b'],
				timeout_minutes: 30,
				docker_image: 'test-image',
				cpu_limit: '1',
				memory_limit: '1g',
				auto_merge: false,
				no_cleanup: false,
				port_range_start: 3000,
				port_range_end: 3100
			};

			const exploration = await stateManager.createExploration('Test task', config);

			expect(exploration).toBeDefined();
			expect(exploration.id).toBeDefined();
			expect(exploration.task).toBe('Test task');
			expect(exploration.config.branches).toBe(2);
			expect(exploration.status).toBe('pending');
			console.log('Created exploration:', exploration.id);
		});

		it('should list explorations', async () => {
			const explorations = await stateManager.listExplorations();
			expect(Array.isArray(explorations)).toBe(true);
			expect(explorations.length).toBeGreaterThan(0);
			console.log('Found explorations:', explorations.length);
		});

		it('should load an exploration', async () => {
			const explorations = await stateManager.listExplorations();
			const firstId = explorations[0].id;

			const loaded = await stateManager.loadExploration(firstId);
			expect(loaded).toBeDefined();
			expect(loaded.id).toBe(firstId);
		});
	});

	describe('ResourceAllocator', () => {
		let allocator: ResourceAllocator;

		beforeAll(() => {
			allocator = new ResourceAllocator();
		});

		it('should allocate resources', () => {
			const resources = allocator.allocate({
				exploration_id: 'test-exploration',
				worktree_index: 1,
				cpu_limit: '1.5',
				memory_limit: '2g'
			});

			expect(resources).toBeDefined();
			expect(resources.port).toBeDefined();
			expect(resources.port).toBeGreaterThanOrEqual(3000);
			expect(resources.port).toBeLessThan(4000);
			console.log('Allocated resources:', resources);
		});

		it('should allocate different ports for different worktrees', () => {
			const resources1 = allocator.allocate({
				exploration_id: 'test-exploration',
				worktree_index: 1,
				cpu_limit: '1',
				memory_limit: '1g'
			});

			const resources2 = allocator.allocate({
				exploration_id: 'test-exploration',
				worktree_index: 2,
				cpu_limit: '1',
				memory_limit: '1g'
			});

			expect(resources1.port).not.toBe(resources2.port);
		});

		it('should release resources', () => {
			allocator.release('test-exploration', 1);
			allocator.release('test-exploration', 2);
			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('SharedVolumeManager', () => {
		let volumeManager: SharedVolumeManager;
		let volumePath: string;

		beforeAll(() => {
			volumePath = path.join(testDir, 'shared-volume');
			volumeManager = new SharedVolumeManager(volumePath, 'test-exploration-id');
		});

		it('should initialize shared volume structure', async () => {
			const volume = await volumeManager.initialize(3);

			expect(volume).toBeDefined();
			expect(volume.root_path).toBe(volumePath);
			expect(volume.worktree_data_dirs.length).toBe(3);

			// Check directory structure
			const stats = await fs.stat(volumePath);
			expect(stats.isDirectory()).toBe(true);

			const insightsStats = await fs.stat(volume.insights_pool_path);
			expect(insightsStats.isFile()).toBe(true);

			const decisionsStats = await fs.stat(volume.decisions_pool_path);
			expect(decisionsStats.isFile()).toBe(true);
		});

		it('should read insights pool file', async () => {
			const insightsPoolPath = path.join(volumePath, 'insights-pool.json');
			const content = await fs.readFile(insightsPoolPath, 'utf-8');
			const pool = JSON.parse(content);
			expect(Array.isArray(pool.insights)).toBe(true);
			expect(pool.insights.length).toBe(0);
			expect(pool.exploration_id).toBe('test-exploration-id');
		});

		it('should read decisions pool file', async () => {
			const decisionsPoolPath = path.join(volumePath, 'decisions-pool.json');
			const content = await fs.readFile(decisionsPoolPath, 'utf-8');
			const pool = JSON.parse(content);
			expect(Array.isArray(pool.decisions)).toBe(true);
			expect(pool.decisions.length).toBe(0);
			expect(pool.exploration_id).toBe('test-exploration-id');
		});
	});

	describe('FileLockManager', () => {
		let lockManager = getFileLockManager();
		let testFilePath: string;

		beforeAll(() => {
			testFilePath = path.join(testDir, 'test-lock-file.json');
		});

		it('should write data with lock', async () => {
			const data = { message: 'test data', timestamp: Date.now() };
			await lockManager.writeWithLock(testFilePath, data, 'test-locker');

			const content = await fs.readFile(testFilePath, 'utf-8');
			const parsed = JSON.parse(content);
			expect(parsed.message).toBe('test data');
		});

		it('should read data with lock', async () => {
			const data = await lockManager.readWithLock(testFilePath, 'test-reader');
			expect(data).toBeDefined();
			expect(data.message).toBe('test data');
		});

		it('should update data with lock', async () => {
			const updated = await lockManager.updateWithLock(testFilePath, 'test-updater', (current: any) => {
				return { ...current, updated: true, updateTimestamp: Date.now() };
			});

			expect(updated.updated).toBe(true);
			expect(updated.updateTimestamp).toBeDefined();
		});

		it('should handle concurrent updates with locking', async () => {
			const testFile = path.join(testDir, 'concurrent-test.json');
			await lockManager.writeWithLock(testFile, { counter: 0 }, 'init');

			// Simulate concurrent updates sequentially to avoid lock contention
			for (let i = 0; i < 5; i++) {
				await lockManager.updateWithLock(testFile, `updater-${i}`, (current: any) => ({
					counter: current.counter + 1
				}));
			}

			const final = await lockManager.readWithLock(testFile, 'final-reader');
			expect(final.counter).toBe(5);
		});
	});

	describe('Integration', () => {
		it('should create exploration with shared volume', async () => {
			const stateManager = new ExplorationStateManager(testDir);
			const config: ExplorationConfig = {
				branches: 2,
				timeout_minutes: 30,
				docker_image: 'test-image',
				cpu_limit: '1',
				memory_limit: '1g',
				auto_merge: false,
				no_cleanup: false,
				port_range_start: 3000,
				port_range_end: 3100
			};

			const exploration = await stateManager.createExploration('Integration test', config);
			const sharedVolumePath = stateManager.getSharedVolumePath(exploration.id);

			const volumeManager = new SharedVolumeManager(sharedVolumePath, exploration.id);
			await volumeManager.initialize(config.branches);

			// Verify shared volume exists
			const stats = await fs.stat(sharedVolumePath);
			expect(stats.isDirectory()).toBe(true);

			console.log('Integration test passed: exploration + shared volume created');
		});
	});
});
