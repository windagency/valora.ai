/**
 * Agent Selection Test Helpers and Utilities
 *
 * Provides shared test infrastructure, mock services, and utility functions
 * for the dynamic sub-agent selection system tests
 */

import { AgentSelection, TaskContext } from 'types/agent.types';
import { vi } from 'vitest';

// Test data factories
export class TestDataFactory {
	/**
	 * Creates realistic task contexts for different scenarios
	 */
	static createTaskContexts(): Record<string, TaskContext[]> {
		return {
			ambiguous: [
				{
					affectedFiles: ['src/utils/helper.ts'],
					dependencies: ['typescript'],
					description: 'Fix the bug'
				},
				{
					affectedFiles: ['src/some-file.ts'],
					dependencies: [],
					description: 'Update the code'
				},
				{
					affectedFiles: [],
					dependencies: [],
					description: ''
				}
			],
			backend: [
				{
					affectedFiles: [
						'src/controllers/user.controller.ts',
						'src/services/user.service.ts',
						'src/routes/user.routes.ts'
					],
					dependencies: ['express', 'mongoose', 'jsonwebtoken', 'bcrypt'],
					description: 'Implement REST API endpoints with authentication'
				},
				{
					affectedFiles: ['src/graphql/schema.ts', 'src/graphql/resolvers/user.resolver.ts'],
					dependencies: ['@apollo/server', 'graphql', 'type-graphql'],
					description: 'Build GraphQL API with resolvers'
				}
			],
			complex: [
				{
					affectedFiles: [
						'src/components/ProductList.tsx',
						'src/controllers/product.controller.ts',
						'infrastructure/main.tf',
						'k8s/deployment.yaml',
						'Dockerfile'
					],
					dependencies: ['react', 'express', 'mongoose', 'terraform', 'kubernetes', 'stripe'],
					description: 'Build complete e-commerce platform with React frontend, Node.js backend, and AWS infrastructure'
				}
			],
			frontend: [
				{
					affectedFiles: ['src/components/Dashboard/Dashboard.tsx', 'src/components/Dashboard/Dashboard.test.tsx'],
					dependencies: ['react', 'typescript', '@types/react', 'react-dom'],
					description: 'Build React dashboard component with TypeScript'
				},
				{
					affectedFiles: ['app/dashboard/page.tsx', 'app/dashboard/layout.tsx'],
					dependencies: ['next', 'react', 'typescript'],
					description: 'Create Next.js page with server-side rendering'
				}
			],
			infrastructure: [
				{
					affectedFiles: ['infrastructure/main.tf', 'infrastructure/variables.tf', 'infrastructure/outputs.tf'],
					dependencies: ['terraform', 'aws-cli'],
					description: 'Set up AWS infrastructure with Terraform'
				},
				{
					affectedFiles: ['k8s/deployment.yaml', 'k8s/service.yaml', 'k8s/ingress.yaml'],
					dependencies: ['kubernetes', 'kubectl', 'helm'],
					description: 'Configure Kubernetes deployment with ingress'
				}
			],
			security: [
				{
					affectedFiles: ['src/auth/oauth.strategy.ts', 'src/auth/jwt.guard.ts'],
					dependencies: ['passport', 'passport-oauth2', 'jsonwebtoken', 'helmet'],
					description: 'Implement OAuth2 authentication with JWT'
				},
				{
					affectedFiles: ['src/middleware/security.middleware.ts', 'src/utils/sanitizer.ts'],
					dependencies: ['helmet', 'express-rate-limit', 'dompurify'],
					description: 'Add security headers and vulnerability fixes'
				}
			]
		};
	}

