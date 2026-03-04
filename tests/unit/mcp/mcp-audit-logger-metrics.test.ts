/**
 * Unit tests for MCPAuditLoggerService.getDashboardMetrics()
 *
 * Tests the aggregation of audit log entries into dashboard metrics:
 * - Empty log returns zeroed metrics
 * - Single and multiple tool call aggregation
 * - Multi-server grouping and sorting
 * - Success rate calculation
 * - Duration averaging
 * - Tool breakdown per server
 * - Connection state tracking
 * - Recent calls ordering
 * - Duration trend values
 */

import { MCPAuditLoggerService, resetMCPAuditLogger } from 'mcp/mcp-audit-logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

describe('MCPAuditLoggerService.getDashboardMetrics()', () => {
	let service: MCPAuditLoggerService;

	beforeEach(() => {
		resetMCPAuditLogger();
		// Disable file writes for tests
		service = new MCPAuditLoggerService('', false);
	});

	afterEach(() => {
		resetMCPAuditLogger();
	});

	it('returns zeroed metrics with successRate 1 for empty log', () => {
		const metrics = service.getDashboardMetrics();

		expect(metrics.totalToolCalls).toBe(0);
		expect(metrics.totalErrors).toBe(0);
		expect(metrics.overallSuccessRate).toBe(1);
		expect(metrics.avgDurationMs).toBe(0);
		expect(metrics.activeServerCount).toBe(0);
		expect(metrics.servers).toHaveLength(0);
		expect(metrics.recentToolCalls).toHaveLength(0);
		expect(metrics.durationTrend).toHaveLength(0);
	});

	it('aggregates a single tool call', async () => {
		await service.logToolCall('server-a', 'navigate', true, 150);

		const metrics = service.getDashboardMetrics();

		expect(metrics.totalToolCalls).toBe(1);
		expect(metrics.totalErrors).toBe(0);
		expect(metrics.overallSuccessRate).toBe(1);
		expect(metrics.avgDurationMs).toBe(150);
		expect(metrics.servers).toHaveLength(1);
		expect(metrics.servers[0].serverId).toBe('server-a');
		expect(metrics.servers[0].totalCalls).toBe(1);
		expect(metrics.servers[0].successCount).toBe(1);
		expect(metrics.servers[0].errorCount).toBe(0);
	});

	it('aggregates multiple tool calls', async () => {
		await service.logToolCall('server-a', 'navigate', true, 100);
		await service.logToolCall('server-a', 'click', true, 200);
		await service.logToolCall('server-a', 'screenshot', false, 300, 'timeout');

		const metrics = service.getDashboardMetrics();

		expect(metrics.totalToolCalls).toBe(3);
		expect(metrics.totalErrors).toBe(1);
		expect(metrics.avgDurationMs).toBe(200);
		expect(metrics.servers).toHaveLength(1);
		expect(metrics.servers[0].totalCalls).toBe(3);
		expect(metrics.servers[0].successCount).toBe(2);
		expect(metrics.servers[0].errorCount).toBe(1);
	});

	it('groups and sorts multiple servers by totalCalls descending', async () => {
		// server-b has more calls
		await service.logToolCall('server-a', 'tool1', true, 100);
		await service.logToolCall('server-b', 'tool1', true, 100);
		await service.logToolCall('server-b', 'tool2', true, 200);
		await service.logToolCall('server-b', 'tool3', true, 300);

		const metrics = service.getDashboardMetrics();

		expect(metrics.servers).toHaveLength(2);
		expect(metrics.servers[0].serverId).toBe('server-b');
		expect(metrics.servers[0].totalCalls).toBe(3);
		expect(metrics.servers[1].serverId).toBe('server-a');
		expect(metrics.servers[1].totalCalls).toBe(1);
	});

	it('calculates success rate correctly', async () => {
		for (let i = 0; i < 8; i++) {
			await service.logToolCall('server-a', 'tool1', true, 100);
		}
		for (let i = 0; i < 2; i++) {
			await service.logToolCall('server-a', 'tool1', false, 100, 'error');
		}

		const metrics = service.getDashboardMetrics();

		expect(metrics.overallSuccessRate).toBe(0.8);
		expect(metrics.servers[0].successRate).toBe(0.8);
	});

	it('calculates duration averaging correctly', async () => {
		await service.logToolCall('server-a', 'tool1', true, 100);
		await service.logToolCall('server-a', 'tool2', true, 300);
		await service.logToolCall('server-a', 'tool1', true, 200);

		const metrics = service.getDashboardMetrics();

		expect(metrics.avgDurationMs).toBe(200);
		expect(metrics.servers[0].avgDurationMs).toBe(200);
	});

	it('builds tool breakdown per server', async () => {
		await service.logToolCall('server-a', 'navigate', true, 100);
		await service.logToolCall('server-a', 'navigate', true, 200);
		await service.logToolCall('server-a', 'click', true, 50);
		await service.logToolCall('server-a', 'click', false, 75, 'error');

		const metrics = service.getDashboardMetrics();
		const server = metrics.servers[0];
		const toolBreakdown = server.toolBreakdown;

		expect(toolBreakdown).toHaveLength(2);

		// navigate has more calls so should be first (sorted by calls desc)
		const navigateTool = toolBreakdown.find((t) => t.toolName === 'navigate');
		expect(navigateTool).toBeDefined();
		expect(navigateTool!.calls).toBe(2);
		expect(navigateTool!.successRate).toBe(1);
		expect(navigateTool!.avgDurationMs).toBe(150);

		const clickTool = toolBreakdown.find((t) => t.toolName === 'click');
		expect(clickTool).toBeDefined();
		expect(clickTool!.calls).toBe(2);
		expect(clickTool!.successRate).toBe(0.5);
		expect(clickTool!.avgDurationMs).toBe(62.5);
	});

	it('tracks connection state from connect/disconnect entries', async () => {
		await service.logConnection('server-a', true);
		await service.logConnection('server-b', true);

		let metrics = service.getDashboardMetrics();
		expect(metrics.activeServerCount).toBe(2);

		await service.logDisconnection('server-a');

		metrics = service.getDashboardMetrics();
		expect(metrics.activeServerCount).toBe(1);
	});

	it('orders recent calls newest first', async () => {
		await service.logToolCall('server-a', 'tool1', true, 100);
		await service.logToolCall('server-a', 'tool2', true, 200);
		await service.logToolCall('server-a', 'tool3', true, 300);

		const metrics = service.getDashboardMetrics();

		expect(metrics.recentToolCalls).toHaveLength(3);
		expect(metrics.recentToolCalls[0].toolName).toBe('tool3');
		expect(metrics.recentToolCalls[1].toolName).toBe('tool2');
		expect(metrics.recentToolCalls[2].toolName).toBe('tool1');
	});

	it('limits recent calls to 10', async () => {
		for (let i = 0; i < 15; i++) {
			await service.logToolCall('server-a', `tool${i}`, true, 100);
		}

		const metrics = service.getDashboardMetrics();

		expect(metrics.recentToolCalls).toHaveLength(10);
		// Newest should be first
		expect(metrics.recentToolCalls[0].toolName).toBe('tool14');
	});

	it('builds duration trend with last 30 values', async () => {
		for (let i = 0; i < 40; i++) {
			await service.logToolCall('server-a', 'tool1', true, i * 10);
		}

		const metrics = service.getDashboardMetrics();

		expect(metrics.durationTrend).toHaveLength(30);
		// Should be the last 30 entries (indices 10-39)
		expect(metrics.durationTrend[0]).toBe(100);
		expect(metrics.durationTrend[29]).toBe(390);
	});

	it('includes recentDurations per server (last 20)', async () => {
		for (let i = 0; i < 25; i++) {
			await service.logToolCall('server-a', 'tool1', true, i * 10);
		}

		const metrics = service.getDashboardMetrics();
		const server = metrics.servers[0];

		expect(server.recentDurations).toHaveLength(20);
		expect(server.recentDurations[0]).toBe(50);
		expect(server.recentDurations[19]).toBe(240);
	});

	it('handles non-tool_call entries without affecting metrics', async () => {
		await service.logApproval('server-a', true);
		await service.logError('server-a', 'some error');
		await service.logConnection('server-a', true);

		const metrics = service.getDashboardMetrics();

		expect(metrics.totalToolCalls).toBe(0);
		expect(metrics.servers).toHaveLength(0);
		// Connection state still tracked
		expect(metrics.activeServerCount).toBe(1);
	});

	it('handles failed connection not counting as active', async () => {
		await service.logConnection('server-a', false);

		const metrics = service.getDashboardMetrics();
		expect(metrics.activeServerCount).toBe(0);
	});
});
