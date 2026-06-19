import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';

import { printPluginsSection } from './doctor';

const noopColor = {
	bold: (s: string) => s,
	cyan: (s: string) => s,
	dim: (s: string) => s,
	gray: (s: string) => s,
	green: (s: string) => s,
	red: (s: string) => s,
	yellow: (s: string) => s
} as never;

function plugin(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
	return {
		location: 'user',
		manifest: {
			contributes: ['code'],
			name: 'valora-plugin-example',
			permissions: ['code-exec'],
			version: '1.0.0'
		},
		pluginDir: '/plugins/valora-plugin-example',
		status: 'enabled',
		...overrides
	};
}

describe('doctor — printPluginsSection', () => {
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	function captured(): string {
		return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
	}

	it('prints "(none)" when no plugins are loaded', () => {
		printPluginsSection(noopColor, []);
		expect(captured()).toContain('(none)');
	});

	it('prints contributes and permissions for an enabled plugin', () => {
		printPluginsSection(noopColor, [plugin()]);
		const out = captured();
		expect(out).toContain('valora-plugin-example');
		expect(out).toContain('contributes: code');
		expect(out).toContain('permissions: code-exec');
	});

	it('surfaces unenforcedPermissions on a separate line when present', () => {
		printPluginsSection(noopColor, [
			plugin({
				manifest: {
					contributes: ['code'],
					name: 'valora-plugin-example',
					permissions: ['code-exec', 'fs-write', 'network'],
					version: '1.0.0'
				},
				unenforcedPermissions: ['fs-write', 'network']
			})
		]);
		const out = captured();
		expect(out).toContain('informational:');
		expect(out).toContain('fs-write');
		expect(out).toContain('network');
		expect(out).toContain('not gated by the runtime');
	});

	it('omits the informational line when the plugin declares no unenforced permissions', () => {
		printPluginsSection(noopColor, [plugin()]);
		expect(captured()).not.toContain('informational:');
	});
});