	/**
	 * Creates expected agent selections for test validation
	 */
	static createExpectedSelections(): Record<string, AgentSelection> {
		return {
			backendAPI: {
				confidence: 0.9,
				fallback: false,
				reasons: ['API controllers detected', 'Backend dependencies found'],
				selectedAgent: 'software-engineer-typescript-backend'
			},
			complex: {
				confidence: 0.75,
				fallback: false,
				reasons: ['Multi-domain complexity detected', 'Architecture patterns identified'],
				selectedAgent: 'lead'
			},
			fallback: {
				confidence: 0.2,
				fallback: true,
				reasons: ['Unclear requirements', 'Minimal context provided'],
				selectedAgent: 'software-engineer-typescript'
			},
			frontendReact: {
				confidence: 0.85,
				fallback: false,
				reasons: ['React components detected', 'TypeScript files present'],
				selectedAgent: 'software-engineer-typescript-frontend-react'
			},
			infrastructure: {
				confidence: 0.95,
				fallback: false,
				reasons: ['Terraform files detected', 'Infrastructure patterns identified'],
				selectedAgent: 'platform-engineer'
			},
			security: {
				confidence: 0.88,
				fallback: false,
				reasons: ['Security dependencies found', 'Authentication code detected'],
				selectedAgent: 'secops-engineer'
			}
		};
	}
}

// Performance measurement utilities
export class PerformanceUtils {
	private static measurements: Map<string, number[]> = new Map();

	/**
	 * Measures execution time of async operations
	 */
	static async measureExecutionTime<T>(
		operation: () => Promise<T>,
		label: string
	): Promise<{ result: T; duration: number }> {
		const startTime = Date.now();
		const result = await operation();
		const duration = Date.now() - startTime;

		// Store measurement for analysis
		if (!this.measurements.has(label)) {
			this.measurements.set(label, []);
		}
		this.measurements.get(label)!.push(duration);

		return { duration, result };
	}

	/**
	 * Gets performance statistics for a label
	 */
	static getPerformanceStats(label: string): {
		count: number;
		avg: number;
		min: number;
		max: number;
		p95: number;
		p99: number;
	} | null {
		const measurements = this.measurements.get(label);
		if (!measurements || measurements.length === 0) {
			return null;
		}

		const sorted = measurements.sort((a, b) => a - b);
		const count = measurements.length;
		const avg = measurements.reduce((a, b) => a + b, 0) / count;
		const min = sorted[0];
		const max = sorted[sorted.length - 1];
		const p95 = sorted[Math.floor(sorted.length * 0.95)];
		const p99 = sorted[Math.floor(sorted.length * 0.99)];

		return { avg, count, max, min, p95, p99 };
	}

	/**
	 * Clears all measurements
	 */
	static clearMeasurements(): void {
		this.measurements.clear();
	}

	/**
	 * Validates performance against thresholds
	 */
	static validatePerformance(
		label: string,
		thresholds: { maxAvg?: number; maxP95?: number; maxP99?: number }
	): boolean {
		const stats = this.getPerformanceStats(label);
		if (!stats) return false;

		if (thresholds.maxAvg && stats.avg > thresholds.maxAvg) return false;
		if (thresholds.maxP95 && stats.p95 > thresholds.maxP95) return false;
		if (thresholds.maxP99 && stats.p99 > thresholds.maxP99) return false;

		return true;
	}
}

