import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OptimizeScanner } from 'cli/commands/usage-optimize';
import { MCPAuditLoggerService } from 'mcp/mcp-audit-logger.service';
import { AgentSelectionAnalyticsService } from 'services/agent-selection-analytics.service';
import { SpendingRecord, SpendingTracker } from 'utils/spending-tracker';
import { UsageAnalytics } from 'utils/usage-analytics';

function record(overrides: Partial<SpendingRecord> = {}): SpendingRecord {
	return {
		activity: 'Coding',
		agent: 'lead',
		batchDiscounted: false,
		cacheReadCostUsd: 0,
		cacheReadTokens: 0,
		cacheSavingsUsd: 0,
		cacheWriteCostUsd: 0,
		cacheWriteTokens: 0,
		command: 'plan',
		completionTokens: 100,
		costUsd: 0.01,
		durationMs: 500,
		id: `id-${Math.random()}`,
		inputCostUsd: 0.01,
		iterations: 1,
		model: 'claude-sonnet',
		outputCostUsd: 0,
		plugin: 'valora-core-engineering',
		projectPath: '/projects/alpha',
		promptTokens: 500,
		sessionId: 'sess-A',
		stage: 'plan',
		success: true,
		timestamp: new Date().toISOString(),
		totalTokens: 600,
		unknownModelPricing: false,
		...overrides
	};
}

