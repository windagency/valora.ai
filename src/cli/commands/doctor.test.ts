import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';

vi.mock('di/container', () => ({
	getLoadedPlugins: () => []
}));

vi.mock('services/diagnostics.service', () => ({
	DiagnosticsService: class {
		async runAllChecks() {
			return [{ message: 'ok', status: 'pass' }];
		}
	}
}));

vi.mock('output/diagnostic-formatter', () => ({
	getDiagnosticFormatter: () => ({
		exportToJSON: () => JSON.stringify({ report: 'ok' }),
		formatReport: () => 'ok'
	})
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		dim: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	})
}));

import { configureDoctorCommand, printPluginsSection } from './doctor';

// `process.chdir()` is unsupported in Node worker threads (e.g. Stryker's dry-run test
// execution) — probe once at module load so the chdir-dependent describe block below skips
// gracefully in that environment instead of crashing the whole run, while still executing
// normally under regular Vitest/CI (which uses forks, not worker threads).
let chdirSupported = true;
try {
	const cwd = process.cwd();
	process.chdir(cwd);
} catch {
	chdirSupported = false;
}

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

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureDoctorCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe.skipIf(!chdirSupported)('doctor --export', () => {
	let tmpDir: string;
	let originalCwd: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-doctor-cmd-'));
		process.chdir(tmpDir);
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('blocks --export pointing outside the working directory', async () => {
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-doctor-cmd-outside-'));
		const outsideTarget = path.join(outsideDir, 'report.json');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['doctor', '--export', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(outsideTarget)).rejects.toThrow();

		errorSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('blocks --export pointing at a protected security-infrastructure basename even when it sits inside the working directory', async () => {
		const target = path.join(tmpDir, '.valora', 'security-audit.jsonl');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['doctor', '--export', target]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(target)).rejects.toThrow();

		errorSpy.mockRestore();
	});

	it('still allows --export pointing inside the working directory', async () => {
		const target = path.join(tmpDir, 'nested', 'report.json');

		await runCommand(makeProgram(), ['doctor', '--export', target]);

		const written = await fs.readFile(target, 'utf-8');
		expect(JSON.parse(written)).toEqual({ report: 'ok' });
	});
});