// Mock service utilities
export class MockUtils {
	/**
	 * Creates a mock agent registry for testing
	 */
	static createMockRegistry() {
		return {
			capabilities: {
				lead: {
					domains: ['architecture', 'leadership', 'engineering-excellence'],
					expertise: ['architecture', 'ddd', 'system-design'],
					priority: 90,
					role: 'lead',
					selectionCriteria: ['architecture-files', 'strategy-files']
				},
				'platform-engineer': {
					domains: ['infrastructure', 'cloud', 'devops'],
					expertise: ['terraform', 'kubernetes', 'aws'],
					priority: 90,
					role: 'platform-engineer',
					selectionCriteria: ['terraform-files', 'kubernetes-manifests']
				},
				'secops-engineer': {
					domains: ['security', 'compliance'],
					expertise: ['owasp', 'penetration-testing'],
					priority: 95,
					role: 'secops-engineer',
					selectionCriteria: ['security-files', 'authentication-code']
				},
				'software-engineer-typescript-backend': {
					domains: ['backend-api', 'typescript-backend-general'],
					expertise: ['nodejs', 'express', 'graphql'],
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
			},
			selectionCriteria: {
				'api-files': 'API-related files',
				'architecture-files': 'Architecture documentation',
				'authentication-code': 'Authentication and authorization code',
				'code-files': 'General code files',
				'kubernetes-manifests': 'Kubernetes YAML manifests',
				'react-imports': 'Files importing React',
				'security-files': 'Security-related files',
				'strategy-files': 'Strategic planning files',
				'terraform-files': 'Terraform configuration files',
				'typescript-files': 'TypeScript source files'
			}
		};
	}

	/**
	 * Creates mock file system operations
	 */
	static mockFileSystem() {
		const mockRegistry = this.createMockRegistry();

		return {
			readFile: vi.fn(() => JSON.stringify(mockRegistry)),
			resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
		};
	}

	/**
	 * Creates mock service instances for integration testing
	 */
	static createMockServices() {
		return {
			capabilityMatcher: {
				calculateConfidence: vi.fn(),
				findBestMatch: vi.fn(),
				initialize: vi.fn().mockResolvedValue(undefined)
			},
			contextAnalyzer: {
				analyzeContext: vi.fn(),
				initialize: vi.fn().mockResolvedValue(undefined)
			},
			registry: {
				findAgentsByDomain: vi.fn(),
				getAllCapabilities: vi.fn(),
				getCapability: vi.fn(),
				initialize: vi.fn().mockResolvedValue(undefined)
			},
			taskClassifier: {
				classifyTask: vi.fn(),
				initialize: vi.fn().mockResolvedValue(undefined)
			}
		};
	}
}

// Accuracy measurement utilities
export class AccuracyUtils {
	private static results: Array<{
		expected: string;
		actual: string;
		confidence: number;
		fallback: boolean;
		correct: boolean;
	}> = [];

	/**
	 * Records an accuracy measurement
	 */
	static recordResult(expectedAgent: string, actualResult: AgentSelection): void {
		this.results.push({
			actual: actualResult.selectedAgent,
			confidence: actualResult.confidence,
			correct: actualResult.selectedAgent === expectedAgent,
			expected: expectedAgent,
			fallback: actualResult.fallback || false
		});
	}

	/**
	 * Gets accuracy statistics
	 */
	static getAccuracyStats(): {
		total: number;
		correct: number;
		incorrect: number;
		accuracy: number;
		avgConfidence: number;
		fallbackRate: number;
	} {
		if (this.results.length === 0) {
			return {
				accuracy: 0,
				avgConfidence: 0,
				correct: 0,
				fallbackRate: 0,
				incorrect: 0,
				total: 0
			};
		}

		const total = this.results.length;
		const correct = this.results.filter((r) => r.correct).length;
		const incorrect = total - correct;
		const accuracy = correct / total;
		const avgConfidence = this.results.reduce((sum, r) => sum + r.confidence, 0) / total;
		const fallbackRate = this.results.filter((r) => r.fallback).length / total;

		return {
			accuracy,
			avgConfidence,
			correct,
			fallbackRate,
			incorrect,
			total
		};
	}

	/**
	 * Clears all recorded results
	 */
	static clearResults(): void {
		this.results = [];
	}

	/**
	 * Validates accuracy against thresholds
	 */
	static validateAccuracy(thresholds: {
		minAccuracy?: number;
		maxFallbackRate?: number;
		minAvgConfidence?: number;
	}): boolean {
		const stats = this.getAccuracyStats();

		if (thresholds.minAccuracy && stats.accuracy < thresholds.minAccuracy) return false;
		if (thresholds.maxFallbackRate && stats.fallbackRate > thresholds.maxFallbackRate) return false;
		if (thresholds.minAvgConfidence && stats.avgConfidence < thresholds.minAvgConfidence) return false;

		return true;
	}
}

// Test assertion utilities
export class AssertionUtils {
	/**
	 * Asserts agent selection with detailed error messages
	 */
	static assertAgentSelection(result: AgentSelection, expectedAgent: string, minConfidence: number = 0.5): void {
		expect(result.selectedAgent).toBe(expectedAgent);
		expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
		expect(result.reasons).toBeDefined();
		expect(result.reasons.length).toBeGreaterThan(0);
		expect(result.fallback).toBe(false);
	}

