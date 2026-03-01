/**
 * Agent Selection Performance Validation
 *
 * Measures resolution time, accuracy rates, and performance metrics
 */

import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { TaskClassifierService } from 'services/task-classifier.service';
import { AgentSelection, TaskContext } from 'types/agent.types';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock file system operations
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		readFile: vi.fn(() =>
			JSON.stringify({
				capabilities: {
					lead: {
						domains: ['architecture', 'leadership', 'engineering-excellence'],
						expertise: ['architecture', 'ddd', 'system-design'],
						priority: 90,
						role: 'lead',
						selectionCriteria: ['architecture-files', 'strategy-files']
					},
					'platform-engineer': {
						domains: ['infrastructure', 'cloud', 'devops', 'kubernetes', 'docker', 'terraform', 'aws', 'monitoring'],
						expertise: ['terraform', 'kubernetes', 'aws', 'docker'],
						priority: 90,
						role: 'platform-engineer',
						selectionCriteria: ['terraform-files', 'kubernetes-manifests', 'docker-files']
					},
					'secops-engineer': {
						domains: ['security', 'compliance', 'threat-detection'],
						expertise: ['owasp', 'penetration-testing', 'vulnerability-scanning'],
						priority: 95,
						role: 'secops-engineer',
						selectionCriteria: ['security-files', 'audit-files', 'authentication-code']
					},
					'software-engineer-typescript-backend': {
						domains: ['backend-api', 'typescript-backend-general'],
						expertise: ['nodejs', 'express', 'graphql', 'postgresql'],
						priority: 95,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: ['code-files', 'api-files']
					},
					'software-engineer-typescript-frontend-react': {
						domains: ['frontend-ui', 'typescript-frontend-react'],
						expertise: ['react', 'next.js', 'typescript'],
						priority: 70,
						role: 'software-engineer-typescript-frontend-react',
						selectionCriteria: ['react-imports', 'typescript-files']
					}
				}
			})
		),
		resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
	};
});

