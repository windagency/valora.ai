/**
 * Resource Allocator - Port, CPU, and memory allocation for explorations
 *
 * Manages resource allocation to prevent conflicts between parallel explorations
 */

import type { AllocatedResources } from 'types/exploration.types';

export interface AllocationRequest {
	cpu_limit: string; // e.g., "1.5"
	exploration_id: string;
	memory_limit: string; // e.g., "2g"
	worktree_index: number;
}

export interface ResourcePool {
	allocated_containers: Map<string, AllocatedResources>;
	allocated_ports: Set<number>;
	port_range_end: number;
	port_range_start: number;
}

export class ResourceAllocator {
	private pool: ResourcePool;

	constructor(portRangeStart: number = 3000, portRangeEnd: number = 3100) {
		this.pool = {
			allocated_containers: new Map(),
			allocated_ports: new Set(),
			port_range_end: portRangeEnd,
			port_range_start: portRangeStart
		};
	}

	/**
	 * Allocate resources for a worktree
	 */
	allocate(request: AllocationRequest): AllocatedResources {
		const {
			cpu_limit: cpuLimit,
			exploration_id: explorationId,
			memory_limit: memoryLimit,
			worktree_index: worktreeIndex
		} = request;

		// Allocate a unique port
		const port = this.allocatePort();

		// Generate container name
		const containerName = `exploration-${explorationId}-${worktreeIndex}`;

		const resources: AllocatedResources = {
			container_name: containerName,
			cpu_limit: cpuLimit,
			memory_limit: memoryLimit,
			port
		};

		// Track allocation
		const allocationKey = `${explorationId}-${worktreeIndex}`;
		this.pool.allocated_containers.set(allocationKey, resources);

		return resources;
	}

	/**
	 * Allocate multiple resources for parallel worktrees
	 */
	allocateMultiple(requests: AllocationRequest[]): AllocatedResources[] {
		return requests.map((request) => this.allocate(request));
	}

	/**
	 * Release resources for a worktree
	 */
	release(explorationId: string, worktreeIndex: number): void {
		const allocationKey = `${explorationId}-${worktreeIndex}`;
		const resources = this.pool.allocated_containers.get(allocationKey);

		if (resources?.port) {
			// Release port back to pool
			this.pool.allocated_ports.delete(resources.port);
		}

		// Remove allocation
		this.pool.allocated_containers.delete(allocationKey);
	}

	/**
	 * Release all resources for an exploration
	 */
	releaseAll(explorationId: string): void {
		const keysToDelete: string[] = [];

		// Find all allocations for this exploration
		for (const [key, resources] of this.pool.allocated_containers.entries()) {
			if (key.startsWith(`${explorationId}-`)) {
				if (resources.port) {
					this.pool.allocated_ports.delete(resources.port);
				}
				keysToDelete.push(key);
			}
		}

		// Delete allocations
		for (const key of keysToDelete) {
			this.pool.allocated_containers.delete(key);
		}
	}

	/**
	 * Get allocated resources for a worktree
	 */
	getAllocated(explorationId: string, worktreeIndex: number): AllocatedResources | null {
		const allocationKey = `${explorationId}-${worktreeIndex}`;
		return this.pool.allocated_containers.get(allocationKey) ?? null;
	}

	/**
	 * Get all allocated resources for an exploration
	 */
	getAllAllocated(explorationId: string): AllocatedResources[] {
		const resources: AllocatedResources[] = [];

		for (const [key, res] of this.pool.allocated_containers.entries()) {
			if (key.startsWith(`${explorationId}-`)) {
				resources.push(res);
			}
		}

		return resources;
	}

	/**
	 * Check if resources are available for N branches
	 */
	canAllocate(branches: number): boolean {
		const availablePorts = this.getAvailablePortCount();
		return availablePorts >= branches;
	}

	/**
	 * Get number of available ports
	 */
	getAvailablePortCount(): number {
		const totalPorts = this.pool.port_range_end - this.pool.port_range_start + 1;
		const usedPorts = this.pool.allocated_ports.size;
		return totalPorts - usedPorts;
	}

