/**
 * A stdio MCP server previously received the FULL inherited process.env —
 * every credential the valora process holds (ANTHROPIC_API_KEY, etc.) —
 * regardless of whether the server declared needing it. `buildStdioServerEnv`
 * scopes this to a minimal safe default plus whatever the server's own
 * config explicitly declares.
 */

import { describe, expect, it } from 'vitest';

import { buildStdioServerEnv } from './mcp-client-manager.service';

describe('buildStdioServerEnv', () => {
	it('does not pass through a credential-shaped variable the server never declared', () => {
		const processEnv = { ANTHROPIC_API_KEY: 'sk-ant-secret', HOME: '/home/node', PATH: '/usr/bin' };

		const env = buildStdioServerEnv(processEnv, undefined);

		expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
	});

	it('passes through PATH and HOME from the inherited environment', () => {
		const processEnv = { HOME: '/home/node', PATH: '/usr/bin:/bin' };

		const env = buildStdioServerEnv(processEnv, undefined);

		expect(env['PATH']).toBe('/usr/bin:/bin');
		expect(env['HOME']).toBe('/home/node');
	});

	it('includes whatever the server config explicitly declares', () => {
		const processEnv = { HOME: '/home/node', PATH: '/usr/bin' };

		const env = buildStdioServerEnv(processEnv, { MY_SERVER_TOKEN: 'declared-value' });

		expect(env['MY_SERVER_TOKEN']).toBe('declared-value');
	});

	it('lets a declared value override the allowlisted default for the same key', () => {
		const processEnv = { HOME: '/home/node', PATH: '/usr/bin' };

		const env = buildStdioServerEnv(processEnv, { PATH: '/custom/bin' });

		expect(env['PATH']).toBe('/custom/bin');
	});

	it('omits an allowlisted key that is absent from the inherited environment', () => {
		const processEnv = { PATH: '/usr/bin' };

		const env = buildStdioServerEnv(processEnv, undefined);

		expect('HOME' in env).toBe(false);
	});
});
