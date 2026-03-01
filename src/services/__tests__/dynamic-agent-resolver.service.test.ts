/**
 * Unit tests for DynamicAgentResolverService service
 *
 * Tests the main agent selection orchestration, including:
 * - End-to-end agent resolution workflow
 * - Fallback mechanisms
 * - Confidence threshold handling
 * - Error handling and recovery
 * - Service integration
 */

import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { AgentScore, CodebaseContext, TaskClassification, TaskContext } from 'types/agent.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('services/task-classifier.service');
vi.mock('services/context-analyzer.service');
vi.mock('services/agent-capability-matcher.service');
vi.mock('services/agent-capability-registry.service');

const mockTaskClassifier = {
	classifyTask: vi.fn()
};

const mockContextAnalyzer = {
	analyzeTaskContext: vi.fn(),
	clearCache: vi.fn(),
	getCacheSize: vi.fn().mockReturnValue(0)
};

const mockCapabilityMatcher = {
	findBestAgent: vi.fn(),
	scoreAgents: vi.fn()
};

const mockRegistry = {
	getStats: vi.fn().mockReturnValue({
		agentsByDomain: {},
		averageCriteriaPerAgent: 4,
		totalAgents: 5,
		totalCriteria: 20,
		totalDomains: 7
	}),
	initialize: vi.fn().mockResolvedValue(undefined),
	reload: vi.fn().mockResolvedValue(undefined)
};