	/**
	 * Get allocation statistics
	 */
	getStats(): {
		active_containers: number;
		allocated_ports: number;
		available_ports: number;
		total_ports: number;
	} {
		const totalPorts = this.pool.port_range_end - this.pool.port_range_start + 1;
		const allocatedPorts = this.pool.allocated_ports.size;

		return {
			active_containers: this.pool.allocated_containers.size,
			allocated_ports: allocatedPorts,
			available_ports: totalPorts - allocatedPorts,
			total_ports: totalPorts
		};
	}

	/**
	 * Allocate a port from the pool
	 */
	private allocatePort(): number {
		for (let port = this.pool.port_range_start; port <= this.pool.port_range_end; port++) {
			if (!this.pool.allocated_ports.has(port)) {
				this.pool.allocated_ports.add(port);
				return port;
			}
		}

		throw new Error(
			`No available ports in range ${this.pool.port_range_start}-${this.pool.port_range_end}. ` +
				`All ${this.pool.allocated_ports.size} ports are allocated.`
		);
	}

	/**
	 * Validate CPU limit format
	 */
	static validateCpuLimit(cpuLimit: string): boolean {
		// Format: "1.5" or "2" (number of CPU cores)
		const parsed = parseFloat(cpuLimit);
		return !isNaN(parsed) && parsed > 0 && parsed <= 64; // Max 64 cores
	}

	/**
	 * Validate memory limit format
	 */
	static validateMemoryLimit(memoryLimit: string): boolean {
		// Format: "2g", "512m", "1024m"
		const regex = /^(\d+)(m|g)$/i;
		const match = memoryLimit.match(regex);

		if (!match?.[1] || !match[2]) {
			return false;
		}

		const value = parseInt(match[1]);
		const unit = match[2].toLowerCase();

		// Check reasonable limits
		if (unit === 'm') {
			return value >= 256 && value <= 32768; // 256MB to 32GB
		} else if (unit === 'g') {
			return value >= 1 && value <= 32; // 1GB to 32GB
		}

		return false;
	}

	/**
	 * Convert memory limit to bytes
	 */
	static memoryLimitToBytes(memoryLimit: string): number {
		const regex = /^(\d+)(m|g)$/i;
		const match = memoryLimit.match(regex);

		if (!match?.[1] || !match[2]) {
			throw new Error(`Invalid memory limit format: ${memoryLimit}`);
		}

		const value = parseInt(match[1]);
		const unit = match[2].toLowerCase();

		if (unit === 'm') {
			return value * 1024 * 1024;
		} else if (unit === 'g') {
			return value * 1024 * 1024 * 1024;
		}

		throw new Error(`Invalid memory unit: ${unit}`);
	}

	/**
	 * Convert memory limit to megabytes
	 */
	static memoryLimitToMB(memoryLimit: string): number {
		return this.memoryLimitToBytes(memoryLimit) / (1024 * 1024);
	}

	/**
	 * Format bytes to human-readable memory limit
	 */
	static formatMemoryLimit(bytes: number): string {
		const mb = bytes / (1024 * 1024);
		if (mb >= 1024) {
			const gb = mb / 1024;
			return `${Math.round(gb * 10) / 10}g`;
		}
		return `${Math.round(mb)}m`;
	}

	/**
	 * Reset the allocator (useful for testing)
	 */
	reset(): void {
		this.pool.allocated_ports.clear();
		this.pool.allocated_containers.clear();
	}

	/**
	 * Reserve a specific port (for manual allocation)
	 */
	reservePort(port: number): boolean {
		if (port < this.pool.port_range_start || port > this.pool.port_range_end) {
			throw new Error(`Port ${port} is outside the allowed range`);
		}

		if (this.pool.allocated_ports.has(port)) {
			return false; // Already allocated
		}

		this.pool.allocated_ports.add(port);
		return true;
	}

	/**
	 * Check if a port is available
	 */
	isPortAvailable(port: number): boolean {
		return !this.pool.allocated_ports.has(port);
	}

	/**
	 * Get list of allocated ports
	 */
	getAllocatedPorts(): number[] {
		return Array.from(this.pool.allocated_ports).sort((a, b) => a - b);
	}

	/**
	 * Get list of available ports
	 */
	getAvailablePorts(): number[] {
		const available: number[] = [];
		for (let port = this.pool.port_range_start; port <= this.pool.port_range_end; port++) {
			if (!this.pool.allocated_ports.has(port)) {
				available.push(port);
			}
		}
		return available;
	}
}
