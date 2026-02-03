/**
 * Agent Capability Registry Service
 *
 * Centralized registry for agent capabilities and selection criteria.
 * Loads and manages agent capabilities from the registry.json file.
 */

import type { AgentCapability, SelectionCriterion, TaskDomain } from 'types/agent.types';

import { getLogger } from 'output/logger';
import { readFile, resolveAIPath } from 'utils/file-utils';

interface AgentRegistryData {
	capabilities: Record<string, AgentCapability>;
	selectionCriteria: Record<string, string>;
	taskDomains: Record<string, string>;
}

export class AgentCapabilityRegistryService {
	private initialized = false;
	private readonly logger = getLogger();
	private registry: Map<string, AgentCapability> = new Map();
	private selectionCriteria: Map<SelectionCriterion, string> = new Map();
	private taskDomains: Map<TaskDomain, string> = new Map();

	/**
	 * Initialize the registry by loading from registry.json
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			this.logger.debug('Registry already initialized');
			return;
		}

		try {
			const registryPath = resolveAIPath('agents/registry.json');
			const registryData = await readFile(registryPath);
			const parsed = JSON.parse(registryData) as AgentRegistryData;

			this.loadCapabilities(parsed.capabilities);
			this.loadSelectionCriteria(parsed.selectionCriteria);
			this.loadTaskDomains(parsed.taskDomains);

			this.initialized = true;
			this.logger.info('Agent capability registry initialized', {
				agentCount: this.registry.size,
				criteriaCount: this.selectionCriteria.size,
				domainCount: this.taskDomains.size
			});
		} catch (error) {
			this.logger.error('Failed to initialize agent capability registry', error as Error);
			throw error;
		}
	}

	/**
	 * Load agent capabilities into the registry
	 */
	private loadCapabilities(capabilities: Record<string, AgentCapability>): void {
		if (!capabilities || typeof capabilities !== 'object') {
			// Silently skip - capabilities are optional (especially in tests)
			return;
		}

		// Load capabilities using functional pattern
		Object.entries(capabilities).forEach(([role, capability]) => {
			this.registry.set(role, {
				...capability,
				role // Ensure role is set
			});
		});
	}

	/**
	 * Load selection criteria descriptions
	 */
	private loadSelectionCriteria(criteria: Record<string, string>): void {
		if (!criteria || typeof criteria !== 'object') {
			// Silently skip - selection criteria are optional (especially in tests)
			return;
		}

		// Load selection criteria using functional pattern
		Object.entries(criteria).forEach(([criterion, description]) => {
			this.selectionCriteria.set(criterion as SelectionCriterion, description);
		});
	}

	/**
	 * Load task domain descriptions
	 */
	private loadTaskDomains(domains: Record<string, string>): void {
		if (!domains || typeof domains !== 'object') {
			// Silently skip - task domains are optional (especially in tests)
			return;
		}

		// Load task domains using functional pattern
		Object.entries(domains).forEach(([domain, description]) => {
			this.taskDomains.set(domain as TaskDomain, description);
		});
	}

	/**
	 * Get a specific agent's capability
	 */
	getCapability(role: string): AgentCapability | undefined {
		this.ensureInitialized();
		return this.registry.get(role);
	}

	/**
	 * Get all agent capabilities
	 */
	getAllCapabilities(): Map<string, AgentCapability> {
		// Return empty map if not initialized, rather than throwing
		if (!this.initialized) {
			return new Map();
		}
		return new Map(this.registry);
	}

	/**
	 * Find agents that match a specific domain
	 */
	findAgentsByDomain(domain: TaskDomain): string[] {
		this.ensureInitialized();

		// Filter, sort, and map in a functional chain
		return Array.from(this.registry.entries())
			.filter(([, capability]) => capability.domains.includes(domain))
			.map(([role, capability]) => ({ agent: role, priority: capability.priority }))
			.sort((a, b) => b.priority - a.priority)
			.map((item) => item.agent);
	}

