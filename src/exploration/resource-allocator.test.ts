import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
	execSync: (...args: unknown[]) => mockExecSync(...args)
}));

import { ResourceAllocator } from './resource-allocator';

describe('ResourceAllocator', () => {
	let allocator: ResourceAllocator;

	beforeEach(() => {
		mockExecSync.mockReturnValue('');
		allocator = new ResourceAllocator(3000, 3002);
	});

	describe('allocate', () => {
		it('assigns a port from the configured range and a derived container name', () => {
			const resources = allocator.allocate({
				cpu_limit: '1',
				exploration_id: 'exp-1',
				memory_limit: '1g',
				worktree_index: 0
			});

			expect(resources).toEqual({
				container_name: 'exploration-exp-1-0',
				cpu_limit: '1',
				memory_limit: '1g',
				port: 3000
			});
		});

		it('assigns distinct ports to successive allocations', () => {
			const first = allocator.allocate({
				cpu_limit: '1',
				exploration_id: 'exp-1',
				memory_limit: '1g',
				worktree_index: 0
			});
			const second = allocator.allocate({
				cpu_limit: '1',
				exploration_id: 'exp-1',
				memory_limit: '1g',
				worktree_index: 1
			});

			expect(first.port).not.toBe(second.port);
		});

		it('throws once the port range is exhausted', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 1 });
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 2 });

			expect(() =>
				allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 3 })
			).toThrow(/No available ports/);
		});

		it('skips a port already mapped by a real Docker container', () => {
			mockExecSync.mockReturnValue('0.0.0.0:3000->3000/tcp\n');

			const resources = allocator.allocate({
				cpu_limit: '1',
				exploration_id: 'exp-1',
				memory_limit: '1g',
				worktree_index: 0
			});

			expect(resources.port).toBe(3001);
		});

		it('falls back to treating no Docker ports as allocated when the docker command fails', () => {
			mockExecSync.mockImplementation(() => {
				throw new Error('docker: command not found');
			});

			const resources = allocator.allocate({
				cpu_limit: '1',
				exploration_id: 'exp-1',
				memory_limit: '1g',
				worktree_index: 0
			});

			expect(resources.port).toBe(3000);
		});
	});

	describe('allocateMultiple', () => {
		it('allocates one resource set per request, each with a distinct port', () => {
			const results = allocator.allocateMultiple([
				{ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 },
				{ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 1 }
			]);

			expect(results).toHaveLength(2);
			expect(new Set(results.map((r) => r.port)).size).toBe(2);
		});
	});

	describe('release / releaseAll', () => {
		it('release() frees the port and forgets the allocation', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });

			allocator.release('exp-1', 0);

			expect(allocator.getAllocated('exp-1', 0)).toBeNull();
			expect(allocator.isPortAvailable(3000)).toBe(true);
		});

		it('release() on an unknown allocation is a safe no-op', () => {
			expect(() => allocator.release('never-allocated', 0)).not.toThrow();
		});

		it('releaseAll() frees every allocation for the given exploration, leaving others untouched', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 1 });
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-2', memory_limit: '1g', worktree_index: 0 });

			allocator.releaseAll('exp-1');

			expect(allocator.getAllAllocated('exp-1')).toEqual([]);
			expect(allocator.getAllAllocated('exp-2')).toHaveLength(1);
		});
	});

	describe('getAllocated / getAllAllocated', () => {
		it('returns null for an unallocated worktree', () => {
			expect(allocator.getAllocated('exp-1', 0)).toBeNull();
		});

		it('returns every allocation belonging to an exploration', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });
			allocator.allocate({ cpu_limit: '2', exploration_id: 'exp-1', memory_limit: '2g', worktree_index: 1 });

			expect(allocator.getAllAllocated('exp-1')).toHaveLength(2);
		});
	});

	describe('canAllocate / getAvailablePortCount / getStats', () => {
		it('canAllocate is true when enough ports remain, false once exhausted', () => {
			expect(allocator.canAllocate(3)).toBe(true);
			expect(allocator.canAllocate(4)).toBe(false);
		});

		it('getAvailablePortCount decreases as ports are allocated', () => {
			expect(allocator.getAvailablePortCount()).toBe(3);
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });
			expect(allocator.getAvailablePortCount()).toBe(2);
		});

		it('getStats reports total/allocated/available ports and active container count', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });

			expect(allocator.getStats()).toEqual({
				active_containers: 1,
				allocated_ports: 1,
				available_ports: 2,
				total_ports: 3
			});
		});
	});

	describe('reservePort / isPortAvailable / getAllocatedPorts / getAvailablePorts', () => {
		it('reservePort succeeds for an available port in range and marks it unavailable', () => {
			expect(allocator.reservePort(3001)).toBe(true);
			expect(allocator.isPortAvailable(3001)).toBe(false);
		});

		it('reservePort returns false for a port already allocated', () => {
			allocator.reservePort(3001);

			expect(allocator.reservePort(3001)).toBe(false);
		});

		it('reservePort throws for a port outside the configured range', () => {
			expect(() => allocator.reservePort(9999)).toThrow(/outside the allowed range/);
		});

		it('getAllocatedPorts / getAvailablePorts partition the full range', () => {
			allocator.reservePort(3001);

			expect(allocator.getAllocatedPorts()).toEqual([3001]);
			expect(allocator.getAvailablePorts()).toEqual([3000, 3002]);
		});
	});

	describe('reset', () => {
		it('clears all allocated ports and containers', () => {
			allocator.allocate({ cpu_limit: '1', exploration_id: 'exp-1', memory_limit: '1g', worktree_index: 0 });

			allocator.reset();

			expect(allocator.getAvailablePortCount()).toBe(3);
			expect(allocator.getAllAllocated('exp-1')).toEqual([]);
		});
	});

	describe('static validateCpuLimit', () => {
		it.each([
			['0.5', true],
			['1', true],
			['64', true],
			['0', false],
			['-1', false],
			['65', false],
			['not-a-number', false]
		])('validateCpuLimit(%s) -> %s', (input, expected) => {
			expect(ResourceAllocator.validateCpuLimit(input)).toBe(expected);
		});
	});

	describe('static validateMemoryLimit', () => {
		it.each([
			['256m', true],
			['32768m', true],
			['1g', true],
			['32g', true],
			['255m', false],
			['33g', false],
			['0g', false],
			['1024k', false],
			['bogus', false]
		])('validateMemoryLimit(%s) -> %s', (input, expected) => {
			expect(ResourceAllocator.validateMemoryLimit(input)).toBe(expected);
		});
	});

	describe('static memoryLimitToBytes / memoryLimitToMB', () => {
		it('converts megabytes to bytes', () => {
			expect(ResourceAllocator.memoryLimitToBytes('512m')).toBe(512 * 1024 * 1024);
		});

		it('converts gigabytes to bytes', () => {
			expect(ResourceAllocator.memoryLimitToBytes('2g')).toBe(2 * 1024 * 1024 * 1024);
		});

		it('converts to megabytes', () => {
			expect(ResourceAllocator.memoryLimitToMB('1g')).toBe(1024);
		});

		it('throws for an unrecognised format', () => {
			expect(() => ResourceAllocator.memoryLimitToBytes('2tb')).toThrow(/Invalid memory limit format/);
		});
	});

	describe('static formatMemoryLimit', () => {
		it('formats sub-gigabyte byte counts in megabytes', () => {
			expect(ResourceAllocator.formatMemoryLimit(512 * 1024 * 1024)).toBe('512m');
		});

		it('formats gigabyte-scale byte counts in gigabytes, rounded to 1 decimal', () => {
			expect(ResourceAllocator.formatMemoryLimit(1.5 * 1024 * 1024 * 1024)).toBe('1.5g');
		});
	});
});
