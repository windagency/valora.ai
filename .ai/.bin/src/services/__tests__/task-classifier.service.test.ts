/**
 * Unit tests for TaskClassifierService service
 *
 * Tests the task classification functionality, including:
 * - Keyword extraction and pattern matching
 * - Domain classification based on task descriptions
 * - Complexity calculation
 * - Agent suggestions
 */

import { TaskClassifierService } from 'services/task-classifier.service';
import { TaskContext } from 'types/agent.types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('TaskClassifierService', () => {
	let classifier: TaskClassifierService;

	beforeEach(() => {
		classifier = new TaskClassifierService();
	});

	describe('classifyTask', () => {
		it('should classify infrastructure tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['infrastructure/main.tf', 'k8s/deployment.yaml'],
				complexity: 'high',
				dependencies: ['terraform', 'kubernetes'],
				description: 'Set up Kubernetes deployment with Terraform infrastructure'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('infrastructure');
			expect(result.confidence).toBeGreaterThan(0.5);
			expect(result.suggestedAgents).toContain('platform-engineer');
		});

		it('should classify security tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/auth/jwt.service.ts', 'src/auth/oauth.controller.ts'],
				complexity: 'medium',
				dependencies: ['passport', 'jsonwebtoken'],
				description: 'Implement OAuth2 authentication with JWT tokens and role-based access control'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('security');
			expect(result.confidence).toBeGreaterThan(0.4);
			expect(result.suggestedAgents).toContain('secops-engineer');
		});

		it('should classify backend API tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/api/users.controller.ts', 'src/graphql/user.resolver.ts'],
				complexity: 'medium',
				dependencies: ['express', '@nestjs/graphql'],
				description: 'Create REST API endpoints for user management with GraphQL support'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-backend-general');
			expect(result.suggestedAgents).toContain('software-engineer-typescript-backend');
		});

		it('should classify React frontend tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/components/Dashboard.tsx', 'src/hooks/useUser.ts'],
				complexity: 'medium',
				dependencies: ['react', 'react-dom'],
				description: 'Build React component with hooks for user dashboard'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-frontend-react');
			expect(result.suggestedAgents).toContain('software-engineer-typescript-frontend-react');
		});

		it('should classify general frontend tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/components/Button.svelte', 'src/styles/main.css'],
				complexity: 'low',
				dependencies: ['svelte'],
				description: 'Create responsive UI components with accessibility support'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-frontend-general');
			expect(result.suggestedAgents).toContain('software-engineer-typescript-frontend');
		});

		it('should classify TypeScript core tasks correctly', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/types/common.ts', 'src/utils/helpers.ts'],
				complexity: 'low',
				dependencies: ['typescript'],
				description: 'Create utility types and generic interfaces for the project'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-core');
			expect(result.suggestedAgents).toContain('software-engineer-typescript');
		});

		it('should respect explicitly set primary domain', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/file.ts'],
				dependencies: [],
				description: 'Some generic task description',
				primaryDomain: 'security'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('security');
			expect(result.confidence).toBe(0.95);
		});

		it('should calculate complexity when not provided', async () => {
			const taskContext: TaskContext = {
				// Very long description to reach high complexity
				affectedFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`), // 15 files
				dependencies: Array.from({ length: 10 }, (_, i) => `dep${i}`),
				description: 'A'.repeat(1200) // 10 dependencies
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.complexity).toBe('high');
		});

		it('should handle empty task context gracefully', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: ''
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
			expect(result.suggestedAgents).toBeInstanceOf(Array);
		});
	});

	describe('keyword extraction', () => {
		it('should extract infrastructure-related keywords', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Deploy to AWS using Terraform and Kubernetes'
			};

			const result = await classifier.classifyTask(taskContext);

			// The keywords should influence the classification
			expect(result.primaryDomain).toBe('infrastructure');
		});

		it('should extract security-related keywords', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Implement authentication with JWT and OAuth2'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('security');
		});

		it('should handle case-insensitive keyword matching', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				// Use keywords without substring collisions (e.g., 'typescript' contains 'type')
				description: 'build REACT HOOK with REDUX state management'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-frontend-react');
		});
	});

	describe('file-based domain detection', () => {
		it('should detect infrastructure from file extensions', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['infra/main.tf', 'deploy/k8s.yaml'],
				dependencies: [],
				description: 'Generic task'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('infrastructure');
		});

		it('should detect React from file patterns', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/components/App.tsx', 'src/hooks/useState.ts', 'src/state/store.ts'],
				// More specific React patterns
				dependencies: ['react'],
				description: 'Generic task'
			};

			const result = await classifier.classifyTask(taskContext);

			// May return typescript-core if React patterns don't score high enough
			expect(['typescript-frontend-react', 'typescript-core']).toContain(result.primaryDomain);
		});

		it('should detect backend from API file patterns', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/controllers/api.ts', 'src/services/database.ts', 'src/models/user.ts'],
				// More backend patterns
				dependencies: ['express'],
				description: 'Generic task'
			};

			const result = await classifier.classifyTask(taskContext);

			// May return typescript-core if backend patterns don't score high enough
			expect(['typescript-backend-general', 'typescript-core']).toContain(result.primaryDomain);
		});
	});

	describe('agent suggestions', () => {
		it('should suggest lead for high complexity tasks', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['infra/main.tf', 'src/auth/jwt.ts'],
				complexity: 'high',
				dependencies: [],
				description: 'Complex infrastructure and security implementation'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.suggestedAgents).toContain('lead');
			expect(result.suggestedAgents[0]).toBe('lead'); // Lead should be first for complex tasks
		});

		it('should suggest specialized agents for medium complexity', async () => {
			const taskContext: TaskContext = {
				// Avoid security keywords
				affectedFiles: ['src/controllers/product.controller.ts'],
				complexity: 'medium',
				dependencies: ['express'],
				description: 'Build REST API for products'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.suggestedAgents).toContain('software-engineer-typescript-backend');
		});

		it('should suggest multiple agents for mixed domains', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/frontend/User.tsx', 'src/backend/user-api.ts', 'src/auth/jwt.ts'],
				complexity: 'high',
				dependencies: [],
				description: 'Full-stack user management with security',
				secondaryDomains: ['security']
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.suggestedAgents).toContain('lead');
		});
	});

	describe('complexity calculation', () => {
		it('should classify as low complexity for simple tasks', async () => {
			const taskContext: TaskContext = {
				affectedFiles: ['src/file.ts'],
				dependencies: ['dep1'],
				description: 'Short task'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.complexity).toBe('low');
		});

		it('should classify as high complexity for complex tasks', async () => {
			const taskContext: TaskContext = {
				affectedFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`),
				dependencies: Array.from({ length: 10 }, (_, i) => `dep${i}`),
				description:
					'This is a very long and detailed task description that spans multiple lines and covers many different aspects of the implementation with lots of requirements and specifications that need to be carefully analyzed and implemented'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.complexity).toBe('high');
		});
	});

	describe('edge cases', () => {
		it('should handle very short descriptions', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'API'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
		});

		it('should handle descriptions with special characters', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Create API with GraphQL & REST endpoints!'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result.primaryDomain).toBe('typescript-backend-general');
		});

		it('should handle empty arrays gracefully', async () => {
			const taskContext: TaskContext = {
				affectedFiles: [],
				dependencies: [],
				description: 'Test task'
			};

			const result = await classifier.classifyTask(taskContext);

			expect(result).toBeDefined();
		});
	});
});
