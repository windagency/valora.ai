import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolIntegrityMonitor } from './tool-integrity-monitor';

import type { ExternalMCPTool } from 'types/mcp-client.types';

function makeTool(name: string, description: string): ExternalMCPTool {
	return {
		description,
		inputSchema: { properties: {}, type: 'object' },
		name,
		serverId: 'test-server',
	};
}

describe('ToolIntegrityMonitor — baseline persistence', () => {
	let dataDir: string;
	let baselineFile: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), 'valora-mcp-baselines-'));
		baselineFile = join(dataDir, 'mcp-baselines.json');
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('detects drift across a simulated process restart by reloading baselines from disk', () => {
		const before = new ToolIntegrityMonitor({ baselineFilePath: baselineFile });
		const initial = before.checkIntegrity('server-1', [makeTool('search', 'safe search'), makeTool('read', 'safe read')]);
		expect(initial.changed).toBe(false);

		// Simulate process restart: throw away the in-memory monitor.
		const after = new ToolIntegrityMonitor({ baselineFilePath: baselineFile });

		const drift = after.checkIntegrity('server-1', [
			makeTool('search', 'NOW EXFILTRATES SECRETS'),
			makeTool('read', 'safe read'),
		]);

		expect(drift.changed).toBe(true);
		expect(drift.diff?.changed).toContain('search');
	});

	it('records the first connection as a baseline without firing a drift event', () => {
		const monitor = new ToolIntegrityMonitor({ baselineFilePath: baselineFile });
		const result = monitor.checkIntegrity('server-2', [makeTool('a', 'd')]);

		expect(result.changed).toBe(false);
		expect(monitor.getEvents()).toHaveLength(0);
	});

	it('persists multiple servers independently', () => {
		const before = new ToolIntegrityMonitor({ baselineFilePath: baselineFile });
		before.checkIntegrity('server-a', [makeTool('x', 'd1')]);
		before.checkIntegrity('server-b', [makeTool('y', 'd2')]);

		const after = new ToolIntegrityMonitor({ baselineFilePath: baselineFile });
		const aDrift = after.checkIntegrity('server-a', [makeTool('x', 'd1-changed')]);
		const bSame = after.checkIntegrity('server-b', [makeTool('y', 'd2')]);

		expect(aDrift.changed).toBe(true);
		expect(bSame.changed).toBe(false);
	});

	it('continues to operate as in-memory when baseline file is unwritable', () => {
		const monitor = new ToolIntegrityMonitor({ baselineFilePath: '/nonexistent-dir/baselines.json' });

		const first = monitor.checkIntegrity('s', [makeTool('a', 'd')]);
		const second = monitor.checkIntegrity('s', [makeTool('a', 'd-changed')]);

		expect(first.changed).toBe(false);
		expect(second.changed).toBe(true);
	});
});
