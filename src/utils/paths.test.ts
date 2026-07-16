import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSystemPluginsDir, getWorkspaceTrustCheckRoot, hasAnyValoraConfig } from './paths';

// `process.chdir()` is unsupported in Node worker threads (e.g. Stryker's dry-run test
// execution) — probe once at module load so the chdir-dependent describe blocks below skip
// gracefully in that environment instead of crashing the whole run, while still executing
// normally under regular Vitest/CI (which uses forks, not worker threads).
let chdirSupported = true;
try {
	const cwd = process.cwd();
	process.chdir(cwd);
} catch {
	chdirSupported = false;
}

describe('getSystemPluginsDir', () => {
	const originalPlatform = process.platform;

	afterEach(() => {
		delete process.env['VALORA_SYSTEM_PLUGINS_DIR'];
		Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
	});

	it('returns VALORA_SYSTEM_PLUGINS_DIR when set', () => {
		process.env['VALORA_SYSTEM_PLUGINS_DIR'] = '/custom/system/plugins';
		expect(getSystemPluginsDir()).toBe('/custom/system/plugins');
	});

	it('returns /usr/local/share/valora/plugins on linux', () => {
		Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
		expect(getSystemPluginsDir()).toBe('/usr/local/share/valora/plugins');
	});

	it('returns /usr/local/share/valora/plugins on darwin', () => {
		Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
		expect(getSystemPluginsDir()).toBe('/usr/local/share/valora/plugins');
	});

	it('returns PROGRAMDATA\\valora\\plugins on win32', () => {
		process.env['PROGRAMDATA'] = 'C:\\ProgramData';
		Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
		// path.join uses the host separator; compare with same join for cross-platform correctness
		expect(getSystemPluginsDir()).toBe(path.join('C:\\ProgramData', 'valora', 'plugins'));
	});

	it('falls back to C:\\ProgramData when PROGRAMDATA is unset on win32', () => {
		delete process.env['PROGRAMDATA'];
		Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
		expect(getSystemPluginsDir()).toContain('ProgramData');
		expect(getSystemPluginsDir()).toContain('valora');
		expect(getSystemPluginsDir()).toContain('plugins');
	});
});

describe.skipIf(!chdirSupported)('hasAnyValoraConfig', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-paths-test-'));
		originalCwd = process.cwd();
		// Override all scope dirs so tests are hermetic
		process.env['VALORA_GLOBAL_CONFIG_DIR'] = path.join(tmpDir, 'user-config');
		process.env['VALORA_SYSTEM_PLUGINS_DIR'] = path.join(tmpDir, 'system-plugins');
		process.chdir(tmpDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		delete process.env['VALORA_GLOBAL_CONFIG_DIR'];
		delete process.env['VALORA_SYSTEM_PLUGINS_DIR'];
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns false when no .valora config exists in any scope', () => {
		expect(hasAnyValoraConfig()).toBe(false);
	});

	it('returns true when a project-scope .valora/ directory exists in cwd', () => {
		fs.mkdirSync(path.join(tmpDir, '.valora'));
		expect(hasAnyValoraConfig()).toBe(true);
	});

	it('returns true when the user-scope config directory exists', () => {
		fs.mkdirSync(path.join(tmpDir, 'user-config'));
		expect(hasAnyValoraConfig()).toBe(true);
	});

	it('returns true when the system plugins directory exists', () => {
		fs.mkdirSync(path.join(tmpDir, 'system-plugins'));
		expect(hasAnyValoraConfig()).toBe(true);
	});
});

describe.skipIf(!chdirSupported)('getWorkspaceTrustCheckRoot', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-trust-root-test-'));
		originalCwd = process.cwd();
		process.chdir(tmpDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('falls back to process.cwd() when no .valora ancestor exists', () => {
		expect(getWorkspaceTrustCheckRoot()).toBe(process.cwd());
	});

	it('resolves to the project directory itself when .valora exists there', () => {
		fs.mkdirSync(path.join(tmpDir, '.valora'));
		expect(getWorkspaceTrustCheckRoot()).toBe(tmpDir);
	});

	it('walks up to the ancestor containing .valora when invoked from a subdirectory', () => {
		fs.mkdirSync(path.join(tmpDir, '.valora'));
		const subDir = path.join(tmpDir, 'src', 'deep', 'nested');
		fs.mkdirSync(subDir, { recursive: true });
		process.chdir(subDir);

		expect(getWorkspaceTrustCheckRoot()).toBe(tmpDir);
	});
});
