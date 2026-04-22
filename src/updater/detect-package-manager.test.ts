import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectFromPath, detectPackageManager, getInstallCommand, type PackageManager } from './detect-package-manager';

// ---------------------------------------------------------------------------
// detectFromPath — table-driven unit tests
// ---------------------------------------------------------------------------

describe('detectFromPath', () => {
	const cases: Array<{ path: string; expected: PackageManager | null; label: string }> = [
		// pnpm — macOS / Linux
		{
			label: 'pnpm local share (Linux)',
			path: '/home/user/.local/share/pnpm/global/5/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'pnpm'
		},
		{
			label: 'pnpm path segment (Linux)',
			path: '/opt/pnpm/bin/node',
			expected: 'pnpm'
		},
		// pnpm — Windows (backslashes must be normalised)
		{
			label: 'pnpm local share (Windows backslashes)',
			path: 'C:\\Users\\user\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@windagency\\valora\\dist\\updater\\detect-package-manager.js',
			expected: 'pnpm'
		},
		// bun — macOS / Linux
		{
			label: 'bun global install path',
			path: '/home/user/.bun/install/global/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'bun'
		},
		{
			label: 'bun bin path',
			path: '/home/user/.bun/bin/valora',
			expected: 'bun'
		},
		// bun — Windows (backslashes)
		{
			label: 'bun global install (Windows backslashes)',
			path: 'C:\\Users\\user\\.bun\\install\\global\\node_modules\\@windagency\\valora\\dist\\updater\\detect-package-manager.js',
			expected: 'bun'
		},
		// yarn — macOS / Linux
		{
			label: 'yarn global path segment (Linux)',
			path: '/opt/yarn/global/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'yarn'
		},
		{
			label: 'yarn config global (macOS)',
			path: '/home/user/.config/yarn/global/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'yarn'
		},
		// npm — macOS / Linux
		{
			label: 'npm global lib (Linux)',
			path: '/usr/local/lib/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'npm'
		},
		{
			label: 'npm generic node_modules',
			path: '/some/where/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'npm'
		},
		// npm — Windows (backslashes)
		{
			label: 'npm lib/node_modules (Windows backslashes)',
			path: 'C:\\Program Files\\nodejs\\node_modules\\@windagency\\valora\\dist\\updater\\detect-package-manager.js',
			expected: 'npm'
		},
		// pnpm must NOT match npm rule (order priority)
		{
			label: 'pnpm path does not fall through to npm',
			path: '/home/user/.local/share/pnpm/global/5/node_modules/@windagency/valora/dist/updater/detect-package-manager.js',
			expected: 'pnpm'
		},
		// negative case
		{
			label: 'unknown path returns null',
			path: '/usr/bin/node',
			expected: null
		},
		{
			label: 'empty string returns null',
			path: '',
			expected: null
		}
	];

	for (const c of cases) {
		it(`returns "${String(c.expected)}" for ${c.label}`, () => {
			expect(detectFromPath(c.path)).toBe(c.expected);
		});
	}
});

// ---------------------------------------------------------------------------
// detectPackageManager — integration-level tests
// Uses Object.defineProperty to control process.execPath (fallback path).
// import.meta.url cannot be mocked at runtime, so we rely on detectFromPath
// for primary-path coverage and only test the fallback branch here.
// ---------------------------------------------------------------------------

let originalExecPath: string;

beforeEach(() => {
	originalExecPath = process.execPath;
});

afterEach(() => {
	Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
});

function setExecPath(value: string): void {
	Object.defineProperty(process, 'execPath', { value, configurable: true });
}

describe('detectPackageManager fallback to process.execPath', () => {
	// In the test environment import.meta.url points to the Vitest runner
	// path, which will not match any package-manager signature.  That means
	// detectPackageManager() will always reach the process.execPath branch,
	// letting us test each PM via the fallback.

	const cases: Array<{ execPath: string; expected: PackageManager | null; label: string }> = [
		{
			label: 'pnpm global share via execPath',
			execPath: '/home/user/.local/share/pnpm/node',
			expected: 'pnpm'
		},
		{
			label: 'pnpm path segment via execPath',
			execPath: '/opt/pnpm/bin/node',
			expected: 'pnpm'
		},
		{
			label: 'bun global install via execPath',
			execPath: '/home/user/.bun/install/global/node',
			expected: 'bun'
		},
		{
			label: 'bun bin via execPath',
			execPath: '/home/user/.bun/bin/bun',
			expected: 'bun'
		},
		{
			label: 'yarn global path segment via execPath',
			execPath: '/opt/yarn/global/bin/node',
			expected: 'yarn'
		},
		{
			label: 'yarn config global via execPath',
			execPath: '/home/user/.config/yarn/global/node',
			expected: 'yarn'
		},
		{
			label: 'npm global lib via execPath',
			execPath: '/usr/local/lib/node_modules/@windagency/valora/node',
			expected: 'npm'
		},
		{
			label: 'generic node_modules via execPath',
			execPath: '/some/where/node_modules/.bin/node',
			expected: 'npm'
		},
		{
			label: 'unknown path returns null',
			execPath: '/usr/bin/node',
			expected: null
		}
	];

	for (const c of cases) {
		it(`detects ${c.label}`, () => {
			setExecPath(c.execPath);
			expect(detectPackageManager()).toBe(c.expected);
		});
	}
});

// ---------------------------------------------------------------------------
// getInstallCommand — object-literal correctness
// ---------------------------------------------------------------------------

describe('getInstallCommand', () => {
	it('returns npm install command', () => {
		expect(getInstallCommand('npm')).toEqual(['npm', 'install', '-g', '@windagency/valora@latest']);
	});
	it('returns pnpm add command', () => {
		expect(getInstallCommand('pnpm')).toEqual(['pnpm', 'add', '-g', '@windagency/valora@latest']);
	});
	it('returns yarn global add command', () => {
		expect(getInstallCommand('yarn')).toEqual(['yarn', 'global', 'add', '@windagency/valora@latest']);
	});
	it('returns bun install command', () => {
		expect(getInstallCommand('bun')).toEqual(['bun', 'install', '-g', '@windagency/valora@latest']);
	});
});
