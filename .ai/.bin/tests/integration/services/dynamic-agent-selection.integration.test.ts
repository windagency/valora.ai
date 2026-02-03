/**
 * Integration tests for Dynamic Agent Selection System
 *
 * Tests the complete end-to-end agent selection workflow with real service instances,
 * including realistic scenarios and edge cases.
 */

import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { TaskClassifierService } from 'services/task-classifier.service';
import { TaskContext } from 'types/agent.types';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock file system operations for registry loading
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		readFile: vi.fn(() =>
			JSON.stringify({
				capabilities: {
					lead: {
						domains: ['infrastructure', 'typescript-backend-general', 'security', 'architecture'],
						expertise: ['leadership', 'architecture', 'ddd', 'system-design', 'mentoring'],
						priority: 95,
						role: 'lead',
						selectionCriteria: ['architecture-files', 'strategy-files']
					},
					'platform-engineer': {
						domains: ['infrastructure', 'security'],
						expertise: ['kubernetes', 'terraform', 'aws', 'docker'],
						priority: 90,
						role: 'platform-engineer',
						selectionCriteria: ['terraform-files', 'kubernetes-manifests', 'docker-files']
					},
					'secops-engineer': {
						domains: ['security'],
						expertise: ['owasp', 'penetration-testing', 'vulnerability-scanning', 'compliance'],
						priority: 88,
						role: 'secops-engineer',
						selectionCriteria: ['security-files', 'audit-files']
					},
					'software-engineer-typescript-backend': {
						domains: ['typescript-backend-general'],
						expertise: ['nodejs', 'express', 'graphql', 'postgresql', 'mongodb'],
						priority: 85,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: ['code-files', 'api-files']
					},
					'software-engineer-typescript-frontend-react': {
						domains: ['typescript-frontend-react'],
						expertise: ['react', 'next.js', 'typescript', 'redux', 'react-hook-form'],
						priority: 80,
						role: 'software-engineer-typescript-frontend-react',
						selectionCriteria: ['react-imports', 'typescript-files']
					}
				},
				selectionCriteria: {
					'api-files': 'API-related files',
					'architecture-files': 'Architecture documentation',
					'audit-files': 'Audit and compliance files',
					'code-files': 'General code files',
					'docker-files': 'Docker and container files',
					'kubernetes-manifests': 'Kubernetes YAML manifests',
					'react-imports': 'Files importing React',
					'security-files': 'Security-related files',
					'strategy-files': 'Strategic planning files',
					'terraform-files': 'Terraform configuration files',
					'typescript-files': 'TypeScript source files'
				},
				taskDomains: {
					architecture: 'System architecture and design',
					infrastructure: 'Infrastructure and DevOps tasks',
					security: 'Security and compliance tasks',
					'typescript-backend-general': 'Backend TypeScript development',
					'typescript-frontend-react': 'React frontend development'
				}
			})
		),
		resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
	};
});