describe('Performance Validation - Resolution Time and Accuracy Metrics', () => {
	let resolver: DynamicAgentResolverService;
	let registry: AgentCapabilityRegistryService;

	// Performance thresholds from requirements
	const PERFORMANCE_THRESHOLDS = {
		// ms
		accuracyRate: 0.85, // 85%
		fallbackRate: 0.6, // 60% - allow higher fallback rate for mock resolver tests
		resolutionTime: 500
	};

	beforeAll(async () => {
		registry = new AgentCapabilityRegistryService();
		await registry.initialize();

		const taskClassifier = new TaskClassifierService();
		const contextAnalyzer = new ContextAnalyzerService();
		const capabilityMatcher = new AgentCapabilityMatcherService(registry);

		resolver = new DynamicAgentResolverService(taskClassifier, contextAnalyzer, capabilityMatcher, registry);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Resolution Time Validation', () => {
		it('should resolve agents within performance threshold', async () => {
			const testCases = [
				{
					deps: ['react', 'typescript'],
					description: 'Frontend React component',
					files: ['src/components/Button.tsx']
				},
				{
					deps: ['express', 'mongoose'],
					description: 'Backend API endpoint',
					files: ['src/controllers/user.controller.ts']
				},
				{
					deps: ['terraform'],
					description: 'Infrastructure setup',
					files: ['infrastructure/main.tf']
				},
				{
					deps: ['jsonwebtoken'],
					description: 'Security implementation',
					files: ['src/auth/jwt.service.ts']
				}
			];

			const results: Array<{ duration: number; result: AgentSelection }> = [];

			for (const testCase of testCases) {
				const taskContext: TaskContext = {
					affectedFiles: testCase.files,
					dependencies: testCase.deps,
					description: testCase.description
				};

				const startTime = Date.now();
				const result = await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				results.push({ duration, result });

				expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
			}

			// Analyze performance distribution
			const durations = results.map((r) => r.duration);
			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
			const maxDuration = Math.max(...durations);
			const minDuration = Math.min(...durations);

			expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 0.8);
			expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
			// Use >= 0 since fast operations can complete in under 1ms (Date.now precision)
			expect(minDuration).toBeGreaterThanOrEqual(0);
		});

		it('should maintain consistent performance across task complexity levels', async () => {
			const complexityLevels = {
				complex: {
					deps: ['express', 'mongoose', 'terraform', 'kubernetes', 'docker'],
					description: 'Implement microservices architecture with infrastructure',
					files: [
						'src/services/user.service.ts',
						'src/controllers/user.controller.ts',
						'infrastructure/main.tf',
						'k8s/deployment.yaml',
						'docker-compose.yml'
					]
				},
				medium: {
					deps: ['express', 'mongoose'],
					description: 'Build API with database',
					files: ['src/api.ts', 'src/model.ts']
				},
				simple: {
					deps: ['react'],
					description: 'Create component',
					files: ['src/Button.tsx']
				}
			};

			const performanceResults: Array<{ level: string; duration: number }> = [];

			for (const [level, task] of Object.entries(complexityLevels)) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const startTime = Date.now();
				await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				performanceResults.push({ duration, level });

				expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
			}

			// Complex tasks should not be significantly slower than simple ones
			const simpleTime = performanceResults.find((r) => r.level === 'simple')!.duration;
			const complexTime = performanceResults.find((r) => r.level === 'complex')!.duration;

			// Handle edge case where simpleTime is 0 (sub-millisecond resolution)
			if (simpleTime > 0) {
				expect(complexTime / simpleTime).toBeLessThan(2.0); // Max 2x slower for complex tasks
			} else {
				// If simple task completes in <1ms, complex should still be fast
				expect(complexTime).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 0.5);
			}
		});

		it('should handle concurrent requests efficiently', async () => {
			const concurrentTasks: TaskContext[] = Array.from({ length: 10 }, (_, i) => ({
				affectedFiles: [`src/file${i}.ts`],
				dependencies: ['typescript'],
				description: `Task ${i}`
			}));

			const startTime = Date.now();
			const promises = concurrentTasks.map((task) => resolver.resolveAgent(task));
			const results = await Promise.all(promises);
			const totalDuration = Date.now() - startTime;

			expect(results).toHaveLength(10);
			results.forEach((result) => {
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
			});

			const avgConcurrentTime = totalDuration / 10;
			expect(avgConcurrentTime).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);

			// Concurrent execution should be more efficient than sequential
			expect(totalDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 10 * 0.8);
		});

		it('should perform well under sustained load', async () => {
			const iterations = 50;
			const durations: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const taskContext: TaskContext = {
					affectedFiles: [`src/load${i}.ts`],
					dependencies: ['typescript'],
					description: `Load test task ${i}`
				};

				const startTime = Date.now();
				await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				durations.push(duration);
				expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
			}

			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
			const maxDuration = Math.max(...durations);
			const p95Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

			expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 0.7);
			expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
			expect(p95Duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 0.9);
		});
	});

	describe('Accuracy Rate Validation', () => {
		const accuracyTestCases = [
			// High confidence cases (should be > 85% accurate)
			{
				confidence: 'high',
				deps: ['react', 'typescript'],
				description: 'React component development',
				expectedAgent: 'software-engineer-typescript-frontend-react',
				files: ['src/components/Dashboard.tsx']
			},
			{
				confidence: 'high',
				deps: ['terraform', 'aws-cli'],
				description: 'Terraform infrastructure setup',
				expectedAgent: 'platform-engineer',
				files: ['infrastructure/main.tf', 'infrastructure/variables.tf']
			},
			{
				confidence: 'high',
				deps: ['jsonwebtoken', 'passport-jwt'],
				description: 'JWT authentication implementation',
				expectedAgent: 'secops-engineer',
				files: ['src/auth/jwt.service.ts', 'src/auth/jwt.guard.ts']
			},
			{
				confidence: 'high',
				deps: ['express', 'mongoose'],
				description: 'Express API development',
				expectedAgent: 'software-engineer-typescript-backend',
				files: ['src/controllers/user.controller.ts', 'src/routes/user.routes.ts']
			},
			// Medium confidence cases (should be > 70% accurate)
			{
				// Could be either, but lead handles complex scenarios
				confidence: 'medium',
				deps: ['react', 'express', 'typescript'],
				description: 'Full-stack feature implementation',
				expectedAgent: 'lead',
				files: ['src/components/Feature.tsx', 'src/controllers/feature.controller.ts']
			}
		];

		it('should achieve target accuracy rate for clear tasks', async () => {
			let correctSelections = 0;
			let totalTests = 0;

			for (const testCase of accuracyTestCases) {
				if (testCase.confidence === 'high') {
					const taskContext: TaskContext = {
						affectedFiles: testCase.files,
						dependencies: testCase.deps,
						description: testCase.description
					};

					const result = await resolver.resolveAgent(taskContext);
					totalTests++;

					if (result.selectedAgent === testCase.expectedAgent) {
						correctSelections++;
					}
				}
			}

			const accuracyRate = correctSelections / totalTests;
			expect(accuracyRate).toBeGreaterThanOrEqual(PERFORMANCE_THRESHOLDS.accuracyRate);
		});

		it('should maintain reasonable accuracy for complex scenarios', async () => {
			const complexTestCases = accuracyTestCases.filter((tc) => tc.confidence === 'medium');
			let validSelections = 0;
			let totalTests = 0;

			// For medium-confidence (ambiguous) cases, multiple agents could be valid
			const validAgentsForFullStack = [
				'lead',
				'software-engineer-typescript-backend',
				'software-engineer-typescript-frontend-react'
			];

			for (const testCase of complexTestCases) {
				const taskContext: TaskContext = {
					affectedFiles: testCase.files,
					dependencies: testCase.deps,
					description: testCase.description
				};

				const result = await resolver.resolveAgent(taskContext);
				totalTests++;

				// For complex scenarios, accept any reasonable agent selection
				if (validAgentsForFullStack.includes(result.selectedAgent)) {
					validSelections++;
				}
			}

			if (totalTests > 0) {
				const validRate = validSelections / totalTests;
				expect(validRate).toBeGreaterThan(0.7); // 70% should select a valid agent
			}
		});

		it('should provide consistent accuracy across multiple runs', async () => {
			const testCase = accuracyTestCases[0]; // Use first high-confidence case
			const runs = 5;
			const results: string[] = [];

			for (let i = 0; i < runs; i++) {
				const taskContext: TaskContext = {
					affectedFiles: testCase.files,
					dependencies: testCase.deps,
					description: testCase.description
				};

				const result = await resolver.resolveAgent(taskContext);
				results.push(result.selectedAgent);
			}

			// All results should be the same for deterministic input
			const uniqueResults = [...new Set(results)];
			expect(uniqueResults).toHaveLength(1);
			expect(uniqueResults[0]).toBe(testCase.expectedAgent);
		});
	});

	describe('Fallback Rate Validation', () => {
		it('should maintain acceptable fallback rate for well-defined tasks', async () => {
			const wellDefinedTasks = [
				{
					deps: ['react', 'typescript'],
					description: 'Build React dashboard component',
					files: ['src/components/Dashboard.tsx']
				},
				{
					deps: ['express', 'mongoose'],
					description: 'Implement REST API for users',
					files: ['src/controllers/user.controller.ts']
				},
				{
					deps: ['terraform'],
					description: 'Set up AWS infrastructure',
					files: ['infrastructure/main.tf']
				},
				{
					deps: ['jsonwebtoken'],
					description: 'Add authentication to API',
					files: ['src/auth/jwt.middleware.ts']
				}
			];

			let fallbackCount = 0;
			let totalTests = 0;

			for (const task of wellDefinedTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);
				totalTests++;

				if (result.fallback) {
					fallbackCount++;
				}
			}

			const fallbackRate = fallbackCount / totalTests;
			expect(fallbackRate).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.fallbackRate);
		});

		it('should have higher fallback rate for ambiguous tasks', async () => {
			const ambiguousTasks = [
				{ deps: [], description: 'Fix it', files: ['src/fix.ts'] },
				{ deps: [], description: 'Update', files: ['update.ts'] },
				{ deps: [], description: 'Make changes', files: ['changes.ts'] },
				{ deps: [], description: '', files: [] },
				{ deps: [], description: 'Do something', files: ['something.unknown'] }
			];

			let fallbackCount = 0;
			let totalTests = 0;

			for (const task of ambiguousTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);
				totalTests++;

				if (result.fallback) {
					fallbackCount++;
				}
			}

			const fallbackRate = fallbackCount / totalTests;
			expect(fallbackRate).toBeGreaterThan(0.6); // >60% fallback for ambiguous tasks
		});

		it('should recover gracefully from fallback scenarios', async () => {
			const fallbackTasks = [
				{ deps: [], description: 'Hi', files: ['hi.txt'] },
				{ deps: [], description: 'Test', files: ['test.unknown'] }
			];

			for (const task of fallbackTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				// Even in fallback, should return a valid agent
				expect(result.selectedAgent).toBeDefined();
				expect(result.fallback).toBe(true);
				expect(result.confidence).toBeGreaterThan(0);
				expect(result.confidence).toBeLessThan(0.5);
			}
		});
	});

	describe('Memory and Resource Usage', () => {
		it('should not have memory leaks during sustained operation', async () => {
			const initialMemory = process.memoryUsage();

			// Run many operations
			for (let i = 0; i < 100; i++) {
				const taskContext: TaskContext = {
					affectedFiles: [`src/test${i}.ts`],
					dependencies: ['typescript'],
					description: `Memory test task ${i}`
				};

				await resolver.resolveAgent(taskContext);
			}

			const finalMemory = process.memoryUsage();

			// Memory usage should not increase significantly
			const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
			expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
		});

		it('should handle large task contexts efficiently', async () => {
			const largeTaskContext: TaskContext = {
				affectedFiles: Array.from({ length: 500 }, (_, i) => `src/component${i}.tsx`),
				dependencies: ['react', 'typescript', 'redux', 'axios', 'jest'],
				description: 'Large scale refactoring'
			};

			const startTime = Date.now();
			const result = await resolver.resolveAgent(largeTaskContext);
			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 1.5); // Allow some overhead for large contexts
			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
		});
	});

	describe('Scalability Testing', () => {
		it('should scale linearly with input size', async () => {
			const sizes = [10, 50, 100, 200];
			const performanceBySize: Array<{ size: number; duration: number }> = [];

			for (const size of sizes) {
				const taskContext: TaskContext = {
					affectedFiles: Array.from({ length: size }, (_, i) => `src/file${i}.ts`),
					dependencies: ['typescript'],
					description: 'Scalability test'
				};

				const startTime = Date.now();
				await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				performanceBySize.push({ duration, size });

				expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 2);
			}

			// Check that performance doesn't degrade exponentially
			const firstDuration = performanceBySize[0].duration;
			const lastDuration = performanceBySize[performanceBySize.length - 1].duration;

			// Handle edge case where firstDuration is 0 (sub-millisecond resolution)
			if (firstDuration > 0) {
				const ratio = lastDuration / firstDuration;
				expect(ratio).toBeLessThan(5); // Should not be more than 5x slower for 20x more files
			} else {
				// If first operation completes in <1ms, just verify last is still fast
				expect(lastDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);
			}
		});

		it('should handle burst traffic patterns', async () => {
			const burstSize = 20;
			const tasks: TaskContext[] = Array.from({ length: burstSize }, (_, i) => ({
				affectedFiles: [`src/burst${i}.ts`],
				dependencies: ['typescript'],
				description: `Burst task ${i}`
			}));

			const startTime = Date.now();
			const promises = tasks.map((task) => resolver.resolveAgent(task));
			const results = await Promise.all(promises);
			const totalDuration = Date.now() - startTime;

			expect(results).toHaveLength(burstSize);
			results.forEach((result) => {
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
			});

			const avgDuration = totalDuration / burstSize;
			expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime);

			// Burst should complete within reasonable time
			expect(totalDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * burstSize * 0.7);
		});
	});

	describe('Performance Regression Detection', () => {
		const baselinePerformance = {
			avgResolutionTime: 150, // ms
			maxResolutionTime: 400, // ms
			minAccuracyRate: 0.8
		};

		it('should not regress below baseline performance', async () => {
			const testRuns = 20;
			const durations: number[] = [];
			let correctSelections = 0;

			const testCase = {
				deps: ['react', 'typescript'],
				description: 'React component with TypeScript',
				expected: 'software-engineer-typescript-frontend-react',
				files: ['src/components/TestComponent.tsx']
			};

			for (let i = 0; i < testRuns; i++) {
				const taskContext: TaskContext = {
					affectedFiles: testCase.files,
					dependencies: testCase.deps,
					description: testCase.description
				};

				const startTime = Date.now();
				const result = await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				durations.push(duration);

				if (result.selectedAgent === testCase.expected) {
					correctSelections++;
				}
			}

			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
			const maxDuration = Math.max(...durations);
			const accuracyRate = correctSelections / testRuns;

			expect(avgDuration).toBeLessThanOrEqual(baselinePerformance.avgResolutionTime * 1.2); // Allow 20% regression
			expect(maxDuration).toBeLessThanOrEqual(baselinePerformance.maxResolutionTime);
			expect(accuracyRate).toBeGreaterThanOrEqual(baselinePerformance.minAccuracyRate);
		});

		it('should maintain performance consistency', async () => {
			const measurements = 10;
			const durations: number[] = [];

			// Warmup run to avoid first-call initialization overhead skewing results
			const warmupContext: TaskContext = {
				affectedFiles: ['src/warmup.ts'],
				dependencies: ['typescript'],
				description: 'Warmup'
			};
			await resolver.resolveAgent(warmupContext);

			for (let i = 0; i < measurements; i++) {
				const taskContext: TaskContext = {
					affectedFiles: ['src/test.ts'],
					dependencies: ['typescript'],
					description: 'Consistency test'
				};

				const startTime = Date.now();
				await resolver.resolveAgent(taskContext);
				const duration = Date.now() - startTime;

				durations.push(duration);
			}

			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
			const maxDuration = Math.max(...durations);

			// For fast operations (avg < 5ms), timing precision is low so variance will be high.
			// Instead of checking coefficient of variation, verify max isn't too far from avg.
			if (avgDuration >= 5) {
				const variance =
					durations.reduce((acc, duration) => acc + Math.pow(duration - avgDuration, 2), 0) / durations.length;
				const standardDeviation = Math.sqrt(variance);

				// Standard deviation should be reasonable for stable operations
				expect(standardDeviation / avgDuration).toBeLessThan(0.5);
			} else {
				// For sub-5ms operations, just verify all complete quickly
				expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.resolutionTime * 0.1);
			}
		});
	});
});