describe('OptimizeScanner', () => {
	let tmpDir: string;
	let tracker: SpendingTracker;
	let analytics: UsageAnalytics;
	let agentAnalytics: AgentSelectionAnalyticsService;
	let mcpAuditLogger: MCPAuditLoggerService;
	let scanner: OptimizeScanner;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-optimize-test-'));
		tracker = new SpendingTracker(tmpDir);
		analytics = new UsageAnalytics(tracker);
		agentAnalytics = new AgentSelectionAnalyticsService();
		mcpAuditLogger = new MCPAuditLoggerService(join(tmpDir, 'mcp-audit.jsonl'), false);
		scanner = new OptimizeScanner(analytics, agentAnalytics, mcpAuditLogger);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it('returns an empty findings list when there are no spending records', () => {
		const findings = scanner.scan();
		expect(findings).toHaveLength(0);
	});

	describe('unknown model pricing detector', () => {
		it('fires when more than 0% of records have unknown model pricing', () => {
			tracker.record(record({ unknownModelPricing: true, costUsd: 0.0 }));
			tracker.record(record({ unknownModelPricing: false }));

			const findings = scanner.scan();
			const f = findings.find((x) => x.detectorId === 'unknown-model-pricing');
			expect(f).toBeDefined();
		});

		it('does not fire when all records have known model pricing', () => {
			tracker.record(record({ unknownModelPricing: false }));
			const findings = scanner.scan();
			expect(findings.find((x) => x.detectorId === 'unknown-model-pricing')).toBeUndefined();
		});

		it('reports the affected commands in the details', () => {
			tracker.record(record({ command: 'my-cmd', unknownModelPricing: true, model: 'unknown-model' }));
			const [f] = scanner.scan().filter((x) => x.detectorId === 'unknown-model-pricing');
			expect(f!.details).toContain('my-cmd');
		});
	});

	describe('under-utilised prompt cache detector', () => {
		it('fires when a command repeated 3 or more times has cache savings ratio below 5%', () => {
			for (let i = 0; i < 4; i++) {
				tracker.record(
					record({
						command: 'review-code',
						costUsd: 0.1,
						cacheSavingsUsd: 0.001,
						cacheReadTokens: 0,
						promptTokens: 1000
					})
				);
			}
			const findings = scanner.scan();
			expect(findings.find((x) => x.detectorId === 'under-utilised-cache')).toBeDefined();
		});

		it('does not fire for a command that repeats but already has good cache savings', () => {
			for (let i = 0; i < 4; i++) {
				tracker.record(
					record({ command: 'plan', costUsd: 0.1, cacheSavingsUsd: 0.05, cacheReadTokens: 500, promptTokens: 500 })
				);
			}
			expect(scanner.scan().find((x) => x.detectorId === 'under-utilised-cache')).toBeUndefined();
		});

		it('does not fire for a command that runs fewer than 3 times', () => {
			tracker.record(record({ command: 'rarely-run', costUsd: 0.1, cacheSavingsUsd: 0, cacheReadTokens: 0 }));
			tracker.record(record({ command: 'rarely-run', costUsd: 0.1, cacheSavingsUsd: 0, cacheReadTokens: 0 }));
			expect(scanner.scan().find((x) => x.detectorId === 'under-utilised-cache')).toBeUndefined();
		});
	});

	describe('high-iteration commands detector', () => {
		it('fires when a command has median iterations greater than 2 while the overall median is at most 1', () => {
			// Overall median = 1 (from two cheap commands)
			for (let i = 0; i < 6; i++) tracker.record(record({ command: 'fast', iterations: 1 }));
			// One expensive command with high iterations
			for (let i = 0; i < 4; i++) tracker.record(record({ command: 'slow-cmd', iterations: 5 }));

			const findings = scanner.scan();
			const f = findings.find((x) => x.detectorId === 'high-iteration-command');
			expect(f).toBeDefined();
			expect(f!.details).toContain('slow-cmd');
		});

		it('does not fire when all commands have low median iterations', () => {
			for (let i = 0; i < 4; i++) tracker.record(record({ command: 'plan', iterations: 1 }));
			expect(scanner.scan().find((x) => x.detectorId === 'high-iteration-command')).toBeUndefined();
		});
	});

	describe('progressive-disclosure thrash detector', () => {
		it('fires when a command has high progressive-disclosure calls but low context savings in the majority of its runs', () => {
			for (let i = 0; i < 4; i++) {
				tracker.record(
					record({ command: 'analyze', progressiveDisclosureCalls: 6, contextSavingsPercent: 3, costUsd: 0.05 })
				);
			}
			const findings = scanner.scan();
			expect(findings.find((x) => x.detectorId === 'progressive-disclosure-thrash')).toBeDefined();
		});

		it('does not fire when context savings are sufficient', () => {
			for (let i = 0; i < 4; i++) {
				tracker.record(
					record({ command: 'analyze', progressiveDisclosureCalls: 6, contextSavingsPercent: 40, costUsd: 0.05 })
				);
			}
			expect(scanner.scan().find((x) => x.detectorId === 'progressive-disclosure-thrash')).toBeUndefined();
		});

		it('does not fire when no records carry progressive-disclosure data', () => {
			tracker.record(record({ command: 'plan' }));
			expect(scanner.scan().find((x) => x.detectorId === 'progressive-disclosure-thrash')).toBeUndefined();
		});

		it('does not fire for a command with only one run', () => {
			tracker.record(record({ command: 'once', progressiveDisclosureCalls: 7, contextSavingsPercent: 2 }));
			expect(scanner.scan().find((x) => x.detectorId === 'progressive-disclosure-thrash')).toBeUndefined();
		});
	});

	describe('agent mis-routing detector', () => {
		const minimalTask = {
			affectedFiles: [] as string[],
			complexity: 'low' as const,
			dependencies: [] as string[],
			description: 'test task'
		};
		const selectionWithFallback = {
			alternatives: [] as { agent: string; reasons: string[]; score: number }[],
			confidence: 0.5,
			reasons: ['low confidence'],
			selectedAgent: 'lead'
		};
		const selectionNormal = { ...selectionWithFallback, confidence: 0.9 };

		it('fires when combined fallback and manual-override rate exceeds 20% with at least 5 selections', () => {
			for (let i = 0; i < 4; i++) {
				agentAnalytics.recordAgentSelection(`s${i}`, 'cmd', minimalTask, selectionWithFallback, {});
			}
			agentAnalytics.recordAgentSelection('s4', 'cmd', minimalTask, selectionNormal, {});
			tracker.record(record({ costUsd: 0.1 }));

			const findings = scanner.scan();
			expect(findings.find((x) => x.detectorId === 'agent-misrouting')).toBeDefined();
		});

		it('does not fire when fallback and override rates are within acceptable bounds', () => {
			for (let i = 0; i < 10; i++) {
				agentAnalytics.recordAgentSelection(`s${i}`, 'cmd', minimalTask, selectionNormal, {});
			}
			expect(scanner.scan().find((x) => x.detectorId === 'agent-misrouting')).toBeUndefined();
		});

		it('does not fire when there are fewer than 5 agent selections', () => {
			for (let i = 0; i < 3; i++) {
				agentAnalytics.recordAgentSelection(`s${i}`, 'cmd', minimalTask, selectionWithFallback, {});
			}
			expect(scanner.scan().find((x) => x.detectorId === 'agent-misrouting')).toBeUndefined();
		});
	});

	describe('flaky MCP tools detector', () => {
		it('fires for a tool with 10 or more calls and a success rate below 90%', async () => {
			for (let i = 0; i < 7; i++) await mcpAuditLogger.logToolCall('my-server', 'search', true, 100);
			for (let i = 0; i < 4; i++) await mcpAuditLogger.logToolCall('my-server', 'search', false, 50, 'timeout');

			const findings = scanner.scan();
			expect(findings.find((x) => x.detectorId === 'flaky-mcp-tool')).toBeDefined();
		});

		it('does not fire when the tool has fewer than 10 calls', async () => {
			for (let i = 0; i < 6; i++) await mcpAuditLogger.logToolCall('my-server', 'fetch', true, 80);
			for (let i = 0; i < 3; i++) await mcpAuditLogger.logToolCall('my-server', 'fetch', false, 50, 'err');
			expect(scanner.scan().find((x) => x.detectorId === 'flaky-mcp-tool')).toBeUndefined();
		});

		it('does not fire when a frequently called tool has a high success rate', async () => {
			for (let i = 0; i < 10; i++) await mcpAuditLogger.logToolCall('my-server', 'list', true, 60);
			expect(scanner.scan().find((x) => x.detectorId === 'flaky-mcp-tool')).toBeUndefined();
		});

		it('includes the server id and tool name in the finding details', async () => {
			for (let i = 0; i < 7; i++) await mcpAuditLogger.logToolCall('prod-server', 'exec', true, 100);
			for (let i = 0; i < 5; i++) await mcpAuditLogger.logToolCall('prod-server', 'exec', false, 50, 'error');

			const [f] = scanner.scan().filter((x) => x.detectorId === 'flaky-mcp-tool');
			expect(f!.details).toContain('exec');
			expect(f!.details).toContain('prod-server');
		});
	});

	describe('findings shape', () => {
		it('each finding has the required fields: detectorId, title, urgency, details, estimatedSavingsUsd', () => {
			tracker.record(record({ unknownModelPricing: true }));

			const findings = scanner.scan();
			for (const f of findings) {
				expect(f).toHaveProperty('detectorId');
				expect(f).toHaveProperty('title');
				expect(f).toHaveProperty('urgency');
				expect(f).toHaveProperty('details');
				expect(f).toHaveProperty('estimatedSavingsUsd');
				expect(['low', 'medium', 'high']).toContain(f.urgency);
			}
		});

		it('findings are sorted by urgency (high before medium before low)', () => {
			// Trigger unknown model pricing (medium) and high iterations (medium)
			tracker.record(record({ unknownModelPricing: true }));
			for (let i = 0; i < 6; i++) tracker.record(record({ command: 'fast', iterations: 1 }));
			for (let i = 0; i < 4; i++) tracker.record(record({ command: 'slow-cmd', iterations: 5 }));

			const findings = scanner.scan();
			const urgencyOrder = { high: 0, medium: 1, low: 2 };
			for (let i = 1; i < findings.length; i++) {
				expect(urgencyOrder[findings[i]!.urgency]).toBeGreaterThanOrEqual(urgencyOrder[findings[i - 1]!.urgency]);
			}
		});
	});
});
