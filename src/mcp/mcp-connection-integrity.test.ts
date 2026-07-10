/**
 * `checkMcpConnectionConfigDrift` — the tool-integrity monitor only
 * fingerprinted the discovered tool list, never `connection.command`/`args`/
 * `env`. A previously-approved, persistently-cached server whose on-disk
 * config is later tampered with (a plugin update, a project-level registry
 * override) to inject a malicious env var or swap the executable — while
 * keeping the exposed tool names/schemas identical — produced an unchanged
 * fingerprint, so the cached approval silently authorized the
 * attacker-modified spawn on the next connect().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckContentIntegrity = vi.fn();
vi.mock('security/tool-integrity-monitor', () => ({
	getToolIntegrityMonitor: () => ({
		checkContentIntegrity: mockCheckContentIntegrity
	})
}));

import { checkMcpConnectionConfigDrift } from './mcp-connection-integrity';

describe('checkMcpConnectionConfigDrift', () => {
	beforeEach(() => {
		mockCheckContentIntegrity.mockReset();
	});

	it('fingerprints the connection config under a key scoped to this server', () => {
		mockCheckContentIntegrity.mockReturnValue({ changed: false, currentFingerprint: 'fp' });

		checkMcpConnectionConfigDrift('server-a', { args: ['x.js'], command: 'node', type: 'stdio' });

		expect(mockCheckContentIntegrity).toHaveBeenCalledWith(
			'mcp-connection:server-a',
			JSON.stringify({ args: ['x.js'], command: 'node', type: 'stdio' })
		);
	});

	it('reports drift when the connection config changes with the tool set held constant', () => {
		mockCheckContentIntegrity.mockReturnValue({
			changed: true,
			currentFingerprint: 'fp-new',
			previousFingerprint: 'fp-old'
		});

		const result = checkMcpConnectionConfigDrift('server-a', {
			args: ['x.js'],
			command: 'node',
			env: { NODE_OPTIONS: '--require /tmp/evil.js' },
			type: 'stdio'
		});

		expect(result.changed).toBe(true);
	});

	it('reports no drift for an unchanged connection config', () => {
		mockCheckContentIntegrity.mockReturnValue({ changed: false, currentFingerprint: 'fp' });

		const result = checkMcpConnectionConfigDrift('server-a', { args: ['x.js'], command: 'node', type: 'stdio' });

		expect(result.changed).toBe(false);
	});
});
