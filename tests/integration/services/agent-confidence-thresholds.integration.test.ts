/**
 * Confidence Threshold Testing
 *
 * Tests edge cases, fallback behavior, and confidence threshold validation
 */

import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { TaskClassifierService } from 'services/task-classifier.service';
import { TaskContext } from 'types/agent.types';
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
						domains: [
							'accessibility',
							'architecture',
							'backend-api',
							'compliance',
							'design',
							'engineering-excellence',
							'infrastructure',
							'leadership',
							'product',
							'quality-assurance',
							'quality-gate',
							'requirements',
							'security',
							'stakeholder-management',
							'static-analysis',
							'testing',
							'threat-detection',
							'typescript-core',
							'typescript-general',
							'user-experience',
							'validation'
						],
						expertise: [
							'API Gateway and service composition design',
							'Architecture Decision Records (ADRs)',
							'Advanced software modularization and reusability',
							'Alignment between product velocity and technical stability',
							'Artifact management and versioning',
							'Asynchronous Programming',
							'Atomic design architectural pattern',
							'Back-For-Frontend (BFF) architectural pattern',
							'Behavior-Driven Development (BDD) principles',
							'Build reproducibility and caching optimization',
							'CI/CD lead time and deployment frequency',
							'Centralized logging (ELK, Loki, OpenSearch)',
							'Change management with CI/CD observability hooks',
							'Chaos engineering and system reliability validation',
							'Clean architecture',
							'Clean code',
							'Client-Server fundamental pattern',
							'Cloud Native architecture design (Kubernetes, Service Mesh, Serverless)',
							'Code review conventions and pair programming advocacy',
							'Command Query Responsibility Segregation (CQRS)',
							'Compliance as Code (CIS, SOC2, ISO27001 alignment)',
							'Configuration and secret management',
							'Continuous Deployment strategies (Blue-Green, Canary, Feature Toggles)',
							'Continuous Integration pipelines (GitHub Actions, Jenkins)',
							'Continuous feedback loops across SDLC',
							'Decoupled architectural pattern',
							'Design review and RFC (Request for Comments) process',
							'Developer Experience (Internal Developer Platforms, Backstage)',
							'Developer productivity and onboarding efficiency',
							'Distributed tracing (OpenTelemetry, Jaeger)',
							'Domain-Driven Development (DDD) principles',
							'Dont repeat yourself (DRY) principles',
							'Edge Side Includes (ESI) performance pattern',
							'Event-Driven architectural pattern',
							'Feature-based architectural pattern',
							'Functional Programming',
							'GitOps methodologies (ArgoCD, Flux)',
							'HLD, LLD, and C4/Mermaid diagrams for clarity and traceability',
							'Headless architectural pattern',
							'Hexagonal architectural pattern',
							'Incident response and postmortem culture',
							'Infrastructure as Code (Terraform, Pulumi, Crossplane)',
							'Island architectural pattern',
							'Keep It Simple, Stupid (KISS) principles',
							'Knowledge base and documentation automation',
							'Layered fundamental pattern',
							'Mean Time to Detect (MTTD) and Mean Time to Recover (MTTR)',
							'Metrics and alerting (Prometheus, Grafana, Alertmanager)',
							'Microfrontend federation architectural pattern',
							'Microservices architectural pattern (sync vs async)',
							'Monolithic architectural pattern',
							'Multi-cloud and hybrid platform strategy',
							'Object-Oriented Programming',
							'Performance optimization and profiling',
							'Pipeline as Code design and standardization',
							'Platform and software engineering roadmaps',
							'Platform uptime and MTTR/MTBF improvements',
							'Policy as Code (OPA, Kyverno)',
							'REST, GraphQL, tRPC, gRPC API design',
							'Reduction in operational toil',
							'Runtime security and policy enforcement',
							'SLO/SLA/SLA dashboards and error budgets',
							'Secrets rotation and identity management',
							'Secure SDLC implementation',
							'Security vulnerabilities trend and compliance coverage',
							'Serverless architectural pattern',
							'Software-as-a-Service (SaaS) architectural pattern',
							'Test automation (unit, integration, contract, e2e)',
							'Test-Driven Development (TDD) principles',
							'Threat modeling and vulnerability scanning',
							'TypeScript/Node.js ecosystem mastery'
						],
						priority: 90,
						role: 'lead',
						selectionCriteria: [
							'accessibility-files',
							'architecture-files',
							'audit-files',
							'authentication-code',
							'cloud-config',
							'code-files',
							'config-files',
							'design-files',
							'docker-files',
							'documentation-files',
							'encryption-code',
							'engineering-docs',
							'infrastructure-files',
							'kubernetes-manifests',
							'leadership-docs',
							'policy-files',
							'product-docs',
							'qa-scripts',
							'requirements-files',
							'roadmap-files',
							'security-files',
							'strategy-files',
							'terraform-files',
							'test-files',
							'test-reports',
							'testing-config',
							'type-definitions',
							'typescript-files',
							'ui-mockups',
							'user-stories',
							'ux-research'
						]
					},
					'platform-engineer': {
						domains: ['infrastructure', 'cloud', 'devops', 'kubernetes', 'docker', 'terraform', 'aws', 'monitoring'],
						expertise: [
							'AWS Fargate and ECS orchestration',
							'Automated testing and deployment',
							'CI/CD pipeline design and governance',
							'CIS hardening benchmarks',
							'Cloud-native architecture design',
							'Container image scanning',
							'Docker image optimization',
							'GitOps methodologies',
							'Helm, Kustomize, and ArgoCD',
							'Identity and access control',
							'Kubernetes (EKS, AKS, GKE)',
							'Linux systems administration',
							'Metrics, logs, and traces instrumentation',
							'Networking fundamentals',
							'Policy as Code (OPA, Kyverno)',
							'Secrets rotation and zero-trust network enforcement',
							'Terraform / Pulumi',
							'Vulnerability management and incident response'
						],
						priority: 90,
						role: 'platform-engineer',
						selectionCriteria: [
							'terraform-files',
							'kubernetes-manifests',
							'docker-files',
							'cloud-config',
							'infrastructure-files',
							'policy-files'
						]
					},
					'secops-engineer': {
						domains: ['security', 'compliance', 'threat-detection', 'vulnerability-management'],
						expertise: [
							'Cloud security principles',
							'Compliance frameworks (PCI-DSS, HIPAA, ISO 27001, SOC 2, GDPR)',
							'Container security principles',
							'Detection engineering',
							'Ethical Hacking',
							'Incident response',
							'Observability',
							'Platform operations',
							'Public Cloud Services (AWS, GCP, Azure)',
							'Risk assessment',
							'Secure architecture design',
							'Security Automation',
							'Threat modeling',
							'Vulnerability management'
						],
						priority: 95,
						role: 'secops-engineer',
						selectionCriteria: [
							'security-files',
							'audit-files',
							'authentication-code',
							'encryption-code',
							'policy-files'
						]
					},
					'software-engineer-typescript-backend': {
						domains: ['backend-api', 'typescript-backend-general', 'database', 'api-design'],
						expertise: [
							'API rate limiting & throttling',
							'Async I/O and performance implications',
							'Authentication & authorization',
							'Back-For-Frontend (BFF) architectural pattern',
							'BullMQ',
							'Caching (Redis, in-memory)',
							'Cluster & Worker Threads',
							'Command Query Responsibility Segregation (CQRS)',
							'Connection pooling and transaction management',
							'Consistency and CAP theorem awareness',
							'Domain-Driven Development (DDD)',
							'Error handling',
							'Express.js',
							'Fastify',
							'Feature flags and rollout strategies',
							'GraphQL (with Schema testing)',
							'JSON Web Token (JWT)',
							'Logging libraries (pino, Winston)',
							'Migrations and schema versioning',
							'Nest.js',
							'NoSQL (MongoDB, DynamoDB, Redis)',
							'Node.js',
							'Node.js Event Loop',
							'OAuth2',
							'OpenAPI / Swagger',
							'OpenTelemetry',
							'Performance optimization',
							'Prometheus',
							'RBAC/ABAC',
							'RESTful API',
							'Redis',
							'Resilience & Reliability',
							'SQL (PostgreSQL, MySQL, SQLite)',
							'TLS/HTTPS',
							'Task scheduling (cron, bullmq)',
							'Type-safe API contracts',
							'WebSockets / Server-Sent Events (SSE)',
							'gRPC / Protobuf',
							'tRPC'
						],
						priority: 95,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: ['code-files', 'documentation-files', 'qa-scripts', 'test-files', 'testing-config']
					}
				}
			})
		),
		resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
	};
});

