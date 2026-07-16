import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExternalMCPTool } from 'types/mcp-client.types';

import { resetToolIntegrityMonitor, ToolIntegrityMonitor } from './tool-integrity-monitor';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

function makeTools(...names: string[]): ExternalMCPTool[] {
	return names.map((name) => ({
		description: `Tool ${name}`,
		inputSchema: { properties: { input: { type: 'string' } }, type: 'object' },
		name,
		serverId: 'test-server'
	}));
}

describe('ToolIntegrityMonitor', () => {
	let monitor: ToolIntegrityMonitor;
	let dataDir: string;

	beforeEach(() => {
		resetToolIntegrityMonitor();
		dataDir = mkdtempSync(join(tmpdir(), 'valora-mcp-monitor-test-'));
		monitor = new ToolIntegrityMonitor({ baselineFilePath: join(dataDir, 'baselines.json') });
	});

	afterEach(() => {
		monitor.clearEvents();
		rmSync(dataDir, { recursive: true, force: true });
	});

	describe('computeFingerprint', () => {
		it('produces consistent hash for same tools', () => {
			const tools = makeTools('tool_a', 'tool_b');
			const fp1 = monitor.computeFingerprint(tools);
			const fp2 = monitor.computeFingerprint(tools);
			expect(fp1).toBe(fp2);
		});

		it('produces same hash regardless of order', () => {
			const fp1 = monitor.computeFingerprint(makeTools('tool_a', 'tool_b'));
			const fp2 = monitor.computeFingerprint(makeTools('tool_b', 'tool_a'));
			expect(fp1).toBe(fp2);
		});

		it('produces different hash for different tools', () => {
			const fp1 = monitor.computeFingerprint(makeTools('tool_a'));
			const fp2 = monitor.computeFingerprint(makeTools('tool_b'));
			expect(fp1).not.toBe(fp2);
		});
	});

	describe('checkIntegrity', () => {
		it('stores fingerprint on first connection', () => {
			const tools = makeTools('tool_a', 'tool_b');
			const result = monitor.checkIntegrity('server-1', tools);
			expect(result.changed).toBe(false);
			expect(result.currentFingerprint).toBe(monitor.computeFingerprint(tools));
		});

		it('reports no change for identical tools', () => {
			const tools = makeTools('tool_a', 'tool_b');
			monitor.checkIntegrity('server-1', tools);
			const result = monitor.checkIntegrity('server-1', tools);
			expect(result.changed).toBe(false);
		});

		it('detects added tools', () => {
			monitor.checkIntegrity('server-1', makeTools('tool_a'));
			const result = monitor.checkIntegrity('server-1', makeTools('tool_a', 'tool_b'));
			expect(result.changed).toBe(true);
			expect(result.diff!.added).toContain('tool_b');
			expect(result.diff!.removed).toHaveLength(0);
		});

		it('detects removed tools', () => {
			monitor.checkIntegrity('server-1', makeTools('tool_a', 'tool_b'));
			const result = monitor.checkIntegrity('server-1', makeTools('tool_a'));
			expect(result.changed).toBe(true);
			expect(result.diff!.removed).toContain('tool_b');
		});

		it('detects changed tools', () => {
			const tools1: ExternalMCPTool[] = [
				{
					description: 'Original description',
					inputSchema: { type: 'object' },
					name: 'tool_a',
					serverId: 'test-server'
				}
			];
			const tools2: ExternalMCPTool[] = [
				{
					description: 'Modified description with injection payload',
					inputSchema: { type: 'object' },
					name: 'tool_a',
					serverId: 'test-server'
				}
			];

			monitor.checkIntegrity('server-1', tools1);
			const result = monitor.checkIntegrity('server-1', tools2);
			expect(result.changed).toBe(true);
			expect(result.diff!.changed).toContain('tool_a');
		});

		it('records security event on change', () => {
			monitor.checkIntegrity('server-1', makeTools('tool_a'));
			monitor.checkIntegrity('server-1', makeTools('tool_a', 'tool_b'));
			const events = monitor.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe('tool_set_changed');
			expect(events[0]!.severity).toBe('critical');
		});

		it('tracks independent servers', () => {
			monitor.checkIntegrity('server-1', makeTools('tool_a'));
			monitor.checkIntegrity('server-2', makeTools('tool_b'));

			const result1 = monitor.checkIntegrity('server-1', makeTools('tool_a'));
			const result2 = monitor.checkIntegrity('server-2', makeTools('tool_b'));

			expect(result1.changed).toBe(false);
			expect(result2.changed).toBe(false);
		});
	});

	describe('fingerprint management', () => {
		it('allows manual fingerprint setting', () => {
			monitor.setFingerprint('server-1', 'abc123');
			expect(monitor.getFingerprint('server-1')).toBe('abc123');
		});

		it('allows clearing a manually-set fingerprint', () => {
			monitor.setFingerprint('server-1', 'abc123');
			monitor.clearFingerprint('server-1');
			expect(monitor.getFingerprint('server-1')).toBeUndefined();
		});
	});

	describe('key-namespace isolation between checkIntegrity and checkContentIntegrity', () => {
		it('does not let a tool-list fingerprint collide with an unrelated content fingerprint sharing the same effective key', () => {
			// A server literally named "mcp-connection:real-server" (MCP server ids
			// carry no character restriction) would, with no namespace separation,
			// collide with checkContentIntegrity's own `mcp-connection:${serverId}`
			// convention for a DIFFERENT server actually named "real-server".
			monitor.checkIntegrity('mcp-connection:real-server', makeTools('tool_a'));
			const result = monitor.checkContentIntegrity('mcp-connection:real-server', 'connection-config-fingerprint-v1');
			expect(result.changed).toBe(false);
		});
	});

	describe('checkContentIntegrity (plugin rug-pull detection)', () => {
		it('does not report a change on first use — seeds the baseline', () => {
			const result = monitor.checkContentIntegrity('plugin:secops', 'manifest+entrypoint content v1');
			expect(result.changed).toBe(false);
			expect(result.currentFingerprint).toMatch(/^[0-9a-f]{64}$/);
		});

		it('does not report a change when content is identical across calls', () => {
			monitor.checkContentIntegrity('plugin:secops', 'manifest+entrypoint content v1');
			const result = monitor.checkContentIntegrity('plugin:secops', 'manifest+entrypoint content v1');
			expect(result.changed).toBe(false);
		});

		it('reports a change when content differs from the stored baseline', () => {
			monitor.checkContentIntegrity('plugin:secops', 'manifest+entrypoint content v1');
			const result = monitor.checkContentIntegrity('plugin:secops', 'manifest+entrypoint content v2 — different code');
			expect(result.changed).toBe(true);
			expect(result.previousFingerprint).not.toBe(result.currentFingerprint);
		});

		it('logs a plugin_code_changed security event when content drifts', () => {
			monitor.checkContentIntegrity('plugin:secops', 'v1');
			monitor.checkContentIntegrity('plugin:secops', 'v2');
			const events = monitor.getEvents();
			expect(events.some((e) => e.type === 'plugin_code_changed')).toBe(true);
		});

		it('tracks separate plugins independently', () => {
			monitor.checkContentIntegrity('plugin:secops', 'secops-v1');
			monitor.checkContentIntegrity('plugin:qa', 'qa-v1');
			const secopsResult = monitor.checkContentIntegrity('plugin:secops', 'secops-v1');
			const qaResult = monitor.checkContentIntegrity('plugin:qa', 'qa-v1');
			expect(secopsResult.changed).toBe(false);
			expect(qaResult.changed).toBe(false);
		});

		it('persists the baseline across monitor instances (same file)', () => {
			monitor.checkContentIntegrity('plugin:secops', 'v1');
			const reloaded = new ToolIntegrityMonitor({ baselineFilePath: join(dataDir, 'baselines.json') });
			const result = reloaded.checkContentIntegrity('plugin:secops', 'v1');
			expect(result.changed).toBe(false);
		});
	});
});
