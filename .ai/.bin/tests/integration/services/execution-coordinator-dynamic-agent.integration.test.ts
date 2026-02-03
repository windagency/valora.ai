/**
 * Integration tests for ExecutionCoordinator with Dynamic Agent Selection
 *
 * Tests the integration between ExecutionCoordinator and DynamicAgentResolverService,
 * ensuring proper agent selection and command execution flow.
 */

import { ResolvedCommand } from 'cli/command-resolver';
import { ExecutionCoordinator } from 'cli/execution-coordinator';
import { getConfigLoader } from 'config/loader';
import { ProviderName } from 'config/providers.config';
import { ExecutionContext } from 'executor/execution-context';
import { getLogger } from 'output/logger';
import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { TaskClassifierService } from 'services/task-classifier.service';
import { CommandResult } from 'types/command.types';
import { readFile } from 'utils/file-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('executor/execution-context');
vi.mock('session/context');
vi.mock('config/loader');
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		getAIRoot: vi.fn(() => '/mock/ai/root'),
		readFile: vi.fn(),
		resolveAIPath: vi.fn(() => '/mock/logs/path')
	};
});
vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: vi.fn(() => ({
		prompt: vi.fn().mockResolvedValue({ selectedAgent: 'software-engineer-typescript-backend' })
	}))
}));

const mockExecutionContext = {
	args: [],
	flags: {},
	getAllContext: vi.fn(() => ({})),
	getContext: vi.fn(),
	getStageOutputs: vi.fn(() => []),
	setAgentRole: vi.fn(),
	setContext: vi.fn(),
	setProvider: vi.fn(),
	updateContext: vi.fn()
};

const mockStrategyFactory = {
	getStrategy: vi.fn(() => mockStrategy)
};

const mockStrategy = {
	execute: vi.fn()
};

const mockSessionManager = {
	getAllContext: vi.fn(() => ({})),
	getContext: vi.fn(),
	getSession: vi.fn(() => ({ session_id: 'test-session' })),
	updateContext: vi.fn()
};

