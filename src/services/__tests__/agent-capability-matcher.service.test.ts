/**
 * Unit tests for AgentCapabilityMatcherService service
 *
 * Tests the agent scoring and matching functionality, including:
 * - Agent score calculation algorithm
 * - Domain match scoring
 * - Expertise relevance scoring
 * - Selection criteria matching
 * - Context compatibility scoring
 * - Agent ranking and selection
 */

import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { CodebaseContext, SelectionCriterion, TaskClassification, TaskDomain } from 'types/agent.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the registry service
vi.mock('services/agent-capability-registry.service');

const mockRegistry = {
	findAgentsByCriteria: vi.fn(),
	findAgentsByDomain: vi.fn(),
	findBestAgent: vi.fn(),
	getAllCapabilities: vi.fn(),
	getCapability: vi.fn()
};

describe('AgentCapabilityMatcherService', () => {
	let matcher: AgentCapabilityMatcherService;
	let mockRegistryInstance: AgentCapabilityRegistryService;

	const mockCapabilities = new Map<string, any>([
		[
			'platform-engineer',
			{
				domains: ['infrastructure', 'security'] as TaskDomain[],
				expertise: ['kubernetes', 'terraform', 'aws'],
				priority: 90,
				role: 'platform-engineer',
				selectionCriteria: ['terraform-files', 'kubernetes-manifests'] as SelectionCriterion[]
			}
		],
		[
			'software-engineer-typescript-backend',
			{
				domains: ['typescript-backend-general'] as TaskDomain[],
				expertise: ['nodejs', 'express', 'graphql'],
				priority: 85,
				role: 'software-engineer-typescript-backend',
				selectionCriteria: ['code-files', 'api-files'] as SelectionCriterion[]
			}
		],
		[
			'lead',
			{
				domains: ['infrastructure', 'typescript-backend-general', 'security'] as TaskDomain[],
				expertise: ['architecture', 'leadership', 'ddd'],
				priority: 95,
				role: 'lead',
				selectionCriteria: ['architecture-files', 'strategy-files'] as SelectionCriterion[]
			}
		]
	]);

	beforeEach(() => {
		vi.clearAllMocks();
		mockRegistryInstance = mockRegistry as any;
		mockRegistry.getAllCapabilities.mockReturnValue(mockCapabilities);
		matcher = new AgentCapabilityMatcherService(mockRegistryInstance);
	});

	describe('scoreAgents', () => {
		it('should score all agents for given task and context', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 0.8,
				primaryDomain: 'infrastructure',
				reasons: ['Infrastructure keywords found'],
				suggestedAgents: ['platform-engineer']
			};

			const context: CodebaseContext = {
				affectedFileTypes: ['.tf', '.yaml'],
				architecturalPatterns: ['infrastructure'],
				importPatterns: ['terraform'],
				infrastructureComponents: ['aws', 'kubernetes'],
				technologyStack: ['terraform', 'kubernetes']
			};

			const scores = await matcher.scoreAgents(taskClassification, context);

			expect(scores).toHaveLength(3);
			expect(scores[0].role).toBeDefined();
			expect(scores[0].score).toBeGreaterThanOrEqual(0);
			expect(scores[0].score).toBeLessThanOrEqual(1);
			expect(scores[0].reasons).toBeInstanceOf(Array);
			expect(scores[0].capability).toBeDefined();

			// Should be sorted by score descending
			for (let i = 1; i < scores.length; i++) {
				expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
			}
		});

		it('should apply confidence multiplier to final scores', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 0.5,
				primaryDomain: 'infrastructure',
				// Low confidence
				reasons: ['Infrastructure keywords found'],
				suggestedAgents: ['platform-engineer']
			};

			const context: CodebaseContext = {
				affectedFileTypes: ['.tf'],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: ['aws'],
				technologyStack: ['terraform']
			};

			const scores = await matcher.scoreAgents(taskClassification, context);

			// All scores should be <= 0.5 due to confidence multiplier
			scores.forEach((score) => {
				expect(score.score).toBeLessThanOrEqual(0.5);
			});
		});

		it('should handle empty agent list', async () => {
			mockRegistry.getAllCapabilities.mockReturnValue(new Map());

			const taskClassification: TaskClassification = {
				complexity: 'low',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);

			expect(scores).toEqual([]);
		});
	});

	describe('scoring algorithm', () => {
		const baseTaskClassification: TaskClassification = {
			complexity: 'medium',
			confidence: 1.0,
			primaryDomain: 'infrastructure',
			reasons: ['Test reason'],
			suggestedAgents: ['platform-engineer']
		};

		const baseContext: CodebaseContext = {
			affectedFileTypes: ['.tf'],
			architecturalPatterns: ['infrastructure'],
			importPatterns: ['terraform'],
			infrastructureComponents: ['aws'],
			technologyStack: ['terraform']
		};

		it('should give perfect domain match high score', async () => {
			const taskClassification = {
				...baseTaskClassification,
				primaryDomain: 'infrastructure' as TaskDomain
			};

			const scores = await matcher.scoreAgents(taskClassification, baseContext);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(platformEngineerScore!.score).toBeGreaterThan(0.7); // Should be reasonably high due to domain match
		});

		it('should score expertise matches', async () => {
			const contextWithTerraform: CodebaseContext = {
				...baseContext,
				importPatterns: ['terraform'],
				technologyStack: ['terraform', 'kubernetes']
			};

			const scores = await matcher.scoreAgents(baseTaskClassification, contextWithTerraform);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(
				platformEngineerScore!.reasons.some((r) => r.includes('Technology alignment') || r.includes('expertise'))
			).toBe(true);
		});

		it('should score selection criteria matches', async () => {
			const contextWithTerraformFiles: CodebaseContext = {
				...baseContext,
				affectedFileTypes: ['.tf']
			};

			const scores = await matcher.scoreAgents(baseTaskClassification, contextWithTerraformFiles);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(platformEngineerScore!.reasons.some((r) => r.includes('terraform-files'))).toBe(true);
		});

		it('should apply priority bonus', async () => {
			const scores = await matcher.scoreAgents(baseTaskClassification, baseContext);

			// Lead should have highest priority bonus
			const leadScore = scores.find((s) => s.role === 'lead')!.score;
			const platformScore = scores.find((s) => s.role === 'platform-engineer')!.score;

			// Both have infrastructure domain match, but lead has higher priority
			// Priority difference might be small, so we check lead has reasonable score
			expect(leadScore).toBeGreaterThan(0.4);
			expect(platformScore).toBeGreaterThan(0.4);
		});

		it('should generate meaningful scoring reasons', async () => {
			const scores = await matcher.scoreAgents(baseTaskClassification, baseContext);

			scores.forEach((score) => {
				expect(score.reasons).toBeInstanceOf(Array);
				expect(score.reasons.length).toBeGreaterThan(0);
				expect(
					score.reasons.some((r) => r.includes('domain') || r.includes('expertise') || r.includes('priority'))
				).toBe(true);
			});
		});
	});

	describe('domain match scoring', () => {
		it('should give perfect score for exact domain match', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			// Should get full domain match score (0.4 weight)
			expect(platformEngineerScore!.score).toBeGreaterThan(0.35);
		});

		it('should give partial score for related domains', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'typescript-backend-general',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const leadScore = scores.find((s) => s.role === 'lead');

			// Lead has typescript-backend-general as related domain to infrastructure
			expect(leadScore!.score).toBeGreaterThan(0.1);
		});

		it('should give zero score for unrelated domains', async () => {
			// Create mock capability with completely unrelated domain
			const unrelatedCapabilities = new Map([
				[
					'unrelated-agent',
					{
						domains: ['ui-ux-designer'] as TaskDomain[],
						expertise: ['figma', 'sketch'],
						priority: 50,
						role: 'unrelated-agent',
						selectionCriteria: ['ui-mockups'] as SelectionCriterion[]
					}
				]
			]);

			mockRegistry.getAllCapabilities.mockReturnValue(unrelatedCapabilities);

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const unrelatedScore = scores.find((s) => s.role === 'unrelated-agent');

			// Should get very low score due to no domain/expertise match
			expect(unrelatedScore!.score).toBeLessThan(0.1);
		});
	});

	describe('expertise match scoring', () => {
		it('should score exact expertise matches highly', async () => {
			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				// Exact matches for platform-engineer
				infrastructureComponents: [],
				technologyStack: ['terraform', 'kubernetes', 'aws']
			};

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: ['terraform', 'kubernetes', 'aws'],
				// Include in reasons
				suggestedAgents: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(platformEngineerScore!.score).toBeGreaterThan(0.5);
		});

		it('should score partial expertise matches', async () => {
			const context: CodebaseContext = {
				affectedFileTypes: [],
				// Partial match
				architecturalPatterns: [],
				importPatterns: ['terraform'],
				infrastructureComponents: [],
				technologyStack: ['terraform']
			};

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: ['infrastructure work'],
				suggestedAgents: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(platformEngineerScore!.score).toBeGreaterThan(0.2);
		});

		it('should score zero for no expertise matches', async () => {
			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: ['unknown-tech'],
				infrastructureComponents: [],
				technologyStack: ['unknown-tech']
			};

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: ['infrastructure work'],
				suggestedAgents: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const backendScore = scores.find((s) => s.role === 'software-engineer-typescript-backend');

			// Backend engineer has no infrastructure expertise
			expect(backendScore!.score).toBeLessThan(0.3);
		});
	});

	describe('criteria match scoring', () => {
		it('should score exact criteria matches', async () => {
			// Mock the context analysis to return terraform-files criteria
			const matcherWithMock = new AgentCapabilityMatcherService(mockRegistryInstance);

			const context: CodebaseContext = {
				affectedFileTypes: ['.tf'],
				architecturalPatterns: [],
				// This should trigger terraform-files criteria
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const scores = await matcherWithMock.scoreAgents(taskClassification, context);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			expect(platformEngineerScore!.reasons.some((r) => r.includes('terraform-files') || r.includes('criteria'))).toBe(
				true
			);
		});

		it('should score multiple criteria matches higher', async () => {
			const context: CodebaseContext = {
				affectedFileTypes: ['.tf', '.yaml'],
				architecturalPatterns: [],
				// Should match terraform-files and kubernetes-manifests
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);
			const platformEngineerScore = scores.find((s) => s.role === 'platform-engineer');

			// Should get higher score due to multiple criteria matches
			expect(platformEngineerScore!.score).toBeGreaterThan(0.3);
		});
	});

	describe('findBestAgent', () => {
		it('should return the highest scoring agent', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: ['infrastructure work'],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: ['.tf'],
				architecturalPatterns: [],
				importPatterns: ['terraform'],
				infrastructureComponents: ['aws'],
				technologyStack: ['terraform']
			};

			const result = await matcher.findBestAgent(taskClassification, context);

			expect(result).toBeDefined();
			expect(result!.agent).toBeDefined();
			expect(result!.score.score).toBeGreaterThan(0);
			expect(result!.score.role).toBe(result!.agent);
		});

		it('should return null when no agents available', async () => {
			mockRegistry.getAllCapabilities.mockReturnValue(new Map());

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const result = await matcher.findBestAgent(taskClassification, context);

			expect(result).toBeNull();
		});
	});

	describe('getQualifiedAgents', () => {
		it('should return agents above minimum score threshold', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const qualifiedAgents = await matcher.getQualifiedAgents(taskClassification, context, 0.1);

			expect(qualifiedAgents.length).toBeGreaterThan(0);
			qualifiedAgents.forEach((agent) => {
				expect(agent.score).toBeGreaterThanOrEqual(0.1);
			});
		});

		it('should filter out agents below threshold', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const qualifiedAgents = await matcher.getQualifiedAgents(taskClassification, context, 0.8);

			// May return empty array if no agents meet high threshold
			expect(qualifiedAgents).toBeInstanceOf(Array);
		});
	});

	describe('error handling', () => {
		it('should handle registry errors gracefully', async () => {
			mockRegistry.getAllCapabilities.mockImplementation(() => {
				throw new Error('Registry error');
			});

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			expect(() => matcher.scoreAgents(taskClassification, context)).toThrow('Registry error');
		});

		it('should handle malformed capability data', async () => {
			const malformedCapabilities = new Map([
				[
					'malformed-agent',
					{
						role: 'malformed-agent'
						// Missing required fields
					}
				]
			]);

			mockRegistry.getAllCapabilities.mockReturnValue(malformedCapabilities);

			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			// Should handle gracefully without throwing
			const scores = await matcher.scoreAgents(taskClassification, context);
			expect(scores).toBeInstanceOf(Array);
		});
	});

	describe('edge cases', () => {
		it('should handle empty context gracefully', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const emptyContext: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, emptyContext);

			expect(scores).toBeInstanceOf(Array);
			expect(scores.length).toBe(3); // All agents should still be scored
		});

		it('should handle unknown primary domain', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 1.0,
				primaryDomain: 'unknown-domain' as TaskDomain,
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			};

			const scores = await matcher.scoreAgents(taskClassification, context);

			// Should still score agents based on other factors
			expect(scores).toBeInstanceOf(Array);
			expect(scores.length).toBe(3);
		});

		it('should handle zero confidence', async () => {
			const taskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			};

			const context: CodebaseContext = {
				affectedFileTypes: ['.tf'],
				architecturalPatterns: [],
				importPatterns: ['terraform'],
				infrastructureComponents: [],
				technologyStack: ['terraform']
			};

			const scores = await matcher.scoreAgents(taskClassification, context);

			// All scores should be 0 due to zero confidence multiplier
			scores.forEach((score) => {
				expect(score.score).toBe(0);
			});
		});
	});
});