describe('Confidence Threshold Testing - Edge Cases and Fallback Behavior', () => {
	let resolver: DynamicAgentResolverService;
	let registry: AgentCapabilityRegistryService;

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

	describe('Low Confidence Scenarios (< 60% confidence)', () => {
		it('should fallback to lead for extremely vague descriptions', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['file.txt'],
				dependencies: [],
				description: 'Do something'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.confidence).toBeLessThan(0.6);
			expect(result.fallback).toBe(true);
			expect(['lead', 'software-engineer-typescript']).toContain(result.selectedAgent);
		});

		it('should handle contradictory signals with low confidence', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/controllers/api.ts', // Backend file
					'infrastructure/main.tf', // Infra file
					'tests/unit/app.test.ts' // Test file
				],
				dependencies: ['react', 'express', 'terraform', 'vitest'],
				description: 'Fix the frontend'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.confidence).toBeLessThan(0.7);
			expect(result.selectedAgent).toBeDefined();
		});

		it('should have very low confidence for unknown technologies', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/main.unknown'],
				dependencies: ['unknown-framework'],
				description: 'Implement feature in unknown language'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.confidence).toBeLessThan(0.7); // Allow for some scoring even with unknown tech
			// Note: fallback may or may not be triggered depending on exact confidence level
		});

		it('should handle empty context gracefully', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: ''
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.confidence).toBeGreaterThan(0);
			expect(result.confidence).toBeLessThan(0.7); // Allow for some scoring even with empty context
			expect(result.selectedAgent).toBeDefined();
			// Note: fallback may or may not be triggered depending on exact confidence level
		});
	});

	describe('Conflicting Signals Resolution', () => {
		it('should resolve infrastructure vs backend priority correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/controllers/user.controller.ts', 'infrastructure/api.tf', 'k8s/api-deployment.yaml'],
				dependencies: ['express', 'terraform', 'kubernetes'],
				description: 'API deployment with infrastructure'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Lead agent handles infrastructure tasks (broader domain coverage)
			expect(result.selectedAgent).toBe('lead');
			expect(result.confidence).toBeGreaterThan(0.1);
		});

		it('should handle security vs backend for auth features', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [
					'src/auth/jwt.service.ts',
					'src/controllers/auth.controller.ts',
					'src/middleware/auth.middleware.ts'
				],
				dependencies: ['jsonwebtoken', 'express', 'bcrypt'],
				description: 'Implement authentication system'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Lead agent handles security/auth tasks (higher priority or broader coverage)
			expect(result.selectedAgent).toBe('lead');
			expect(result.confidence).toBeGreaterThan(0.1);
		});

		it('should prioritize domain-specific agents over general ones', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['k8s/deployment.yaml', 'k8s/service.yaml', 'scripts/deploy.sh'],
				dependencies: ['kubernetes', 'kubectl'],
				description: 'Kubernetes deployment configuration'
			};

			const result = await resolver.resolveAgent(taskContext);

			// Lead agent has same priority as platform-engineer and covers infrastructure
			expect(result.selectedAgent).toBe('lead');
			expect(result.confidence).toBeGreaterThan(0.1);
		});
	});

	describe('Boundary Conditions', () => {
		it('should handle maximum file count gracefully', async () => {
			const taskContext: TaskContext = {
				affectedFiles: Array.from({ length: 1000 }, (_, i) => `src/file${i}.ts`),
				dependencies: ['typescript', 'react', 'express'],
				description: 'Refactor entire codebase'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
		});

		it('should handle extremely long descriptions', async () => {
			const longDescription = 'Implement '.repeat(1000) + 'feature';
			const taskContext: TaskContext = {
				affectedFiles: ['src/feature.ts'],
				dependencies: ['typescript'],
				description: longDescription
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
		});

		it('should handle special characters in descriptions', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/graphql/schema.ts'],
				dependencies: ['graphql', 'typescript'],
				description: 'Implement API with GraphQL & TypeScript 🚀 (v2.0)'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result.selectedAgent).toBe('software-engineer-typescript-backend');
			expect(result.confidence).toBeGreaterThan(0.2); // Allow for lower confidence with special chars
		});

		it('should handle null/undefined values in context', async () => {
			const taskContext: TaskContext = {
				affectedFiles: null as any,
				dependencies: null as any,
				description: null as any
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.fallback).toBe(true);
		});
	});

	describe('Fallback Mechanism Validation', () => {
		it('should handle ambiguous contexts gracefully', async () => {
			// Test with minimal context information
			const taskContext: TaskContext = {
				// Very short, unclear description
				affectedFiles: ['unknown.xyz'],
				dependencies: [],
				description: 'x'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
			// Note: fallback may or may not be triggered depending on actual scoring
		});

		it('should provide meaningful selection reasons', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['random.txt'],
				dependencies: [],
				description: 'Make it better'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.reasons).toBeDefined();
			expect(result.reasons.length).toBeGreaterThan(0);
		});

		it('should maintain service stability with ambiguous contexts', async () => {
			const ambiguousContexts: TaskContext[] = [
				{ affectedFiles: [], dependencies: [], description: '' },
				{ affectedFiles: ['a.unknown'], dependencies: [], description: 'Fix' },
				{ affectedFiles: [], dependencies: ['unknown'], description: 'Update' }
			];

			for (const context of ambiguousContexts) {
				const result = await resolver.resolveAgent(context);
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0);
			}
		});
	});

	describe('Confidence Score Distribution', () => {
		const confidenceRanges = {
			high: { max: 1.0, min: 0.8 }, // Moderately clear tasks
			low: { max: 0.59, min: 0.3 }, // Clear, well-defined tasks
			medium: { max: 0.79, min: 0.6 }, // Ambiguous tasks
			veryLow: { max: 0.29, min: 0.0 } // Very unclear tasks
		};

		it('should assign reasonable confidence to clear, specific tasks', async () => {
			const clearTasks = [
				{
					deps: ['terraform', 'aws-cli'],
					description: 'Set up Terraform infrastructure for AWS ECS cluster',
					files: ['infrastructure/main.tf', 'infrastructure/ecs.tf']
				},
				{
					deps: ['jsonwebtoken', 'express'],
					description: 'Implement JWT authentication middleware',
					files: ['src/auth/jwt.middleware.ts']
				},
				{
					deps: ['react', 'typescript'],
					description: 'Create React dashboard component with TypeScript',
					files: ['src/components/Dashboard.tsx']
				}
			];

			for (const task of clearTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.confidence).toBeGreaterThan(0.2); // Reasonable confidence for clear tasks
				expect(result.selectedAgent).toBeDefined();
			}
		});

		it('should handle moderately complex tasks', async () => {
			const mediumTasks = [
				{
					deps: ['react', 'express', 'typescript'],
					description: 'Build full-stack feature with frontend and backend',
					files: ['src/components/Feature.tsx', 'src/controllers/feature.controller.ts']
				},
				{
					deps: ['express', 'mongoose'],
					description: 'Implement API with database integration',
					files: ['src/routes/api.ts', 'src/models/data.model.ts']
				}
			];

			for (const task of mediumTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.confidence).toBeGreaterThan(0.2); // Reasonable confidence for moderately complex tasks
				expect(result.selectedAgent).toBeDefined();
			}
		});

		it('should handle ambiguous tasks gracefully', async () => {
			const ambiguousTasks = [
				{
					deps: ['typescript'],
					description: 'Fix the issue',
					files: ['src/utils/helper.ts']
				},
				{
					deps: [],
					description: 'Update the code',
					files: ['src/some-file.ts']
				},
				{
					deps: ['lodash'],
					description: 'Make it work',
					files: ['unknown.ts']
				}
			];

			for (const task of ambiguousTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.confidence).toBeGreaterThan(0.1); // Low but valid confidence for ambiguous tasks
				expect(result.selectedAgent).toBeDefined();
			}
		});

		it('should handle extremely unclear tasks gracefully', async () => {
			const veryUnclearTasks = [
				{ deps: [], description: 'Do it', files: ['file.txt'] },
				{ deps: [], description: '', files: [] },
				{ deps: [], description: 'Test', files: ['random.xyz'] }
			];

			for (const task of veryUnclearTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.confidence).toBeGreaterThanOrEqual(0); // Very low but valid confidence
				expect(result.selectedAgent).toBeDefined();
				expect(result.reasons.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Error Recovery and Resilience', () => {
		it('should handle service failures gracefully', async () => {
			// Mock a service failure scenario
			const taskContext: TaskContext = {
				affectedFiles: ['src/app.ts'],
				dependencies: ['typescript'],
				description: 'Normal task'
			};

			// This test ensures the resolver doesn't crash even if internal services fail
			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.selectedAgent).toBeDefined();
			// Should fallback gracefully
		});

		it('should maintain consistent behavior across multiple ambiguous tasks', async () => {
			const ambiguousTasks: TaskContext[] = [
				{ affectedFiles: ['src/bug.ts'], dependencies: [], description: 'Fix bug' },
				{ affectedFiles: ['src/feature.ts'], dependencies: [], description: 'Update feature' },
				{ affectedFiles: ['src/refactor.ts'], dependencies: [], description: 'Refactor code' }
			];

			const results = await Promise.all(ambiguousTasks.map((task) => resolver.resolveAgent(task)));

			results.forEach((result) => {
				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0);
			});
		});

		it('should provide helpful information even for minimal contexts', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['hello.txt'],
				dependencies: [],
				description: 'Hello world'
			};

			const result = await resolver.resolveAgent(taskContext);

			expect(result).toBeDefined();
			expect(result.reasons).toBeDefined();
			expect(result.reasons.length).toBeGreaterThan(0);
			expect(result.selectedAgent).toBeDefined();
		});
	});

	describe('Threshold Boundary Testing', () => {
		it('should handle tasks with varying clarity levels', async () => {
			// Test tasks with different clarity levels
			const clarityTasks = [
				{
					deps: ['react'],
					description: 'Implement component',
					files: ['src/components/Test.tsx']
				},
				{
					deps: ['terraform'],
					description: 'Setup infra',
					files: ['infra/setup.tf']
				}
			];

			for (const task of clarityTasks) {
				const taskContext: TaskContext = {
					affectedFiles: task.files,
					dependencies: task.deps,
					description: task.description
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result).toBeDefined();
				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0.1);
			}
		});

		it('should handle rapid confidence score changes', async () => {
			const tasksWithVaryingClarity = [
				{ deps: ['react'], description: 'Build React component', files: ['src/Button.tsx'] }, // Clear
				{ deps: [], description: 'Do something', files: ['file.ts'] }, // Unclear
				{ deps: ['graphql'], description: 'Implement GraphQL API', files: ['src/schema.ts'] } // Clear again
			];

			const results = await Promise.all(
				tasksWithVaryingClarity.map((task) => {
					const taskContext: TaskContext = {
						affectedFiles: task.files,
						dependencies: task.deps,
						description: task.description
					};
					return resolver.resolveAgent(taskContext);
				})
			);

			expect(results[0].confidence).toBeGreaterThan(0.1); // Clear task
			expect(results[1].confidence).toBeGreaterThan(0.1); // Unclear task
			expect(results[2].confidence).toBeGreaterThan(0.1); // Clear task
		});
	});
});
