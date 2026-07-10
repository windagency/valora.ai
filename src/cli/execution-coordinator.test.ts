/**
 * Tests for ExecutionCoordinator's agent-constraint wiring.
 *
 * Verifies that the root ExecutionContext created for a command run is
 * populated with the resolved agent's real declared constraints, instead of
 * always defaulting to empty (the gap identified in the secops audit).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedCommand } from './command-resolver';

vi.mock('executor/execution-context');
vi.mock('config/loader');
vi.mock('session/context');

const mockLoadAgent = vi.fn();
const mockRegisterPluginDir = vi.fn();
const mockListAgents = vi.fn().mockResolvedValue([]);

vi.mock('executor/agent-loader', () => ({
	AgentLoader: vi.fn().mockImplementation(() => ({
		listAgents: mockListAgents,
		loadAgent: mockLoadAgent,
		registerPluginDir: mockRegisterPluginDir
	}))
}));

vi.mock('di/container', () => ({
	getLoadedPlugins: vi.fn(() => [
		{
			agentsDir: '/plugin/agents',
			manifest: { name: 'secops', version: '1.0.0' },
			pluginDir: '/plugin',
			status: 'enabled'
		}
	])
}));

import { getConfigLoader } from 'config/loader';
import { ExecutionContext } from 'executor/execution-context';

import { ExecutionCoordinator } from './execution-coordinator';

const mockStrategy = { execute: vi.fn().mockResolvedValue({ outputs: {}, success: true }) };
const mockStrategyFactory = { getStrategy: vi.fn(() => mockStrategy) };

const mockSessionManager = {
	getAllContext: vi.fn(() => ({})),
	getContext: vi.fn(),
	getSession: vi.fn(() => ({ session_id: 'test-session' })),
	updateContext: vi.fn()
};

function makeResolvedCommand(agent: string): ResolvedCommand {
	return {
		command: {
			agent,
			'allowed-tools': [],
			description: 'test command',
			experimental: false,
			model: 'claude-sonnet-4.5',
			name: 'test-command',
			prompts: {
				cache_strategy: 'stage',
				merge_strategy: 'sequential',
				pipeline: [],
				retry_policy: { backoff_ms: 500, max_attempts: 2, retry_on: ['error'] }
			}
		},
		provider: {} as any,
		providerName: 'cursor' as any
	};
}

function makeAgent(overrides: Record<string, unknown> = {}) {
	return {
		capabilities: {
			can_review_code: true,
			can_run_tests: true,
			can_write_code: true,
			can_write_knowledge: true
		},
		content: '',
		description: 'test agent',
		role: 'test-agent',
		specialization: 'test',
		tone: 'concise-technical',
		version: '1.0.0',
		...overrides
	};
}

describe('ExecutionCoordinator agent-constraint wiring', () => {
	let coordinator: ExecutionCoordinator;

	beforeEach(() => {
		vi.clearAllMocks();
		mockListAgents.mockResolvedValue([]);

		vi.mocked(getConfigLoader).mockReturnValue({
			exists: vi.fn(() => true),
			get: vi.fn(() => ({ features: {} })),
			getConfigPath: vi.fn(() => '/mock/config.json'),
			load: vi.fn(),
			loadFromPath: vi.fn(),
			reload: vi.fn(),
			save: vi.fn()
		} as any);

		coordinator = new ExecutionCoordinator();
		(coordinator as any).strategyFactory = mockStrategyFactory;
	});

	it("loads the resolved agent's constraints and passes them into ExecutionContext", async () => {
		mockLoadAgent.mockResolvedValue(
			makeAgent({
				constraints: { forbidden_paths: ['.valora/', 'data/'], requires_approval_for: ['policy_changes'] },
				role: 'secops-engineer'
			})
		);

		const resolvedCommand = makeResolvedCommand('secops-engineer');
		await coordinator.executeCommand(
			'test-command',
			resolvedCommand,
			{ args: [], flags: {} },
			mockSessionManager as any
		);

		expect(mockLoadAgent).toHaveBeenCalledWith('secops-engineer');
		expect(ExecutionContext).toHaveBeenCalledWith(
			expect.objectContaining({
				agentConstraints: { forbidden_paths: ['.valora/', 'data/'], requires_approval_for: ['policy_changes'] }
			})
		);
	});

	it('passes empty constraints when the agent declares none', async () => {
		mockLoadAgent.mockResolvedValue(makeAgent({ role: 'generic-agent' }));

		const resolvedCommand = makeResolvedCommand('generic-agent');
		await coordinator.executeCommand(
			'test-command',
			resolvedCommand,
			{ args: [], flags: {} },
			mockSessionManager as any
		);

		expect(ExecutionContext).toHaveBeenCalledWith(expect.objectContaining({ agentConstraints: {} }));
	});

	it('registers plugin agent dirs before loading the resolved agent', async () => {
		mockLoadAgent.mockResolvedValue(makeAgent({ role: 'secops-engineer' }));

		const resolvedCommand = makeResolvedCommand('secops-engineer');
		await coordinator.executeCommand(
			'test-command',
			resolvedCommand,
			{ args: [], flags: {} },
			mockSessionManager as any
		);

		expect(mockRegisterPluginDir).toHaveBeenCalledWith('/plugin/agents');
		const registerOrder = mockRegisterPluginDir.mock.invocationCallOrder[0]!;
		const loadOrder = mockLoadAgent.mock.invocationCallOrder[0]!;
		expect(registerOrder).toBeLessThan(loadOrder);
	});
});
