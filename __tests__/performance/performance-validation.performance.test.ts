/**
 * Performance Validation Tests for VALORA
 *
 * Measures real performance characteristics of Valora's core modules
 * against defined SLAs. All tests run against production code paths.
 */

import { AgentCapabilityMatcherService } from 'services/agent-capability-matcher.service';
import { AgentCapabilityRegistryService } from 'services/agent-capability-registry.service';
import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { DynamicAgentResolverService } from 'services/dynamic-agent-resolver.service';
import { TaskClassifierService } from 'services/task-classifier.service';
import { TaskContext } from 'types/agent.types';
import { estimateTokensFromText } from 'utils/token-estimator';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
					'software-engineer-typescript-backend': {
						domains: ['backend-api'],
						expertise: ['nodejs', 'express', 'graphql', 'postgresql'],
						priority: 95,
						role: 'software-engineer-typescript-backend',
						selectionCriteria: ['code-files', 'api-files']
					}
				}
			})
		),
		resolveAIPath: vi.fn(() => '/mock/path/agents/registry.json')
	};
});

describe('Performance Validation Tests', () => {
	let resolver: DynamicAgentResolverService;

	beforeAll(async () => {
		const registry = new AgentCapabilityRegistryService();
		await registry.initialize();
		const taskClassifier = new TaskClassifierService();
		const contextAnalyzer = new ContextAnalyzerService();
		const capabilityMatcher = new AgentCapabilityMatcherService(registry);
		resolver = new DynamicAgentResolverService(taskClassifier, contextAnalyzer, capabilityMatcher, registry);
	});

	it('agent-selection latency should stay under 500ms for a typical task context', async () => {
		const task: TaskContext = {
			affectedFiles: ['src/components/Button.tsx'],
			dependencies: ['react', 'typescript'],
			description: 'Add a new button variant'
		};
		const start = Date.now();
		const result = await resolver.resolveAgent(task);
		const duration = Date.now() - start;

		expect(result.selectedAgent).toBeDefined();
		expect(duration).toBeLessThan(500);
	});

	it('token-estimator should process 10 000 tokens worth of text in under 20ms', () => {
		// ~4 chars per token on average — 40 000 chars ≈ 10 000 tokens
		const largeText = 'a'.repeat(40_000);
		const start = Date.now();
		const count = estimateTokensFromText(largeText);
		const duration = Date.now() - start;

		expect(count).toBeGreaterThan(0);
		expect(duration).toBeLessThan(20);
	});

	it('agent-selection under sustained load: p95 latency under 400ms across 30 runs', async () => {
		const task: TaskContext = {
			affectedFiles: ['src/api/users.ts'],
			dependencies: ['express'],
			description: 'Add rate limiting'
		};
		const durations: number[] = [];

		for (let i = 0; i < 30; i++) {
			const start = Date.now();
			await resolver.resolveAgent(task);
			durations.push(Date.now() - start);
		}

		durations.sort((a, b) => a - b);
		const p95 = durations[Math.floor(durations.length * 0.95)]!;
		expect(p95).toBeLessThan(400);
	});
});
