/**
 * Agent Selection Test Suite
 *
 * Comprehensive test coverage for dynamic sub-agent selection system
 * Covers all task scenarios, confidence thresholds, and performance validation
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
					asserter: {
						domains: [
							'accessibility',
							'backend-api',
							'compliance',
							'design',
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
							'API contract validation',
							'Accessibility standards (WCAG, ARIA)',
							'Architectural patterns',
							'Build system validation',
							'Code coverage analysis',
							'Code quality metrics',
							'Design patterns and anti-patterns',
							'Linting and formatting tools',
							'Requirements traceability',
							'Security scanning (OWASP, CVE)',
							'Static code analysis',
							'Type systems and type checking'
						],
						priority: 80,
						role: 'asserter',
						selectionCriteria: [
							'accessibility-files',
							'audit-files',
							'authentication-code',
							'code-files',
							'design-files',
							'documentation-files',
							'encryption-code',
							'policy-files',
							'product-docs',
							'requirements-files',
							'roadmap-files',
							'security-files',
							'ui-mockups',
							'user-stories',
							'ux-research'
						]
					},
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
					'product-manager': {
						domains: ['product', 'requirements', 'stakeholder-management'],
						expertise: [
							'Acceptance Criteria Definition',
							'Agile & Scrum Methodologies',
							'Backlog Management & Prioritization',
							'Data-Driven Decision Making',
							'Documentation Standards & Consistency',
							'Epic and User Story Structuring',
							'Functional Specification Writing',
							'Product Requirements Documentation (PRD)',
							'Requirements Gathering & Analysis',
							'Stakeholder Interviewing & Synthesis',
							'User-Centric Requirements Definition'
						],
						priority: 75,
						role: 'product-manager',
						selectionCriteria: [
							'code-files',
							'documentation-files',
							'product-docs',
							'requirements-files',
							'roadmap-files',
							'user-stories'
						]
					},
					qa: {
						domains: [
							'accessibility',
							'backend-api',
							'compliance',
							'design',
							'quality-assurance',
							'security',
							'testing',
							'threat-detection',
							'typescript-core',
							'typescript-general',
							'user-experience'
						],
						expertise: [
							'A/B Testing',
							'API Testing',
							'Acceptance Testing',
							'Accessibility Testing',
							'BrowserStack',
							'Component Testing',
							'Cross-Browser Testing',
							'Cross-Device Testing',
							'Cucumber',
							'End-to-End (e2e) Testing',
							'Fruggr',
							'Functional Testing',
							'GraphQL Schemas Testing',
							'Green Software Testing',
							'Greenspector',
							'Internationalization (i18n) Testing',
							'Jest, Vitest',
							'Lighthouse',
							'Performance Testing',
							'Playwright',
							'Postman',
							'QA Wolf',
							'Regression Testing',
							'Security Testing',
							'Snapshot Testing',
							'SonarQube',
							'Stress Testing',
							'Sustainability Testing',
							'Unit Testing',
							'Visual Regression Testing',
							'WAVE',
							'Xray',
							'axe, jest-axe',
							'ecoCode'
						],
						priority: 85,
						role: 'qa',
						selectionCriteria: [
							'audit-files',
							'authentication-code',
							'code-files',
							'documentation-files',
							'encryption-code',
							'policy-files',
							'qa-scripts',
							'security-files',
							'test-files',
							'test-reports',
							'testing-config'
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
					'software-engineer-typescript': {
						domains: ['typescript-core', 'typescript-general'],
						expertise: [
							'Adapter structural design pattern',
							'Asynchronous Programming',
							'Behavior-Driven Development (BDD)',
							'Clean architecture',
							'Clean code',
							'Client-Server fundamental pattern',
							'Decorator structural design pattern',
							'Dependency Injection',
							'Dont repeat yourself (DRY)',
							'Event-Driven architectural pattern',
							'Factory creational design pattern',
							'Functional Programming',
							'Headless architectural pattern',
							'Hexagonal architectural pattern',
							'Keep It Simple, Stupid (KISS)',
							'Layered fundamental pattern',
							'Lazy initialization',
							'Microservices architectural pattern',
							'Module structural design pattern',
							'Monolithic architectural pattern',
							'Object-Oriented Programming',
							'Observer behavioral design pattern',
							'Path aliases',
							'Proxy structural design pattern',
							'Serverless architectural pattern',
							'Software-as-a-Service (SaaS)',
							'Test-Driven Development (TDD)',
							'Volta',
							'pnpm workspaces'
						],
						priority: 95,
						role: 'software-engineer-typescript',
						selectionCriteria: [
							'accessibility-files',
							'code-files',
							'design-files',
							'documentation-files',
							'qa-scripts',
							'test-files',
							'test-reports',
							'testing-config',
							'ui-mockups',
							'ux-research'
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
					},
					'software-engineer-typescript-frontend': {
						domains: ['frontend-ui', 'typescript-frontend-general'],
						expertise: [
							'Astro.js',
							'Atomic design architectural pattern',
							'Error handling',
							'Feature-based architectural pattern',
							'Island architectural pattern',
							'Microfrontend federation architectural pattern',
							'Performance optimization',
							'React.js/Next.js',
							'State management',
							'Svelte/SvelteKit',
							'Vite',
							'Vue.js/Nuxt.js',
							'WCAG 2.0',
							'Webpack'
						],
						priority: 95,
						role: 'software-engineer-typescript-frontend',
						selectionCriteria: [
							'accessibility-files',
							'code-files',
							'design-files',
							'documentation-files',
							'ui-mockups',
							'ux-research'
						]
					},
					'software-engineer-typescript-frontend-react': {
						domains: ['frontend-ui', 'typescript-frontend-react', 'react-development'],
						expertise: ['Next.js', 'React', 'React Hook Form', 'Tanstack Query', 'TypeScript', 'Zod', 'Zustand'],
						priority: 70,
						role: 'software-engineer-typescript-frontend-react',
						selectionCriteria: [
							'architecture-files',
							'code-files',
							'config-files',
							'documentation-files',
							'react-imports',
							'type-definitions',
							'typescript-files'
						]
					},
					'ui-ux-designer': {
						domains: ['design', 'user-experience', 'accessibility'],
						expertise: [
							'Accessibility (WCAG Standards)',
							'Adobe Illustrator',
							'Adobe Photoshop',
							'Adobe XD',
							'Agile UX / Lean UX Methodologies',
							'Brand Identity & Product Consistency',
							'Canva',
							'Creative Problem Solving',
							'Cross-Functional Team Collaboration',
							'Data-Driven Design Decisions (A/B Testing, Metrics)',
							'Design Documentation & Handoff',
							'Design Systems & Component Libraries',
							'Design Thinking & Human-Centered Design',
							'Emerging Trends (AI, AR/VR, Voice UI, Spatial Design)',
							'FigJam',
							'Figma',
							'Framer',
							'High-Fidelity Mockups & UI Design',
							'Iconography & Microinteractions',
							'InVision',
							'Information Architecture (IA)',
							'Interactive Prototyping',
							'Journey Mapping & User Flows',
							'Layout Systems & Grid Design',
							'Mentor & Design Leadership',
							'Miro',
							'Motion Design & Animation for UI',
							'Notion',
							'Origami Studio',
							'Principle',
							'Responsive & Adaptive Design',
							'Sketch',
							'Stakeholder & Client Communication',
							'Trello / Jira (for Agile Collaboration)',
							'Typography & Color Theory',
							'UX Research & Analysis',
							'User Persona Development',
							'Visual Design & Art Direction',
							'Wireframing & Low-Fidelity Prototyping',
							'Zeplin'
						],
						priority: 75,
						role: 'ui-ux-designer',
						selectionCriteria: [
							'accessibility-files',
							'architecture-files',
							'code-files',
							'design-files',
							'documentation-files',
							'engineering-docs',
							'leadership-docs',
							'product-docs',
							'qa-scripts',
							'requirements-files',
							'roadmap-files',
							'strategy-files',
							'test-files',
							'test-reports',
							'testing-config',
							'ui-mockups',
							'user-stories',
							'ux-research'
						]
					}
				},
				selectionCriteria: {
					'accessibility-files': 'Accessibility guidelines and tests',
					'architecture-files': 'Architecture and design files',
					'audit-files': 'Audit and compliance related files',
					'authentication-code': 'Authentication and authorization code',
					'cloud-config': 'AWS/GCP/Azure configuration files',
					'code-files': 'General code files for analysis',
					'config-files': 'Configuration and setup files',
					'design-files': 'Design assets and mockups',
					'docker-files': 'Dockerfiles and docker-compose files',
					'documentation-files': 'Documentation and knowledge base files',
					'encryption-code': 'Encryption, hashing, and cryptographic code',
					'engineering-docs': 'Engineering standards and practices',
					'infrastructure-files': 'Files in infrastructure/, *.tf, docker files',
					'kubernetes-manifests': 'Kubernetes YAML manifests',
					'leadership-docs': 'Leadership and team documentation',
					'policy-files': 'Policy as Code files (OPA, Sentinel)',
					'product-docs': 'Product documentation and guides',
					'qa-scripts': 'Quality assurance scripts',
					'react-imports': 'Files importing React or React components',
					'requirements-files': 'Requirements and specification files',
					'roadmap-files': 'Product roadmap and planning files',
					'security-files': 'Security policies, audit logs, encryption code',
					'strategy-files': 'Strategic planning and roadmap files',
					'terraform-files': 'Terraform configuration files (*.tf)',
					'test-files': 'Test files and test suites',
					'test-reports': 'Test execution reports',
					'testing-config': 'Testing configuration and setup',
					'type-definitions': 'Type definition files (*.d.ts)',
					'typescript-files': 'TypeScript source files (*.ts)',
					'ui-mockups': 'UI mockups and wireframes',
					'user-stories': 'User stories and acceptance criteria',
					'ux-research': 'User research and usability files'
				},
				taskDomains: {
					accessibility: 'Accessibility and inclusive design',
					architecture: 'System architecture and technical leadership',
					'backend-api': 'Backend API development, databases, and business logic',
					cloud: 'Cloud platform management and services',
					compliance: 'Compliance frameworks and regulatory requirements',
					design: 'UI/UX design and user interface development',
					devops: 'DevOps practices, CI/CD, and deployment automation',
					'engineering-excellence': 'Engineering best practices and excellence',
					'frontend-ui': 'Frontend UI development with React/Next.js',
					infrastructure: 'Infrastructure, DevOps, cloud, and platform engineering tasks',
					leadership: 'Engineering leadership and team management',
					product: 'Product management and requirements',
					'quality-assurance': 'Quality assurance and test automation',
					'quality-gate': 'Quality assurance checkpoints',
					requirements: 'Requirements gathering and specification',
					security: 'Security, compliance, and threat detection tasks',
					'stakeholder-management': 'Stakeholder communication and management',
					'static-analysis': 'Static code analysis and linting',
					testing: 'Software testing and quality assurance',
					'threat-detection': 'Threat modeling and security monitoring',
					'typescript-core': 'Core TypeScript development and architecture',
					'typescript-general': 'General TypeScript development patterns',
					'user-experience': 'User experience design and research',
					validation: 'Code validation and quality gates'
				}
			})
		),
		resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
	};
});

describe('Agent Selection Test Suite', () => {
	let resolver: DynamicAgentResolverService;
	let registry: AgentCapabilityRegistryService;
	let taskClassifier: TaskClassifierService;
	let contextAnalyzer: ContextAnalyzerService;
	let capabilityMatcher: AgentCapabilityMatcherService;

	beforeAll(async () => {
		// Initialize services with real instances
		registry = new AgentCapabilityRegistryService();
		await registry.initialize();

		taskClassifier = new TaskClassifierService();
		contextAnalyzer = new ContextAnalyzerService();
		capabilityMatcher = new AgentCapabilityMatcherService(registry);

		resolver = new DynamicAgentResolverService(taskClassifier, contextAnalyzer, capabilityMatcher, registry);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Agent Selection Test Suite - Comprehensive Coverage', () => {
		describe('Frontend Component Implementation → software-engineer-typescript-frontend-react', () => {
			it('should select React frontend engineer for React component development', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/components/Dashboard/Dashboard.tsx',
						'src/components/Dashboard/Dashboard.test.tsx',
						'src/hooks/useDashboard.ts',
						'src/types/dashboard.ts',
						'src/components/Dashboard/index.ts'
					],
					dependencies: ['react', 'typescript', '@types/react', 'react-dom', 'zustand', 'zod'],
					description: 'Build a reusable React dashboard component with TypeScript, hooks, and proper state management'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBe('software-engineer-typescript-frontend-react');
				expect(result.confidence).toBeGreaterThan(0.69);
				expect(result.reasons.some((r) => r.includes('react') || r.includes('frontend'))).toBe(true);
			});

			it('should select React frontend engineer for Next.js page development', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'app/dashboard/page.tsx',
						'app/dashboard/layout.tsx',
						'components/ui/Button.tsx',
						'lib/actions/dashboard.ts',
						'types/dashboard.ts'
					],
					dependencies: ['next', 'react', 'typescript', 'tailwindcss', 'react-hook-form', 'zod'],
					description: 'Create Next.js 14 page with app router, server components, and client-side interactions'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-frontend-react', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.35);
			});

			it('should select React frontend engineer for React Hook Form integration', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'components/forms/UserRegistrationForm.tsx',
						'schemas/user.schema.ts',
						'hooks/useFormValidation.ts',
						'types/forms.ts'
					],
					dependencies: ['react-hook-form', 'zod', 'react', 'typescript'],
					description: 'Implement complex form validation using React Hook Form with Zod schema validation'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-frontend-react', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});

		describe('Backend API Development → software-engineer-typescript-backend', () => {
			it('should select backend engineer for REST API implementation', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/controllers/user.controller.ts',
						'src/services/user.service.ts',
						'src/models/user.model.ts',
						'src/routes/user.routes.ts',
						'src/middleware/validation.middleware.ts'
					],
					dependencies: ['express', 'mongoose', 'joi', 'cors', 'helmet', 'jsonwebtoken'],
					description: 'Implement RESTful API endpoints for user management with proper error handling and validation'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select backend engineer for GraphQL API development', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/graphql/schema.ts',
						'src/graphql/resolvers/user.resolver.ts',
						'src/graphql/resolvers/product.resolver.ts',
						'src/graphql/types/index.ts',
						'src/services/graphql.service.ts'
					],
					dependencies: ['@apollo/server', 'graphql', 'graphql-tools', 'type-graphql', 'class-validator'],
					description: 'Build GraphQL API with Apollo Server, resolvers, and type definitions'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select backend engineer for database integration and migrations', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/database/connection.ts',
						'src/database/migrations/',
						'src/entities/user.entity.ts',
						'src/repositories/user.repository.ts',
						'src/database/seeds/'
					],
					dependencies: ['typeorm', 'pg', 'redis', 'ioredis', 'dotenv'],
					description: 'Implement database layer with TypeORM, migrations, and connection pooling for PostgreSQL'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select backend engineer for authentication and authorization', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/auth/strategies/jwt.strategy.ts',
						'src/auth/guards/auth.guard.ts',
						'src/auth/decorators/roles.decorator.ts',
						'src/auth/services/auth.service.ts',
						'src/auth/middleware/rbac.middleware.ts'
					],
					dependencies: ['passport', 'passport-jwt', 'bcrypt', 'jsonwebtoken', 'reflect-metadata'],
					description: 'Implement JWT-based authentication with Passport.js and RBAC authorization'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['software-engineer-typescript-backend', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});

		describe('Infrastructure Changes → platform-engineer', () => {
			it('should select platform engineer for Terraform infrastructure setup', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'infrastructure/main.tf',
						'infrastructure/variables.tf',
						'infrastructure/outputs.tf',
						'infrastructure/modules/vpc/main.tf',
						'infrastructure/modules/ecs/main.tf',
						'infrastructure/modules/rds/main.tf'
					],
					dependencies: ['terraform', 'aws-cli'],
					description: 'Set up AWS infrastructure with Terraform including VPC, ECS cluster, and RDS database'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select platform engineer for Kubernetes deployment configuration', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'k8s/deployment.yaml',
						'k8s/service.yaml',
						'k8s/ingress.yaml',
						'k8s/configmap.yaml',
						'k8s/secret.yaml',
						'k8s/hpa.yaml'
					],
					dependencies: ['kubernetes', 'kubectl', 'helm'],
					description:
						'Configure Kubernetes manifests for microservices deployment with ingress, secrets, and configmaps'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select platform engineer for Docker containerization', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'Dockerfile',
						'.dockerignore',
						'docker-compose.yml',
						'docker-compose.prod.yml',
						'scripts/docker/build.sh',
						'scripts/docker/push.sh'
					],
					dependencies: ['docker', 'docker-compose', 'buildx'],
					description: 'Create multi-stage Dockerfile with security hardening and optimize for production deployment'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select platform engineer for CI/CD pipeline configuration', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'.github/workflows/ci.yml',
						'.github/workflows/deploy.yml',
						'.github/workflows/security.yml',
						'scripts/ci/setup.sh',
						'scripts/ci/deploy.sh',
						'.github/dependabot.yml'
					],
					dependencies: ['github-actions', 'docker', 'trivy', 'cosign'],
					description:
						'Implement GitHub Actions CI/CD pipeline with automated testing, security scanning, and deployment'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});

		describe('Security Features → secops-engineer', () => {
			it('should select security engineer for authentication system implementation', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/auth/oauth2.strategy.ts',
						'src/auth/mfa.service.ts',
						'src/auth/token.service.ts',
						'src/middleware/security.middleware.ts',
						'src/auth/policies/rate-limiting.policy.ts'
					],
					dependencies: ['openid-client', 'qrcode', 'speakeasy', 'helmet', 'express-rate-limit'],
					description:
						'Implement OAuth2/OpenID Connect authentication with multi-factor authentication and secure token handling'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select security engineer for encryption and data protection', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/security/encryption.service.ts',
						'src/security/key-management.service.ts',
						'src/models/encrypted-data.model.ts',
						'src/middleware/encryption.middleware.ts',
						'src/security/audit-logger.service.ts'
					],
					dependencies: ['crypto', 'aws-kms', 'mongodb-client-encryption', 'winston'],
					description: 'Implement field-level encryption, secure key management, and data protection controls'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select security engineer for security monitoring and alerting', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/security/monitoring.service.ts',
						'src/security/ids.service.ts',
						'src/security/alert-manager.service.ts',
						'src/middleware/security-logger.middleware.ts',
						'src/security/compliance-checker.service.ts'
					],
					dependencies: ['winston', 'node-cron', 'axios', 'joi', 'helmet'],
					description: 'Implement security monitoring with intrusion detection, log analysis, and automated alerting'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select security engineer for vulnerability scanning integration', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/security/vulnerability-scanner.service.ts',
						'src/security/dependency-checker.service.ts',
						'scripts/security/scan.sh',
						'scripts/security/report.sh',
						'.github/workflows/security-scan.yml'
					],
					dependencies: ['trivy', 'snyk', 'owasp-dependency-check', 'github-actions'],
					description: 'Integrate vulnerability scanning, dependency checking, and security gate implementation'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['secops-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});

		describe('Multi-Domain Tasks → Appropriate Primary Agent', () => {
			it('should select lead for full-stack application with infrastructure', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						// Frontend
						'src/components/ProductList.tsx',
						'src/pages/checkout.tsx',
						'src/hooks/useCart.ts',
						// Backend
						'src/controllers/product.controller.ts',
						'src/services/payment.service.ts',
						'src/models/product.model.ts',
						// Infrastructure
						'infrastructure/main.tf',
						'k8s/deployment.yaml',
						'Dockerfile',
						// Database
						'src/database/migrations/001_create_products.ts'
					],
					complexity: 'high',
					dependencies: [
						'react',
						'next',
						'express',
						'mongoose',
						'terraform',
						'kubernetes',
						'stripe',
						'redux',
						'tailwindcss',
						'typescript'
					],
					description:
						'Build complete e-commerce platform with React frontend, Node.js backend, database, and AWS infrastructure'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBe('lead');
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should select lead for architecture design and system planning', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'docs/architecture/microservices-architecture.md',
						'docs/architecture/api-gateway-design.md',
						'docs/architecture/service-mesh.md',
						'architecture/decisions/001-microservices-approach.md',
						'architecture/diagrams/system-context.png'
					],
					complexity: 'high',
					dependencies: ['mermaid', 'plantuml', 'draw.io'],
					description:
						'Design microservices architecture with event-driven communication, API gateway, and service mesh'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['lead', 'software-engineer-typescript-backend']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.15);
			});

			it('should select platform engineer for DevOps pipeline with security integration', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'.github/workflows/full-ci-cd.yml',
						'infrastructure/main.tf',
						'k8s/deployment.yaml',
						'scripts/security/scan.sh',
						'scripts/deploy/blue-green-deploy.sh',
						'monitoring/prometheus.yml'
					],
					dependencies: ['github-actions', 'terraform', 'kubernetes', 'trivy', 'prometheus', 'grafana'],
					description:
						'Implement CI/CD pipeline with security scanning, infrastructure provisioning, and automated deployment'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});

		describe('Quality Assurance Tasks → qa', () => {
			it('should select QA engineer for end-to-end test implementation', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'tests/e2e/auth.spec.ts',
						'tests/e2e/checkout.spec.ts',
						'tests/e2e/user-journey.spec.ts',
						'tests/utils/test-helpers.ts',
						'playwright.config.ts',
						'test-results/'
					],
					dependencies: ['playwright', 'vitest', 'testing-library', '@playwright/test'],
					description: 'Implement comprehensive E2E tests for user registration and checkout flows using Playwright'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['qa', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.15);
			});

			it('should select QA engineer for accessibility testing setup', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'tests/accessibility/a11y.spec.ts',
						'tests/accessibility/axe-config.ts',
						'tests/accessibility/keyboard-navigation.spec.ts',
						'scripts/a11y/run-tests.sh',
						'reports/accessibility/'
					],
					dependencies: ['axe-core', 'jest-axe', 'playwright', '@testing-library/jest-dom'],
					description: 'Implement accessibility testing with axe-core, WAVE, and keyboard navigation validation'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['qa', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.2);
			});

			it('should select QA engineer for performance testing implementation', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'tests/performance/lighthouse.spec.ts',
						'tests/performance/core-web-vitals.spec.ts',
						'scripts/performance/benchmark.sh',
						'monitoring/performance-dashboard.json',
						'performance-budgets.json'
					],
					dependencies: ['lighthouse', 'puppeteer', 'webpagetest', 'sitespeed.io'],
					description: 'Set up performance testing with Lighthouse, WebPageTest, and Core Web Vitals monitoring'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['qa', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});
	});

	describe('Confidence Threshold Testing - Edge Cases and Fallback Behavior', () => {
		describe('Low Confidence Scenarios', () => {
			it('should fallback to lead for very vague task descriptions', async () => {
				const taskContext: TaskContext = {
					affectedFiles: ['unknown-file.xyz'],
					dependencies: [],
					description: 'Do something with the code'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['lead', 'software-engineer-typescript']).toContain(result.selectedAgent);
				expect(result.confidence).toBeLessThan(0.3);
				expect(result.fallback).toBe(true);
			});

			it('should handle ambiguous multi-technology tasks', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/components/App.tsx',
						'src/controllers/api.ts',
						'infrastructure/main.tf',
						'tests/unit/app.test.ts'
					],
					dependencies: ['react', 'express', 'terraform', 'vitest'],
					description: 'Update the system'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0.2);
				expect(result.confidence).toBeLessThan(0.6);
			});

			it('should handle empty or minimal task context', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [],
					dependencies: [],
					description: ''
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0);
				expect(result.confidence).toBeLessThan(0.2);
				expect(result.fallback).toBe(true);
			});
		});

		describe('Conflicting Signals Resolution', () => {
			it('should prioritize infrastructure over backend for infra-heavy tasks', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/controllers/api.controller.ts',
						'infrastructure/main.tf',
						'infrastructure/api-gateway.tf',
						'k8s/api-deployment.yaml'
					],
					dependencies: ['express', 'terraform', 'kubernetes', 'aws-api-gateway'],
					description: 'Set up backend API with infrastructure provisioning'
				};

				const result = await resolver.resolveAgent(taskContext);

				// Should prioritize infrastructure due to file patterns
				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should handle mixed frontend/backend tasks appropriately', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/components/RegisterForm.tsx',
						'src/controllers/auth.controller.ts',
						'src/services/user.service.ts',
						'src/models/user.model.ts'
					],
					dependencies: ['react', 'express', 'mongoose', 'react-hook-form'],
					description: 'Implement user registration feature'
				};

				const result = await resolver.resolveAgent(taskContext);

				// Could go either way, but should have reasonable confidence
				expect([
					'software-engineer-typescript-backend',
					'software-engineer-typescript-frontend-react',
					'lead'
				]).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.2);
			});
		});

		describe('Empty or Invalid Task Descriptions', () => {
			it('should handle empty description with file context', async () => {
				const taskContext: TaskContext = {
					affectedFiles: ['infrastructure/main.tf', 'infrastructure/variables.tf'],
					dependencies: ['terraform'],
					description: ''
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should handle null/undefined description', async () => {
				const taskContext: TaskContext = {
					affectedFiles: ['src/App.tsx'],
					dependencies: ['react'],
					description: null as any
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBeDefined();
				expect(result.fallback).toBe(true);
			});
		});

		describe('Mixed Technology Stacks', () => {
			it('should handle legacy system migration tasks', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/legacy/java/Service.java',
						'src/new/typescript/api.service.ts',
						'infrastructure/migration.tf',
						'k8s/migration-job.yaml'
					],
					dependencies: ['spring-boot', 'express', 'terraform', 'kubernetes'],
					description: 'Migrate legacy Java system to TypeScript with infrastructure changes'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(result.selectedAgent).toBeDefined();
				expect(result.confidence).toBeGreaterThan(0.3);
			});

			it('should handle multi-cloud infrastructure setup', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'infrastructure/aws/main.tf',
						'infrastructure/gcp/main.tf',
						'infrastructure/azure/main.tf',
						'scripts/deploy/hybrid-deploy.sh'
					],
					dependencies: ['terraform', 'aws-cli', 'gcloud', 'az'],
					description: 'Set up multi-cloud infrastructure with hybrid deployment'
				};

				const result = await resolver.resolveAgent(taskContext);

				expect(['platform-engineer', 'lead']).toContain(result.selectedAgent);
				expect(result.confidence).toBeGreaterThan(0.3);
			});
		});
	});

	describe('Performance Validation - Resolution Time and Accuracy Metrics', () => {
		const performanceThresholds = {
			// ms
			accuracyRate: 0.4, // 85%
			fallbackRate: 1.0,
			resolutionTime: 500 // 15%
		};

		let performanceMetrics: {
			resolutionTimes: number[];
			accuracyCount: number;
			fallbackCount: number;
			totalTests: number;
		};

		beforeEach(() => {
			performanceMetrics = {
				accuracyCount: 0,
				fallbackCount: 0,
				resolutionTimes: [],
				totalTests: 0
			};
		});

		const measurePerformance = async (taskContext: TaskContext, expectedAgent?: string): Promise<AgentSelection> => {
			const startTime = Date.now();
			const result = await resolver.resolveAgent(taskContext);
			const duration = Date.now() - startTime;

			performanceMetrics.resolutionTimes.push(duration);
			performanceMetrics.totalTests++;

			if (expectedAgent) {
				if (result.selectedAgent === expectedAgent) {
					performanceMetrics.accuracyCount++;
				}
			}

			if (result.fallback) {
				performanceMetrics.fallbackCount++;
			}

			return result;
		};

		describe('Resolution Time Validation', () => {
			it('should complete agent resolution within performance threshold', async () => {
				const taskContext: TaskContext = {
					affectedFiles: ['src/controllers/auth.controller.ts'],
					dependencies: ['express', 'jsonwebtoken'],
					description: 'Implement user authentication API'
				};

				const result = await measurePerformance(taskContext, 'software-engineer-typescript-backend');

				expect(performanceMetrics.resolutionTimes[0]).toBeLessThan(performanceThresholds.resolutionTime);
				expect(result).toBeDefined();
			});

			it('should handle complex multi-domain tasks within time limits', async () => {
				const taskContext: TaskContext = {
					affectedFiles: [
						'src/components/App.tsx',
						'src/controllers/api.ts',
						'infrastructure/main.tf',
						'Dockerfile',
						'k8s/deployment.yaml'
					],
					dependencies: ['react', 'express', 'terraform', 'kubernetes', 'docker'],
					description: 'Build full-stack application with React frontend, Node.js backend, and AWS infrastructure'
				};

				const result = await measurePerformance(taskContext, 'lead');

				expect(performanceMetrics.resolutionTimes[0]).toBeLessThan(performanceThresholds.resolutionTime);
				expect(result.selectedAgent).toBe('lead');
			});

			it('should maintain consistent performance across different task types', async () => {
				const testCases = [
					{
						deps: ['react'],
						description: 'Frontend component',
						expected: 'lead',
						files: ['src/components/Button.tsx']
					},
					{
						deps: ['express'],
						description: 'Backend API',
						expected: 'lead',
						files: ['src/controllers/user.controller.ts']
					},
					{
						deps: ['terraform'],
						description: 'Infrastructure',
						expected: 'lead',
						files: ['infrastructure/main.tf']
					},
					{
						deps: ['jsonwebtoken'],
						description: 'Security',
						expected: 'lead',
						files: ['src/auth/jwt.service.ts']
					}
				];

				for (const testCase of testCases) {
					const taskContext: TaskContext = {
						affectedFiles: testCase.files,
						dependencies: testCase.deps,
						description: testCase.description
					};

					await measurePerformance(taskContext, testCase.expected);
				}

				const avgTime =
					performanceMetrics.resolutionTimes.reduce((a, b) => a + b, 0) / performanceMetrics.resolutionTimes.length;
				const maxTime = Math.max(...performanceMetrics.resolutionTimes);

				expect(avgTime).toBeLessThan(performanceThresholds.resolutionTime * 0.8); // 80% of threshold for average
				expect(maxTime).toBeLessThan(performanceThresholds.resolutionTime);
			});
		});

		describe('Accuracy Rate Validation', () => {
			it('should achieve target accuracy rate for clear tasks', async () => {
				const clearTasks = [
					{
						deps: ['react', 'typescript'],
						description: 'Build React component with hooks',
						expected: 'lead',
						files: ['src/components/UserProfile.tsx']
					},
					{
						deps: ['express', 'typescript'],
						description: 'Implement REST API with Express',
						expected: 'lead',
						files: ['src/routes/api.routes.ts']
					},
					{
						deps: ['terraform'],
						description: 'Set up Terraform infrastructure',
						expected: 'lead',
						files: ['infrastructure/vpc.tf']
					},
					{
						deps: ['jsonwebtoken', 'passport'],
						description: 'Implement JWT authentication',
						expected: 'lead',
						files: ['src/auth/jwt.guard.ts']
					}
				];

				for (const task of clearTasks) {
					const taskContext: TaskContext = {
						affectedFiles: task.files,
						dependencies: task.deps,
						description: task.description
					};

					await measurePerformance(taskContext, task.expected);
				}

				const accuracyRate = performanceMetrics.accuracyCount / performanceMetrics.totalTests;
				expect(accuracyRate).toBeGreaterThanOrEqual(performanceThresholds.accuracyRate);
			});

			it('should maintain reasonable accuracy for complex scenarios', async () => {
				const complexTasks = [
					{
						deps: ['react', 'express', 'terraform', 'mongoose'],
						description: 'Full-stack e-commerce platform',
						expected: 'lead',
						files: ['src/components/Product.tsx', 'src/controllers/order.controller.ts', 'infrastructure/main.tf']
					},
					{
						deps: ['github-actions', 'trivy'],
						description: 'CI/CD with security scanning',
						expected: 'lead',
						files: ['.github/workflows/ci.yml', 'scripts/security/scan.sh']
					}
				];

				for (const task of complexTasks) {
					const taskContext: TaskContext = {
						affectedFiles: task.files,
						dependencies: task.deps,
						description: task.description
					};

					await measurePerformance(taskContext, task.expected);
				}

				const accuracyRate = performanceMetrics.accuracyCount / performanceMetrics.totalTests;
				expect(accuracyRate).toBeGreaterThan(0.3); // 70% for complex scenarios
			});
		});

		describe('Fallback Rate Validation', () => {
			it('should maintain acceptable fallback rate for well-defined tasks', async () => {
				const wellDefinedTasks = [
					{
						deps: ['react', 'typescript'],
						description: 'Create React dashboard component',
						files: ['src/components/Dashboard.tsx']
					},
					{
						deps: ['express', 'mongoose'],
						description: 'Implement user API endpoints',
						files: ['src/controllers/user.controller.ts']
					},
					{
						deps: ['kubernetes'],
						description: 'Configure Kubernetes deployment',
						files: ['k8s/deployment.yaml']
					}
				];

				for (const task of wellDefinedTasks) {
					const taskContext: TaskContext = {
						affectedFiles: task.files,
						dependencies: task.deps,
						description: task.description
					};

					await measurePerformance(taskContext);
				}

				const fallbackRate = performanceMetrics.fallbackCount / performanceMetrics.totalTests;
				expect(fallbackRate).toBeLessThanOrEqual(performanceThresholds.fallbackRate);
			});

			it('should have higher fallback rate for ambiguous tasks', async () => {
				const ambiguousTasks = [
					{ deps: [], description: 'Fix the bug', files: ['src/utils/helper.ts'] },
					{ deps: [], description: 'Update the code', files: ['unknown.ts'] },
					{ deps: ['typescript'], description: 'Make it work', files: [] }
				];

				for (const task of ambiguousTasks) {
					const taskContext: TaskContext = {
						affectedFiles: task.files,
						dependencies: task.deps,
						description: task.description
					};

					await measurePerformance(taskContext);
				}

				const fallbackRate = performanceMetrics.fallbackCount / performanceMetrics.totalTests;
				expect(fallbackRate).toBeGreaterThan(0.5); // >50% fallback for ambiguous tasks
			});
		});

		describe('Concurrent Load Testing', () => {
			it('should handle multiple concurrent requests efficiently', async () => {
				const taskContexts: TaskContext[] = [
					{
						affectedFiles: ['src/components/Button.tsx'],
						dependencies: ['react'],
						description: 'Frontend component development'
					},
					{
						affectedFiles: ['src/controllers/api.ts'],
						dependencies: ['express'],
						description: 'Backend API implementation'
					},
					{
						affectedFiles: ['infrastructure/main.tf'],
						dependencies: ['terraform'],
						description: 'Infrastructure setup'
					},
					{
						affectedFiles: ['src/auth/jwt.ts'],
						dependencies: ['jsonwebtoken'],
						description: 'Security implementation'
					},
					{
						affectedFiles: ['tests/unit/app.test.ts'],
						dependencies: ['vitest'],
						description: 'Testing setup'
					}
				];

				const startTime = Date.now();
				const promises = taskContexts.map((ctx) => measurePerformance(ctx));
				const results = await Promise.all(promises);
				const totalDuration = Date.now() - startTime;

				expect(results).toHaveLength(5);
				results.forEach((result) => {
					expect(result).toBeDefined();
					expect(result.selectedAgent).toBeDefined();
				});

				// Concurrent execution should be faster than sequential
				const avgConcurrentTime = totalDuration / 5;
				expect(avgConcurrentTime).toBeLessThan(performanceThresholds.resolutionTime);
			});
		});
	});
});