describe('ExecutionCoordinator - Dynamic Agent Integration', () => {
	let coordinator: ExecutionCoordinator;
	let dynamicResolver: DynamicAgentResolverService;
	let registry: AgentCapabilityRegistryService;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Mock config loader
		const mockConfig = {
			features: {
				agent_selection_analytics: false,
				agent_selection_fallback_reporting: false,
				agent_selection_monitoring: false,
				dynamic_agent_selection: false,
				dynamic_agent_selection_implement_only: true
			}
		};
		const mockConfigLoader = {
			exists: vi.fn(() => true),
			get: vi.fn(() => mockConfig),
			getConfigPath: vi.fn(() => '/mock/config.json'),
			load: vi.fn(),
			loadFromPath: vi.fn(),
			reload: vi.fn(),
			save: vi.fn()
		};
		vi.mocked(getConfigLoader).mockReturnValue(mockConfigLoader as any);

		// Mock file system for registry
		vi.mocked(readFile).mockResolvedValue(
			JSON.stringify({
				capabilities: {
					'platform-engineer': {
						domains: ['infrastructure'],
						expertise: ['terraform', 'kubernetes'],
						priority: 90,
						role: 'platform-engineer',
						selectionCriteria: ['terraform-files']
					},
					'software-engineer-typescript-backend': {
						domains: ['typescript-backend-general'],
						expertise: ['nodejs', 'express'],
						priority: 85,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: ['code-files']
					}
				},
				selectionCriteria: {
					'code-files': 'Code files',
					'terraform-files': 'Terraform files'
				},
				taskDomains: {
					infrastructure: 'Infrastructure tasks',
					'typescript-backend-general': 'Backend development'
				}
			})
		);

		// Initialize services
		registry = new AgentCapabilityRegistryService();
		await registry.initialize();

		const taskClassifier = new TaskClassifierService();
		const contextAnalyzer = new ContextAnalyzerService();
		const capabilityMatcher = new AgentCapabilityMatcherService(registry);

		dynamicResolver = new DynamicAgentResolverService(taskClassifier, contextAnalyzer, capabilityMatcher, registry);

		// Create coordinator with dynamic resolver
		coordinator = new ExecutionCoordinator(dynamicResolver);

		// Mock dependencies
		vi.mocked(ExecutionContext).mockReturnValue(mockExecutionContext as any);
		// Mock the strategy factory method directly
		(coordinator as any).strategyFactory = mockStrategyFactory;
		mockStrategyFactory.getStrategy.mockReturnValue(mockStrategy);
		mockStrategy.execute.mockResolvedValue({ outputs: {}, success: true });
	});

	describe('Dynamic Agent Selection Integration', () => {
		it('should use dynamic agent selection for commands with dynamic_agent_selection enabled', async () => {
			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript-backend',
					agent_selection_criteria: ['analyze_task_description'],
					'allowed-tools': ['codebase_search', 'write'],
					'argument-hint': '<plan>',
					description: 'Implement code changes',
					dynamic_agent_selection: true,
					experimental: true,
					fallback_agent: 'software-engineer-typescript',
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Implement user authentication API'],
				flags: {},
				sessionId: 'test-session'
			};

			const result = await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			// Should have called dynamic agent resolver
			expect(mockSessionManager.updateContext).toHaveBeenCalledWith(
				'dynamicAgentSelection',
				expect.objectContaining({
					confidence: expect.any(Number),
					reasons: expect.any(Array),
					selectedAgent: expect.any(String)
				})
			);

			// Should have created execution context with selected agent
			expect(ExecutionContext).toHaveBeenCalledWith(
				expect.objectContaining({
					agentRole: expect.any(String),
					args: ['Implement user authentication API'],
					commandName: 'implement' // Should be dynamically selected agent
				})
			);
		});

		it('should use static agent for commands without dynamic selection', async () => {
			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript-backend',
					'allowed-tools': ['read_file', 'grep'],
					'argument-hint': '<files>',
					description: 'Review code changes',
					experimental: false,
					model: 'claude-sonnet-4.5',
					name: 'review-code', // Static agent
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['src/file.ts'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('review-code', resolvedCommand, options, mockSessionManager as any);

			// Should not have called dynamic agent resolver
			expect(mockSessionManager.updateContext).not.toHaveBeenCalledWith('dynamicAgentSelection', expect.anything());

			// Should use static agent from command
			expect(ExecutionContext).toHaveBeenCalledWith(
				expect.objectContaining({
					agentRole: 'software-engineer-typescript-backend'
				})
			);
		});

		it('should handle dynamic agent selection errors gracefully', async () => {
			// Mock dynamic resolver to throw error
			const mockResolver = {
				resolveAgent: vi.fn().mockRejectedValue(new Error('Agent resolution failed'))
			};

			const coordinatorWithBrokenResolver = new ExecutionCoordinator(mockResolver as any);
			// Assign the mocked strategy factory to prevent real execution
			(coordinatorWithBrokenResolver as any).strategyFactory = mockStrategyFactory;

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					description: 'Implement code changes',
					dynamic_agent_selection: true,
					fallback_agent: 'software-engineer-typescript',
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Implement something'],
				flags: {},
				sessionId: 'test-session'
			};

			// Should not throw, should use fallback agent
			const result = await coordinatorWithBrokenResolver.executeCommand(
				'implement',
				resolvedCommand,
				options,
				mockSessionManager as any
			);

			expect(result).toBeDefined();
			expect(ExecutionContext).toHaveBeenCalledWith(
				expect.objectContaining({
					agentRole: 'software-engineer-typescript' // Fallback agent
				})
			);
		});

		it('should pass through execution results correctly', async () => {
			const mockCommandResult: CommandResult = {
				agent: 'software-engineer-typescript-backend',
				args: ['test'],
				command: 'implement',
				duration_ms: 1000,
				flags: {},
				model: 'claude-sonnet-4.5',
				outputs: { result: 'success' },
				session_id: 'test-session',
				success: true
			};

			mockStrategy.execute.mockResolvedValue(mockCommandResult);

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					fallback_agent: 'software-engineer-typescript',
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['test'],
				flags: {},
				sessionId: 'test-session'
			};

			const result = await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			expect(result.result).toEqual(mockCommandResult);
			expect(result.sessionManager).toBe(mockSessionManager);
			expect(result.startTime).toBeDefined();
		});
	});

	describe('Task Context Extraction', () => {
		it('should extract task description from implement command arguments', async () => {
			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Implement user registration with email validation'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			// Verify that the task context was created correctly
			// This is indirectly tested through the successful execution
			expect(mockStrategy.execute).toHaveBeenCalled();
		});

		it('should extract affected files from session context', async () => {
			mockSessionManager.getAllContext.mockReturnValue({
				targetFiles: ['src/auth/controller.ts', 'src/auth/service.ts']
			});

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Implement authentication'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			expect(mockSessionManager.getAllContext).toHaveBeenCalled();
		});

		it('should extract dependencies from session context', async () => {
			mockSessionManager.getContext.mockImplementation((key: string) => {
				if (key === 'dependencies') return ['express', 'jsonwebtoken'];
				return undefined;
			});

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Implement API'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			expect(mockSessionManager.getContext).toHaveBeenCalledWith('dependencies');
		});
	});

	describe('Agent Selection Transparency', () => {
		it('should store agent selection details in session context', async () => {
			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Setup Terraform infrastructure'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			// Should store agent selection in session context
			expect(mockSessionManager.updateContext).toHaveBeenCalledWith(
				'dynamicAgentSelection',
				expect.objectContaining({
					alternatives: expect.any(Array),
					confidence: expect.any(Number),
					reasons: expect.any(Array),
					selectedAgent: expect.any(String)
				})
			);
		});

		it('should log agent selection information', async () => {
			const loggerSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => {});

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['Build API endpoint'],
				flags: {},
				sessionId: 'test-session'
			};

			await coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any);

			// Should log agent selection
			expect(loggerSpy).toHaveBeenCalledWith(
				'Dynamic agent selected: software-engineer-typescript-backend',
				expect.objectContaining({
					confidence: expect.any(Number),
					reasons: expect.any(Array)
				})
			);

			loggerSpy.mockRestore();
		});
	});

	describe('Coordinator without Dynamic Resolver', () => {
		it('should work without dynamic agent resolver', async () => {
			// Create coordinator without dynamic resolver
			const coordinatorWithoutResolver = new ExecutionCoordinator();
			// Assign the mocked strategy factory to prevent real execution
			(coordinatorWithoutResolver as any).strategyFactory = mockStrategyFactory;

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript-backend',
					'allowed-tools': [],
					model: 'claude-sonnet-4.5',
					name: 'review-code',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['src/file.ts'],
				flags: {},
				sessionId: 'test-session'
			};

			const result = await coordinatorWithoutResolver.executeCommand(
				'review-code',
				resolvedCommand,
				options,
				mockSessionManager as any
			);

			// Should use static agent
			expect(ExecutionContext).toHaveBeenCalledWith(
				expect.objectContaining({
					agentRole: 'software-engineer-typescript-backend'
				})
			);

			expect(result).toBeDefined();
		});
	});

	describe('Error Scenarios', () => {
		it('should handle execution strategy failures', async () => {
			mockStrategy.execute.mockRejectedValue(new Error('Strategy execution failed'));

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['test'],
				flags: {},
				sessionId: 'test-session'
			};

			await expect(
				coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any)
			).rejects.toThrow('Strategy execution failed');
		});

		it('should handle context creation failures', async () => {
			vi.mocked(ExecutionContext).mockImplementation(() => {
				throw new Error('Context creation failed');
			});

			const resolvedCommand: ResolvedCommand = {
				command: {
					agent: 'software-engineer-typescript',
					'allowed-tools': [],
					dynamic_agent_selection: true,
					model: 'claude-sonnet-4.5',
					name: 'implement',
					prompts: {
						cache_strategy: 'stage',
						merge_strategy: 'sequential',
						pipeline: [],
						retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
					}
				},
				provider: {} as any,
				providerName: ProviderName.CURSOR
			};

			const options = {
				args: ['test'],
				flags: {},
				sessionId: 'test-session'
			};

			await expect(
				coordinator.executeCommand('implement', resolvedCommand, options, mockSessionManager as any)
			).rejects.toThrow('Context creation failed');
		});
	});
});