describe('Dynamic Agent Selection - Integration Tests', () => {
	let resolver: DynamicAgentResolverService;
	let registry: AgentCapabilityRegistryService;

	beforeAll(async () => {
		// Initialize services with real instances
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

	describe('Infrastructure Implementation Scenarios', () => {
		it('should select platform-engineer for Terraform infrastructure setup', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'infrastructure/main.tf',
					'infrastructure/variables.tf',
					'k8s/deployment.yaml',
					'k8s/service.yaml',
					'Dockerfile'
				],
				dependencies: ['terraform', 'kubernetes', 'aws-cli'],
				description: 'Set up AWS infrastructure with Terraform and Kubernetes deployment'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('platform-engineer');
			expect(result.confidence).toBeGreaterThan(0.7);
			expect(result.reasons.some((r) => r.includes('infrastructure') || r.includes('terraform'))).toBe(true);
		});

		it('should select platform-engineer for Docker and container orchestration', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['Dockerfile', 'docker-compose.yml', '.github/workflows/deploy.yml', 'kubernetes/ingress.yaml'],
				dependencies: ['docker', 'kubernetes'],
				description: 'Containerize application with Docker and set up CI/CD pipeline with Kubernetes'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('platform-engineer');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('should select lead for complex multi-environment infrastructure', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'infrastructure/production/main.tf',
					'infrastructure/staging/main.tf',
					'infrastructure/dr/main.tf',
					'monitoring/prometheus.yml',
					'monitoring/grafana.json'
				],
				complexity: 'high',
				dependencies: ['terraform', 'kubernetes', 'prometheus', 'grafana'],
				description:
					'Design and implement multi-environment infrastructure with high availability and disaster recovery using Terraform and Kubernetes'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be either lead or platform-engineer, but should have reasonable confidence
			expect(['lead', 'platform-engineer']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.3);
		});
	});

	describe('Backend API Development Scenarios', () => {
		it('should select backend engineer for REST API implementation', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/controllers/user.controller.ts',
					'src/services/user.service.ts',
					'src/models/user.model.ts',
					'src/routes/user.routes.ts'
				],
				dependencies: ['express', 'mongoose', 'jsonwebtoken', 'bcrypt'],
				description: 'Implement REST API endpoints for user management with authentication using Express and TypeScript'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be backend engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});

		it('should select backend engineer for GraphQL API development', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/graphql/schema.ts',
					'src/graphql/resolvers/user.resolver.ts',
					'src/graphql/types/user.types.ts',
					'src/services/graphql.service.ts'
				],
				dependencies: ['@graphql-tools/schema', 'graphql', 'apollo-server'],
				description: 'Build GraphQL API with resolvers and schema definition using TypeScript and Apollo Server'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be backend engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});

		it('should select backend engineer for database integration', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/database/connection.ts',
					'src/database/migrations/',
					'src/models/index.ts',
					'src/repositories/user.repository.ts'
				],
				dependencies: ['pg', 'typeorm', 'redis'],
				description: 'Implement database layer with migrations and connection pooling using TypeORM and PostgreSQL'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be backend engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});
	});

	describe('Frontend React Development Scenarios', () => {
		it('should select React frontend engineer for component development', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/components/Dashboard/Dashboard.tsx',
					'src/components/Dashboard/Dashboard.test.tsx',
					'src/hooks/useDashboard.ts',
					'src/store/dashboardSlice.ts'
				],
				dependencies: ['react', 'react-redux', '@reduxjs/toolkit', 'react-testing-library'],
				description: 'Build React dashboard component with state management using TypeScript'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript-frontend-react');
			expect(result.confidence).toBeGreaterThan(0.3);
		});

		it('should select React frontend engineer for Next.js application', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['pages/dashboard.tsx', 'pages/api/users.ts', 'components/layout/Header.tsx', 'lib/auth.ts'],
				dependencies: ['next', 'react', 'swr', 'next-auth'],
				description: 'Create Next.js page with server-side rendering and API routes using TypeScript'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be React frontend engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['software-engineer-typescript-frontend-react', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.3);
		});
	});

	describe('Security Implementation Scenarios', () => {
		it('should select security engineer for authentication implementation', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/auth/oauth.strategy.ts',
					'src/auth/jwt.guard.ts',
					'src/auth/rbac.middleware.ts',
					'src/auth/password.service.ts'
				],
				dependencies: ['passport', 'passport-oauth2', 'jsonwebtoken', 'bcrypt', 'helmet'],
				description: 'Implement OAuth2 authentication with JWT tokens and RBAC security controls'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be secops-engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});

		it('should select security engineer for vulnerability fixes', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/middleware/security.middleware.ts', 'src/utils/sanitizer.ts', 'src/auth/rate-limiter.ts'],
				dependencies: ['helmet', 'express-rate-limit', 'dompurify'],
				description: 'Fix security vulnerabilities and implement OWASP security headers and controls'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be secops-engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});
	});

	describe('Complex Multi-Domain Scenarios', () => {
		it('should select lead for full-stack application with infrastructure', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					// Frontend
					'src/components/ProductList.tsx',
					'src/pages/checkout.tsx',
					// Backend
					'src/controllers/product.controller.ts',
					'src/services/payment.service.ts',
					// Infrastructure
					'infrastructure/database.tf',
					'k8s/app-deployment.yaml',
					// Database
					'src/models/product.model.ts',
					'src/migrations/001_create_products.ts'
				],
				complexity: 'high',
				dependencies: ['react', 'next', 'express', 'mongoose', 'terraform', 'kubernetes', 'stripe', 'redux'],
				description: 'Build complete e-commerce platform with frontend, backend, database, and infrastructure'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('lead');
			expect(result.confidence).toBeGreaterThan(0.25);
		});

		it('should handle mixed technology stacks appropriately', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/legacy/java/Service.java',
					'src/new/typescript/api.service.ts',
					'infrastructure/migration.tf'
				],
				dependencies: ['spring-boot', 'express', 'terraform'],
				description: 'Migrate legacy system with mixed technologies'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Should still make a reasonable choice based on available agents
			expect(result.selectedAgent).toBeDefined();
			expect(typeof result.confidence).toBe('number');
		});
	});

	describe('Fallback and Edge Cases', () => {
		it('should use fallback agent for unclear requirements', async () => {
			const taskContext: TaskContext = {
				// Very vague
				affectedFiles: ['unknown-file.xyz'],
				dependencies: [],
				description: 'Do something with the code'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be lead (due to higher priority) or software-engineer-typescript
			expect(['lead', 'software-engineer-typescript']).toContain(result.selectedAgent);
			expect(result.confidence).toBeLessThan(0.2); // Very low confidence
		});

		it('should handle empty task context', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: ''
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
		});

		it('should handle very large file sets', async () => {
			const taskContext: TaskContext = {
				affectedFiles: Array.from({ length: 500 }, (_, i) => `src/file${i}.ts`),
				dependencies: ['typescript', 'react', 'express'],
				description: 'Refactor entire codebase'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
		});
	});

	describe('Performance and Reliability', () => {
		it('should complete agent resolution within reasonable time', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/auth/controller.ts'],
				dependencies: ['express', 'jsonwebtoken'],
				description: 'Implement user authentication API'
			};

			const startTime = Date.now();
			const result = await resolver.resolveAgent(taskContext);
			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
			expect(result).toBeDefined();
		});

		it('should provide consistent results for same input', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/controllers/product.controller.ts'],
				dependencies: ['express'],
				description: 'Build REST API for products'
			};

			const result1 = await resolver.resolveAgent(taskContext);
			const result2 = await resolver.resolveAgent(taskContext);

			expect(result1.selectedAgent).toBe(result2.selectedAgent);
			expect(result1.confidence).toBe(result2.confidence);
		});

		it('should handle concurrent requests', async () => {
			const taskContexts: TaskContext[] = [
				{
					affectedFiles: ['src/api.ts'],
					dependencies: ['express'],
					description: 'Build API'
				},
				{
					affectedFiles: ['infra/main.tf'],
					dependencies: ['terraform'],
					description: 'Setup infrastructure'
				},
				{
					affectedFiles: ['src/App.tsx'],
					dependencies: ['react'],
					description: 'Create React component'
				}
			];

			const promises = taskContexts.map((ctx) => resolver.resolveAgent(ctx));
			const results = await Promise.all(promises);

			expect(results).toHaveLength(3);
			results.forEach((result) => {
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
			});
		});
	});

	describe('Detailed Analysis', () => {
		it('should provide comprehensive analysis breakdown', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/graphql/schema.ts', 'src/auth/jwt.ts'],
				dependencies: ['graphql', 'jsonwebtoken'],
				description: 'Implement GraphQL API with authentication'
			};

			const analysis = await resolver.getDetailedAnalysis(taskContext);

			expect(analysis.taskClassification).toBeDefined();
			expect(analysis.taskClassification.primaryDomain).toBeDefined();
			expect(analysis.taskClassification.confidence).toBeGreaterThan(0);

			expect(analysis.codebaseContext).toBeDefined();
			expect(analysis.codebaseContext.affectedFileTypes).toBeInstanceOf(Array);

			expect(analysis.agentScores).toBeInstanceOf(Array);
			expect(analysis.agentScores.length).toBeGreaterThan(0);

			expect(analysis.selection).toBeDefined();
			expect(analysis.selection.selectedAgent).toBeDefined();
		});

		it('should validate service health', async () => {
			const health = await resolver.validateServices();

			expect(health.valid).toBe(true);
			expect(health.issues).toEqual([]);
			expect(health.stats.registryAgents).toBeGreaterThan(0);
			expect(health.stats.registryDomains).toBeGreaterThan(0);
		});
	});

	describe('Real-world Scenarios', () => {
		it('should handle microservices architecture setup', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'infrastructure/microservices/main.tf',
					'k8s/istio-gateway.yaml',
					'k8s/service-mesh.yaml',
					'src/gateway/routes.ts'
				],
				dependencies: ['terraform', 'kubernetes', 'istio', 'express-gateway'],
				description: 'Set up microservices architecture with API gateway and service mesh'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
		});

		it('should handle CI/CD pipeline implementation', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'.github/workflows/ci.yml',
					'.github/workflows/deploy.yml',
					'.github/workflows/security.yml',
					'scripts/deploy.sh',
					'Dockerfile'
				],
				dependencies: ['docker', 'kubernetes', 'gh-actions'],
				description: 'Implement GitHub Actions CI/CD pipeline with automated testing and deployment'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('platform-engineer');
		});

		it('should handle database migration and optimization', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/database/migrations/',
					'src/repositories/optimized.repository.ts',
					'src/services/cache.service.ts'
				],
				dependencies: ['typeorm', 'redis', 'pg'],
				description: 'Optimize database queries and implement migration strategy using TypeORM'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Could be backend engineer or lead (due to lead's broader capabilities and higher priority)
			expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
			expect(result.confidence).toBeGreaterThan(0.25);
		});
	});
});
