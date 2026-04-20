import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectPackageManager, getInstallCommand, type PackageManager } from './detect-package-manager';

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

describe('detectPackageManager', () => {
	const cases: Array<{ execPath: string; expected: PackageManager | null; label: string }> = [
		{
			label: 'pnpm global share',
			execPath: '/home/user/.local/share/pnpm/node',
			expected: 'pnpm',
		},
		{
			label: 'pnpm in path segment',
			execPath: '/opt/pnpm/bin/node',
			expected: 'pnpm',
		},
		{
			label: 'bun global install',
			execPath: '/home/user/.bun/install/global/node',
			expected: 'bun',
		},
		{
			label: 'yarn global path segment',
			execPath: '/opt/yarn/global/bin/node',
			expected: 'yarn',
		},
		{
			label: 'yarn config global',
			execPath: '/home/user/.config/yarn/global/node',
			expected: 'yarn',
		},
		{
			label: 'npm global lib',
			execPath: '/usr/local/lib/node_modules/@windagency/valora/node',
			expected: 'npm',
		},
		{
			label: 'generic node_modules',
			execPath: '/some/where/node_modules/.bin/node',
			expected: 'npm',
		},
		{
			label: 'unknown path',
			execPath: '/usr/bin/node',
			expected: null,
		},
	];

	for (const c of cases) {
		it(`detects ${c.label}`, () => {
			setExecPath(c.execPath);
			expect(detectPackageManager()).toBe(c.expected);
		});
	}
});

describe('getInstallCommand', () => {
	it('returns npm command', () => {
		expect(getInstallCommand('npm')).toEqual(['npm', 'install', '-g', '@windagency/valora@latest']);
	});
	it('returns pnpm command', () => {
		expect(getInstallCommand('pnpm')).toEqual(['pnpm', 'add', '-g', '@windagency/valora@latest']);
	});
	it('returns yarn command', () => {
		expect(getInstallCommand('yarn')).toEqual(['yarn', 'global', 'add', '@windagency/valora@latest']);
	});
	it('returns bun command', () => {
		expect(getInstallCommand('bun')).toEqual(['bun', 'install', '-g', '@windagency/valora@latest']);
	});
});
