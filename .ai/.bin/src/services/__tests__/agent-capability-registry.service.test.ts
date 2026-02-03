/**
 * Unit tests for AgentCapabilityRegistry service
 *
 * Tests the agent capability registry functionality, including:
 * - Registry initialization and loading
 * - Agent capability retrieval
 * - Domain-based agent lookup
 * - Criteria-based agent matching
 * - Error handling
 */

import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { SelectionCriterion, TaskDomain } from 'types/agent.types';
import { readFile, resolveAIPath } from 'utils/file-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock file utilities
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		readFile: vi.fn(),
		resolveAIPath: vi.fn()
	};
});

const mockReadFile = vi.mocked(readFile);
const mockResolveAIPath = vi.mocked(resolveAIPath);

describe('AgentCapabilityRegistryService', () => {
	let registry: AgentCapabilityRegistryService;

	const mockRegistryData = {
		capabilities: {
			lead: {
				domains: ['infrastructure', 'typescript-backend-general', 'security'],
				expertise: ['architecture', 'leadership', 'ddd'],
				priority: 95,
				role: 'lead',
				selectionCriteria: ['architecture-files', 'strategy-files']
			},
			'platform-engineer': {
				domains: ['infrastructure', 'security'],
				expertise: ['kubernetes', 'terraform', 'aws'],
				priority: 90,
				role: 'platform-engineer',
				selectionCriteria: ['terraform-files', 'kubernetes-manifests']
			},
			'software-engineer-typescript-backend': {
				domains: ['typescript-backend-general'],
				expertise: ['nodejs', 'express', 'graphql'],
				priority: 85,
				role: 'software-engineer-typescript-backend',
				selectionCriteria: ['code-files', 'api-files']
			}
		},
		selectionCriteria: {
			'api-files': 'API-related files',
			'architecture-files': 'Architecture documentation',
			'code-files': 'General code files',
			'kubernetes-manifests': 'Kubernetes YAML manifests',
			'strategy-files': 'Strategic planning files',
			'terraform-files': 'Terraform configuration files'
		},
		taskDomains: {
			infrastructure: 'Infrastructure and DevOps tasks',
			security: 'Security and compliance tasks',
			'typescript-backend-general': 'Backend TypeScript development'
		}
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockResolveAIPath.mockReturnValue('/mock/path/agents/registry.json');
		mockReadFile.mockResolvedValue(JSON.stringify(mockRegistryData));

		registry = new AgentCapabilityRegistryService();
	});

	describe('initialization', () => {
		it('should initialize registry successfully', async () => {
			await registry.initialize();

			expect(mockResolveAIPath).toHaveBeenCalledWith('agents/registry.json');
			expect(mockReadFile).toHaveBeenCalledWith('/mock/path/agents/registry.json');
		});

		it('should load capabilities correctly', async () => {
			await registry.initialize();

			const capability = registry.getCapability('platform-engineer');
			expect(capability).toEqual(mockRegistryData.capabilities['platform-engineer']);
		});

		it('should load selection criteria descriptions', async () => {
			await registry.initialize();

			const description = registry.getSelectionCriterionDescription('terraform-files');
			expect(description).toBe('Terraform configuration files');
		});

		it('should load task domain descriptions', async () => {
			await registry.initialize();

			const description = registry.getTaskDomainDescription('infrastructure');
			expect(description).toBe('Infrastructure and DevOps tasks');
		});

		it('should handle initialization errors', async () => {
			mockReadFile.mockRejectedValue(new Error('File not found'));

			await expect(registry.initialize()).rejects.toThrow('File not found');
			expect(registry.getAllCapabilities().size).toBe(0);
		});

		it('should handle invalid JSON', async () => {
			mockReadFile.mockResolvedValue('invalid json');

			await expect(registry.initialize()).rejects.toThrow();
		});
	});

	describe('capability retrieval', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should return specific agent capability', () => {
			const capability = registry.getCapability('platform-engineer');

			expect(capability).toEqual({
				domains: ['infrastructure', 'security'],
				expertise: ['kubernetes', 'terraform', 'aws'],
				priority: 90,
				role: 'platform-engineer',
				selectionCriteria: ['terraform-files', 'kubernetes-manifests']
			});
		});

		it('should return undefined for non-existent agent', () => {
			const capability = registry.getCapability('non-existent-agent');

			expect(capability).toBeUndefined();
		});

		it('should return all capabilities', () => {
			const allCapabilities = registry.getAllCapabilities();

			expect(allCapabilities.size).toBe(3);
			expect(allCapabilities.has('platform-engineer')).toBe(true);
			expect(allCapabilities.has('software-engineer-typescript-backend')).toBe(true);
			expect(allCapabilities.has('lead')).toBe(true);
		});

		it('should check if agent exists', () => {
			expect(registry.hasAgent('platform-engineer')).toBe(true);
			expect(registry.hasAgent('non-existent')).toBe(false);
		});
	});

	describe('domain-based lookups', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should find agents by single domain', () => {
			const agents = registry.findAgentsByDomain('infrastructure');

			expect(agents).toEqual(['lead', 'platform-engineer']);
			// Should be sorted by priority (lead: 95, platform-engineer: 90)
		});

		it('should find agents by multiple domains', () => {
			const agents = registry.findAgentsByDomain('security');

			expect(agents).toContain('platform-engineer');
			expect(agents).toContain('lead');
		});

		it('should return empty array for unknown domain', () => {
			const agents = registry.findAgentsByDomain('unknown-domain' as TaskDomain);

			expect(agents).toEqual([]);
		});

		it('should return all available domains', () => {
			const domains = registry.getAllTaskDomains();

			expect(domains).toEqual(['infrastructure', 'security', 'typescript-backend-general']);
		});
	});

	describe('criteria-based lookups', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should find agents by single criterion', () => {
			const agents = registry.findAgentsByCriteria(['terraform-files']);

			expect(agents).toEqual(['platform-engineer']);
		});

		it('should find agents by multiple criteria', () => {
			const agents = registry.findAgentsByCriteria(['terraform-files', 'code-files']);

			expect(agents).toContain('platform-engineer');
			expect(agents).toContain('software-engineer-typescript-backend');
			// platform-engineer should come first (higher priority)
			expect(agents[0]).toBe('platform-engineer');
		});

		it('should sort by match count and priority', async () => {
			// Add mock agent with higher priority but fewer matches
			const extendedData = {
				...mockRegistryData,
				capabilities: {
					...mockRegistryData.capabilities,
					'high-priority-agent': {
						domains: ['infrastructure'],
						expertise: ['terraform'],
						priority: 100,
						role: 'high-priority-agent',
						selectionCriteria: ['terraform-files']
					}
				}
			};

			mockReadFile.mockResolvedValue(JSON.stringify(extendedData));

			const newRegistry = new AgentCapabilityRegistryService();
			await newRegistry.initialize();

			const agents = newRegistry.findAgentsByCriteria(['terraform-files', 'code-files']);

			// high-priority-agent has higher priority (100) than platform-engineer (90)
			expect(agents[0]).toBe('high-priority-agent'); // Higher priority
		});

		it('should return empty array for unknown criteria', () => {
			const agents = registry.findAgentsByCriteria(['unknown-criterion']);

			expect(agents).toEqual([]);
		});

		it('should return empty array for empty criteria', () => {
			const agents = registry.findAgentsByCriteria([]);

			expect(agents).toEqual([]);
		});

		it('should return all available criteria', () => {
			const criteria = registry.getAllSelectionCriteria();

			// Check all criteria are present (order may vary based on Map iteration)
			expect(criteria).toHaveLength(6);
			expect(criteria).toEqual(
				expect.arrayContaining([
					'terraform-files',
					'kubernetes-manifests',
					'code-files',
					'api-files',
					'architecture-files',
					'strategy-files'
				])
			);
		});
	});

	describe('best agent selection', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should find best agent for domain and criteria', () => {
			const agent = registry.findBestAgent('infrastructure', ['terraform-files']);

			expect(agent).toBe('platform-engineer');
		});

		it('should find best agent for domain only', () => {
			const agent = registry.findBestAgent('infrastructure');

			expect(agent).toBe('lead'); // Highest priority for infrastructure
		});

		it('should return undefined for unknown domain', () => {
			const agent = registry.findBestAgent('unknown-domain' as TaskDomain);

			expect(agent).toBeUndefined();
		});

		it('should prioritize domain matches over criteria-only matches', () => {
			const agent = registry.findBestAgent('typescript-backend-general', ['terraform-files']);

			// Should return highest priority domain agent when no agent matches both domain and criteria
			expect(agent).toBe('lead'); // lead has highest priority (95) for this domain
		});
	});

	describe('statistics and metadata', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should provide registry statistics', () => {
			const stats = registry.getStats();

			expect(stats.totalAgents).toBe(3);
			expect(stats.totalDomains).toBe(3);
			expect(stats.totalCriteria).toBe(6);
			expect(stats.agentsByDomain.infrastructure).toBe(2); // lead and platform-engineer
			expect(stats.agentsByDomain.security).toBe(2); // lead and platform-engineer
			expect(stats.agentsByDomain['typescript-backend-general']).toBe(2); // lead and backend engineer
			expect(stats.averageCriteriaPerAgent).toBeCloseTo(2); // 6 criteria / 3 agents
		});

		it('should provide criterion descriptions', () => {
			const description = registry.getSelectionCriterionDescription('terraform-files');

			expect(description).toBe('Terraform configuration files');
		});

		it('should return undefined for unknown criterion', () => {
			const description = registry.getSelectionCriterionDescription('unknown' as SelectionCriterion);

			expect(description).toBeUndefined();
		});

		it('should provide domain descriptions', () => {
			const description = registry.getTaskDomainDescription('infrastructure');

			expect(description).toBe('Infrastructure and DevOps tasks');
		});

		it('should return undefined for unknown domain', () => {
			const description = registry.getTaskDomainDescription('unknown' as TaskDomain);

			expect(description).toBeUndefined();
		});
	});

	describe('capability-based lookups', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should find agents with specific capability type', () => {
			const agentsWithCapability = registry.findAgentsWithCapability('role');

			// All agents in our mock data should have a role
			expect(agentsWithCapability.length).toBeGreaterThan(0);
		});
	});

	describe('error handling', () => {
		it('should throw error when accessing uninitialized registry', async () => {
			await expect(async () => registry.getCapability('any-agent')).rejects.toThrow(
				'Agent capability registry not initialized'
			);
		});

		it('should handle malformed registry data gracefully', async () => {
			const malformedData = {
				capabilities: {
					'invalid-agent': {
						// Missing required fields
						role: 'invalid-agent'
					}
				}
			};

			mockReadFile.mockResolvedValue(JSON.stringify(malformedData));

			const newRegistry = new AgentCapabilityRegistryService();
			await newRegistry.initialize();

			// Should still load what it can
			expect(newRegistry.getAllCapabilities().size).toBe(1);
		});
	});

	describe('caching and reloading', () => {
		it('should reload registry data', async () => {
			await registry.initialize();

			// Modify mock to return different data
			const newData = {
				...mockRegistryData,
				capabilities: {
					...mockRegistryData.capabilities,
					'new-agent': {
						domains: ['infrastructure'],
						expertise: ['docker'],
						priority: 80,
						role: 'new-agent',
						selectionCriteria: ['docker-files']
					}
				}
			};

			mockReadFile.mockResolvedValue(JSON.stringify(newData));

			await registry.reload();

			expect(registry.getCapability('new-agent')).toBeDefined();
		});
	});

	describe('edge cases', () => {
		beforeEach(async () => {
			await registry.initialize();
		});

		it('should handle empty registry gracefully', async () => {
			const emptyData = {
				capabilities: {},
				selectionCriteria: {},
				taskDomains: {}
			};

			mockReadFile.mockResolvedValue(JSON.stringify(emptyData));

			const emptyRegistry = new AgentCapabilityRegistryService();
			await emptyRegistry.initialize();

			expect(emptyRegistry.getAllCapabilities().size).toBe(0);
			expect(emptyRegistry.findAgentsByDomain('infrastructure')).toEqual([]);
			expect(emptyRegistry.findAgentsByCriteria(['test'])).toEqual([]);
		});

		it('should handle agents with no domains', async () => {
			const dataWithEmptyDomains = {
				...mockRegistryData,
				capabilities: {
					...mockRegistryData.capabilities,
					'no-domains-agent': {
						domains: [],
						expertise: ['general'],
						priority: 50,
						role: 'no-domains-agent',
						selectionCriteria: []
					}
				}
			};

			mockReadFile.mockResolvedValue(JSON.stringify(dataWithEmptyDomains));

			const newRegistry = new AgentCapabilityRegistryService();
			await newRegistry.initialize();

			const agents = newRegistry.findAgentsByDomain('infrastructure');
			expect(agents).not.toContain('no-domains-agent');
		});

		it('should handle agents with no selection criteria', async () => {
			const agent = registry.findAgentsByCriteria([]);

			expect(agent).toEqual([]);
		});
	});
});