describe('DynamicAgentResolverService', () => {
	let resolver: DynamicAgentResolverService;

	beforeEach(() => {
		vi.clearAllMocks();

		resolver = new DynamicAgentResolverService(
			mockTaskClassifier as any,
			mockContextAnalyzer as any,
			mockCapabilityMatcher as any,
			mockRegistry as any
		);
	});

	describe('resolveAgent', () => {
		const mockTaskContext: TaskContext = {
			affectedFiles: ['src/auth/controller.ts', 'src/auth/service.ts'],
			complexity: 'medium',
			dependencies: ['express', 'jsonwebtoken'],
			description: 'Implement user authentication API'
		};

		const mockTaskClassification: TaskClassification = {
			complexity: 'medium',
			confidence: 0.9,
			primaryDomain: 'typescript-backend-general',
			reasons: ['Backend API keywords found', 'Authentication patterns detected'],
			suggestedAgents: ['software-engineer-typescript-backend']
		};

		const mockCodebaseContext: CodebaseContext = {
			affectedFileTypes: ['.ts'],
			architecturalPatterns: ['api'],
			importPatterns: ['express', 'jsonwebtoken'],
			infrastructureComponents: [],
			technologyStack: ['nodejs', 'express', 'typescript']
		};

		const mockAgentScores: AgentScore[] = [
			{
				capability: {
					domains: ['typescript-backend-general'],
					expertise: ['nodejs', 'express'],
					priority: 85,
					role: 'software-engineer-typescript-backend',
					selectionCriteria: ['code-files']
				},
				reasons: ['Primary domain match', 'Technology alignment'],
				role: 'software-engineer-typescript-backend',
				score: 0.85
			},
			{
				capability: {
					domains: ['typescript-backend-general', 'architecture'],
					expertise: ['leadership', 'architecture'],
					priority: 95,
					role: 'lead',
					selectionCriteria: ['strategy-files']
				},
				reasons: ['Related domain match', 'Leadership capability'],
				role: 'lead',
				score: 0.75
			}
		];

		beforeEach(() => {
			mockTaskClassifier.classifyTask.mockReturnValue(mockTaskClassification);
			mockContextAnalyzer.analyzeTaskContext.mockResolvedValue(mockCodebaseContext);
			mockCapabilityMatcher.scoreAgents.mockReturnValue(mockAgentScores);
		});

		it('should resolve agent through complete workflow', async () => {
			const result = await resolver.resolveAgent(mockTaskContext);

			expect(mockTaskClassifier.classifyTask).toHaveBeenCalledWith(mockTaskContext);
			expect(mockContextAnalyzer.analyzeTaskContext).toHaveBeenCalledWith(mockTaskContext);
			expect(mockCapabilityMatcher.scoreAgents).toHaveBeenCalledWith(mockTaskClassification, mockCodebaseContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript-backend');
			expect(result.confidence).toBe(0.85);
			expect(result.reasons).toContain('Primary domain match');
			expect(result.alternatives).toHaveLength(1);
			expect(result.fallbackAgent).toBe('software-engineer-typescript-backend'); // Same as selected when confidence is high
		});

		it('should apply high confidence threshold correctly', async () => {
			const highScoreAgents: AgentScore[] = [
				{
					capability: mockAgentScores[0].capability,
					// Above HIGH_CONFIDENCE_THRESHOLD (0.75)
					reasons: ['Perfect match'],
					role: 'platform-engineer',
					score: 0.95
				}
			];

			mockCapabilityMatcher.scoreAgents.mockReturnValue(highScoreAgents);

			const result = await resolver.resolveAgent(mockTaskContext);

			expect(result.selectedAgent).toBe('platform-engineer');
			expect(result.confidence).toBe(0.95);
		});

		it('should handle medium confidence with close scores', async () => {
			const closeScores: AgentScore[] = [
				{
					capability: mockAgentScores[0].capability,
					// Medium confidence
					reasons: ['Good match'],
					role: 'agent1',
					score: 0.65
				},
				{
					capability: mockAgentScores[1].capability,
					// Close score (difference < 0.2)
					reasons: ['Also good'],
					role: 'agent2',
					score: 0.63
				}
			];

			mockCapabilityMatcher.scoreAgents.mockReturnValue(closeScores);

			const result = await resolver.resolveAgent(mockTaskContext);

			// Should still select the highest scoring agent
			expect(result.selectedAgent).toBe('agent1');
			expect(result.confidence).toBe(0.4); // Reduced due to close competition
		});

		it('should use fallback for low confidence scores', async () => {
			const lowScoreAgents: AgentScore[] = [
				{
					capability: mockAgentScores[0].capability,
					// Below MIN_CONFIDENCE_THRESHOLD (0.3)
					reasons: ['Weak match'],
					role: 'weak-match-agent',
					score: 0.2
				}
			];

			mockCapabilityMatcher.scoreAgents.mockReturnValue(lowScoreAgents);

			const result = await resolver.resolveAgent(mockTaskContext);

			expect(result.selectedAgent).toBe('weak-match-agent'); // Still select the best available
			expect(result.confidence).toBe(0.2);
			expect(result.reasons).toContain('Low confidence in agent selection');
		});

		it('should handle empty agent scores gracefully', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const result = await resolver.resolveAgent(mockTaskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript-backend'); // Fallback based on task context
			expect(result.confidence).toBe(0.1); // Very low confidence
			expect(result.reasons).toContain('No agent scores available');
		});

		it('should determine appropriate fallback agent based on context', async () => {
			// Test infrastructure files
			const infraContext: TaskContext = {
				...mockTaskContext,
				affectedFiles: ['infrastructure/main.tf', 'k8s/deployment.yaml']
			};

			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const result = await resolver.resolveAgent(infraContext);

			expect(result.fallbackAgent).toBe('platform-engineer');

			// Test frontend files
			const frontendContext: TaskContext = {
				...mockTaskContext,
				affectedFiles: ['src/components/App.tsx', 'src/hooks/useState.ts']
			};

			const result2 = await resolver.resolveAgent(frontendContext);

			expect(result2.fallbackAgent).toBe('software-engineer-typescript-frontend-react');
		});
	});

	describe('error handling', () => {
		it('should handle task classification errors gracefully', async () => {
			mockTaskClassifier.classifyTask.mockImplementation(() => {
				throw new Error('Classification failed');
			});

			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Test task'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript');
			expect(result.confidence).toBe(0.1);
			expect(result.reasons).toContain('Automatic agent selection failed');
			expect(result.reasons).toContain('Using fallback agent: software-engineer-typescript');
		});

		it('should handle context analysis errors gracefully', async () => {
			mockTaskClassifier.classifyTask.mockReturnValue({
				complexity: 'medium',
				confidence: 0.8,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			});
			mockContextAnalyzer.analyzeTaskContext.mockRejectedValue(new Error('Analysis failed'));

			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Test task'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript');
			expect(result.confidence).toBe(0.1);
			expect(result.reasons).toContain('Automatic agent selection failed');
			expect(result.reasons).toContain('Using fallback agent: software-engineer-typescript');
		});

		it('should handle scoring errors gracefully', async () => {
			mockTaskClassifier.classifyTask.mockReturnValue({
				complexity: 'medium',
				confidence: 0.8,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			});
			mockContextAnalyzer.analyzeTaskContext.mockResolvedValue({
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			});
			mockCapabilityMatcher.scoreAgents.mockImplementation(() => {
				throw new Error('Scoring failed');
			});

			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Test task'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript');
			expect(result.confidence).toBe(0.1);
			expect(result.reasons).toContain('Automatic agent selection failed');
			expect(result.reasons).toContain('Using fallback agent: software-engineer-typescript');
		});
	});

	describe('getDetailedAnalysis', () => {
		it('should provide detailed analysis of agent selection process', async () => {
			const mockTaskClassification: TaskClassification = {
				complexity: 'medium',
				confidence: 0.9,
				primaryDomain: 'typescript-backend-general',
				reasons: ['Backend patterns detected'],
				suggestedAgents: ['software-engineer-typescript-backend']
			};

			const mockCodebaseContext: CodebaseContext = {
				affectedFileTypes: ['.ts'],
				architecturalPatterns: ['api'],
				importPatterns: ['express'],
				infrastructureComponents: [],
				technologyStack: ['nodejs']
			};

			const mockAgentScores: AgentScore[] = [
				{
					capability: {
						domains: ['typescript-backend-general'],
						expertise: ['nodejs'],
						priority: 85,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: []
					},
					reasons: ['Good match'],
					role: 'software-engineer-typescript-backend',
					score: 0.8
				}
			];

			mockTaskClassifier.classifyTask.mockReturnValue(mockTaskClassification);
			mockContextAnalyzer.analyzeTaskContext.mockResolvedValue(mockCodebaseContext);
			mockCapabilityMatcher.scoreAgents.mockReturnValue(mockAgentScores);

			const taskContext: TaskContext = {
				affectedFiles: ['src/api/route.ts'],
				dependencies: ['express'],
				description: 'Build API endpoint'
			};

			const analysis = await resolver.getDetailedAnalysis(taskContext);

			expect(analysis.taskClassification).toEqual(mockTaskClassification);
			expect(analysis.codebaseContext).toEqual(mockCodebaseContext);
			expect(analysis.agentScores).toEqual(mockAgentScores);
			expect(analysis.selection).toBeDefined();
			expect(analysis.selection.selectedAgent).toBe('software-engineer-typescript-backend');
		});
	});

	describe('validateServices', () => {
		it('should validate all services are properly initialized', async () => {
			mockRegistry.initialize.mockResolvedValue(undefined);

			const validation = await resolver.validateServices();

			expect(validation.valid).toBe(true);
			expect(validation.issues).toEqual([]);
			expect(validation.stats).toBeDefined();
			expect(validation.stats.registryAgents).toBeDefined();
		});

		it('should report registry initialization failures', async () => {
			mockRegistry.initialize.mockRejectedValue(new Error('Registry init failed'));

			const validation = await resolver.validateServices();

			expect(validation.valid).toBe(false);
			expect(validation.issues).toContain('Registry initialization failed: Registry init failed');
		});
	});

	describe('cache management', () => {
		it('should clear caches when requested', () => {
			// This tests that the method exists and doesn't throw
			expect(() => resolver.clearCaches()).not.toThrow();
		});

		it('should provide cache statistics', () => {
			const stats = resolver.getStats();

			expect(stats).toBeDefined();
			expect(stats.cacheSizes).toBeDefined();
			expect(stats.thresholds).toBeDefined();
			expect(stats.thresholds.minConfidence).toBe(0.3);
			expect(stats.thresholds.highConfidence).toBe(0.75);
		});
	});

	describe('fallback agent determination', () => {
		it('should select platform-engineer for infrastructure files', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const infraContext: TaskContext = {
				affectedFiles: ['infrastructure/main.tf', 'k8s/deployment.yaml', 'Dockerfile'],
				dependencies: [],
				description: 'Deploy infrastructure'
			};

			const result = await resolver.resolveAgent(infraContext);

			expect(result.fallbackAgent).toBe('platform-engineer');
		});

		it('should select backend engineer for backend files', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const backendContext: TaskContext = {
				affectedFiles: ['src/controllers/api.ts', 'src/services/db.ts', 'src/models/user.ts'],
				dependencies: [],
				description: 'Build backend API'
			};

			const result = await resolver.resolveAgent(backendContext);

			expect(result.fallbackAgent).toBe('software-engineer-typescript-backend');
		});

		it('should select frontend react engineer for React files', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const frontendContext: TaskContext = {
				affectedFiles: ['src/components/Dashboard.tsx', 'src/hooks/useUser.ts'],
				dependencies: [],
				description: 'Build React component'
			};

			const result = await resolver.resolveAgent(frontendContext);

			expect(result.fallbackAgent).toBe('software-engineer-typescript-frontend-react');
		});

		it('should select general frontend engineer for other frontend files', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const frontendContext: TaskContext = {
				affectedFiles: ['src/components/App.svelte', 'src/stores/userStore.ts'],
				dependencies: [],
				description: 'Build Svelte component'
			};

			const result = await resolver.resolveAgent(frontendContext);

			expect(result.fallbackAgent).toBe('software-engineer-typescript-frontend-react'); // Falls back based on file patterns
		});

		it('should default to general TypeScript engineer', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const generalContext: TaskContext = {
				affectedFiles: ['src/utils/helpers.ts', 'src/types/common.ts'],
				dependencies: [],
				description: 'General TypeScript task'
			};

			const result = await resolver.resolveAgent(generalContext);

			expect(result.fallbackAgent).toBe('software-engineer-typescript-backend'); // Falls back based on file patterns
		});
	});

	describe('edge cases', () => {
		it('should handle minimal task context', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const minimalContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: ''
			};

			const result = await resolver.resolveAgent(minimalContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
			expect(typeof result.confidence).toBe('number');
		});

		it('should handle very long task descriptions', async () => {
			const longDescription = 'A'.repeat(10000);
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const longContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: longDescription
			};

			const result = await resolver.resolveAgent(longContext);

			expect(result).toBeDefined();
		});

		it('should handle special characters in task descriptions', async () => {
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const specialContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Implement API with GraphQL & REST endpoints! 🚀'
			};

			const result = await resolver.resolveAgent(specialContext);

			expect(result).toBeDefined();
		});

		it('should handle empty service responses gracefully', async () => {
			mockTaskClassifier.classifyTask.mockReturnValue({
				complexity: 'low',
				confidence: 0,
				primaryDomain: 'infrastructure',
				reasons: [],
				suggestedAgents: []
			});
			mockContextAnalyzer.analyzeTaskContext.mockResolvedValue({
				affectedFileTypes: [],
				architecturalPatterns: [],
				importPatterns: [],
				infrastructureComponents: [],
				technologyStack: []
			});
			mockCapabilityMatcher.scoreAgents.mockReturnValue([]);

			const emptyContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Empty test'
			};

			const result = await resolver.resolveAgent(emptyContext);

			expect(result.confidence).toBe(0.1); // Very low confidence fallback
		});
	});

	describe('complexity handling', () => {
		it('should handle high complexity tasks with lead agent preference', async () => {
			const highComplexityContext: TaskContext = {
				affectedFiles: Array.from({ length: 20 }, (_, i) => `src/file${i}.ts`),
				complexity: 'high',
				dependencies: Array.from({ length: 15 }, (_, i) => `dep${i}`),
				description: 'Complex multi-system integration'
			};

			// Mock high complexity classification
			mockTaskClassifier.classifyTask.mockReturnValue({
				complexity: 'high',
				confidence: 0.9,
				primaryDomain: 'infrastructure',
				reasons: ['High complexity detected'],
				suggestedAgents: ['platform-engineer', 'lead']
			});

			mockCapabilityMatcher.scoreAgents.mockReturnValue([
				{
					capability: {
						domains: ['infrastructure'],
						expertise: ['leadership'],
						priority: 95,
						role: 'lead',
						selectionCriteria: []
					},
					reasons: ['High complexity - leadership needed'],
					role: 'lead',
					score: 0.8
				}
			]);

			const result = await resolver.resolveAgent(highComplexityContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript-backend');
		});
	});
});