	/**
	 * Find agents that match specific selection criteria
	 */
	findAgentsByCriteria(criteria: SelectionCriterion[]): string[] {
		this.ensureInitialized();

		// Filter, map, sort, and extract in a functional chain
		return Array.from(this.registry.entries())
			.map(([role, capability]) => ({
				agent: role,
				matchCount: criteria.filter((criterion) => capability.selectionCriteria.includes(criterion)).length,
				priority: capability.priority
			}))
			.filter((item) => item.matchCount > 0)
			.sort((a, b) => {
				if (a.matchCount !== b.matchCount) {
					return b.matchCount - a.matchCount;
				}
				return b.priority - a.priority;
			})
			.map((item) => item.agent);
	}

	/**
	 * Find the best agent for a combination of domain and criteria
	 */
	findBestAgent(domain: TaskDomain, criteria: SelectionCriterion[] = []): string | undefined {
		this.ensureInitialized();

		// Get agents that match the domain
		const domainAgents = this.findAgentsByDomain(domain);

		if (domainAgents.length === 0) {
			return undefined;
		}

		// If no criteria specified, return highest priority domain agent
		if (criteria.length === 0) {
			return domainAgents[0];
		}

		// Get agents that match the criteria
		const criteriaAgents = this.findAgentsByCriteria(criteria);

		// Find intersection of domain and criteria agents
		const intersection = domainAgents.filter((agent) => criteriaAgents.includes(agent));

		// Return the highest priority agent from the intersection
		return intersection.length > 0 ? intersection[0] : domainAgents[0];
	}

	/**
	 * Get selection criteria description
	 */
	getSelectionCriterionDescription(criterion: SelectionCriterion): string | undefined {
		this.ensureInitialized();
		return this.selectionCriteria.get(criterion);
	}

	/**
	 * Get task domain description
	 */
	getTaskDomainDescription(domain: TaskDomain): string | undefined {
		this.ensureInitialized();
		return this.taskDomains.get(domain);
	}

	/**
	 * Get all available selection criteria
	 */
	getAllSelectionCriteria(): SelectionCriterion[] {
		this.ensureInitialized();
		return Array.from(this.selectionCriteria.keys());
	}

	/**
	 * Get all available task domains
	 */
	getAllTaskDomains(): TaskDomain[] {
		this.ensureInitialized();
		return Array.from(this.taskDomains.keys());
	}

	/**
	 * Check if an agent exists in the registry
	 */
	hasAgent(role: string): boolean {
		this.ensureInitialized();
		return this.registry.has(role);
	}

	/**
	 * Get agent roles that have specific capabilities
	 */
	findAgentsWithCapability(capability: keyof AgentCapability): string[] {
		this.ensureInitialized();

		// Filter and map in a functional chain
		return Array.from(this.registry.entries())
			.filter(([, agentCapability]) => capability in agentCapability)
			.map(([role]) => role);
	}

	/**
	 * Validate that the registry is properly initialized
	 */
	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('Agent capability registry not initialized. Call initialize() first.');
		}
	}

	/**
	 * Get registry statistics for monitoring
	 */
	getStats(): {
		agentsByDomain: Record<TaskDomain, number>;
		averageCriteriaPerAgent: number;
		totalAgents: number;
		totalCriteria: number;
		totalDomains: number;
	} {
		this.ensureInitialized();

		const agentsByDomain: Record<TaskDomain, number> = {} as Record<TaskDomain, number>;

		// Count agents per domain and total criteria using functional pattern
		const totalCriteria = Array.from(this.registry.values()).reduce((sum, capability) => {
			capability.domains.forEach((domain) => {
				agentsByDomain[domain] = (agentsByDomain[domain] ?? 0) + 1;
			});
			return sum + capability.selectionCriteria.length;
		}, 0);

		return {
			agentsByDomain,
			averageCriteriaPerAgent: this.registry.size > 0 ? totalCriteria / this.registry.size : 0,
			totalAgents: this.registry.size,
			totalCriteria: this.selectionCriteria.size,
			totalDomains: this.taskDomains.size
		};
	}

	/**
	 * Reload the registry (useful for development/testing)
	 */
	async reload(): Promise<void> {
		this.initialized = false;
		this.registry.clear();
		this.selectionCriteria.clear();
		this.taskDomains.clear();
		await this.initialize();
	}
}