	/**
	 * Asserts fallback behavior
	 */
	static assertFallback(result: AgentSelection, maxConfidence: number = 0.5): void {
		expect(result.selectedAgent).toBeDefined();
		expect(result.confidence).toBeLessThanOrEqual(maxConfidence);
		expect(result.fallback).toBe(true);
		expect(result.reasons).toBeDefined();
		expect(result.reasons.some((r) => r.includes('fallback') || r.includes('unclear'))).toBe(true);
	}

	/**
	 * Asserts performance thresholds
	 */
	static assertPerformance(duration: number, maxDuration: number): void {
		expect(duration).toBeLessThanOrEqual(maxDuration);
		expect(duration).toBeGreaterThan(0);
	}

	/**
	 * Asserts service health
	 */
	static assertServiceHealth(health: any): void {
		expect(health.valid).toBe(true);
		expect(health.issues).toEqual([]);
		expect(health.stats.registryAgents).toBeGreaterThan(0);
		expect(health.stats.registryDomains).toBeGreaterThan(0);
	}
}

// Test scenario builders
export class ScenarioBuilder {
	/**
	 * Builds comprehensive test scenarios
	 */
	static buildScenarios(): Array<{
		name: string;
		description: string;
		taskContext: TaskContext;
		expectedAgent: string;
		minConfidence: number;
		category: string;
	}> {
		const taskContexts = TestDataFactory.createTaskContexts();

		return [
			// Frontend scenarios
			...taskContexts.frontend.map((ctx, i) => ({
				category: 'frontend',
				description: `Frontend development: ${ctx.description}`,
				expectedAgent: 'software-engineer-typescript-frontend-react',
				// Specialized React frontend agent
				minConfidence: 0.05,
				name: `frontend-scenario-${i + 1}`,
				taskContext: ctx
			})),

			// Backend scenarios
			...taskContexts.backend.map((ctx, i) => ({
				category: 'backend',
				description: `Backend development: ${ctx.description}`,
				expectedAgent: 'software-engineer-typescript-backend',
				// Specialized backend agent
				minConfidence: 0.05,
				name: `backend-scenario-${i + 1}`,
				taskContext: ctx
			})),

			// Infrastructure scenarios
			...taskContexts.infrastructure.map((ctx, i) => ({
				category: 'infrastructure',
				description: `Infrastructure setup: ${ctx.description}`,
				expectedAgent: 'platform-engineer',
				// Infrastructure specialist
				minConfidence: 0.05,
				name: `infrastructure-scenario-${i + 1}`,
				taskContext: ctx
			})),

			// Security scenarios
			...taskContexts.security.map((ctx, i) => ({
				category: 'security',
				description: `Security implementation: ${ctx.description}`,
				expectedAgent: 'secops-engineer',
				// Security specialist
				minConfidence: 0.05,
				name: `security-scenario-${i + 1}`,
				taskContext: ctx
			})),

			// Complex scenarios
			...taskContexts.complex.map((ctx, i) => ({
				category: 'complex',
				description: `Complex multi-domain: ${ctx.description}`,
				expectedAgent: 'lead',
				// Lead agent for complex multi-domain tasks
				minConfidence: 0.05,
				name: `complex-scenario-${i + 1}`,
				taskContext: ctx
			})),

			// Ambiguous scenarios (graceful handling)
			...taskContexts.ambiguous.map((ctx, i) => ({
				category: 'ambiguous',
				description: `Ambiguous task: ${ctx.description || 'empty'}`,
				expectedAgent: 'software-engineer-typescript',
				// General TypeScript engineer for ambiguous tasks
				minConfidence: 0.05,
				name: `ambiguous-scenario-${i + 1}`,
				taskContext: ctx
			}))
		];
	}
}

// Export everything as a namespace for easy importing
export const TestHelpers = {
	AccuracyUtils,
	AssertionUtils,
	MockUtils,
	PerformanceUtils,
	ScenarioBuilder,
	TestDataFactory
};
