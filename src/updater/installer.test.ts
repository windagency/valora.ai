import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAutoInstall } from './installer';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

function makeChild(exitCode: number): ReturnType<typeof spawnMock> {
	const child = {
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (event === 'exit') setImmediate(() => cb(exitCode));
			return child;
		})
	};
	return child;
}

function makeErrorChild(err: Error): ReturnType<typeof spawnMock> {
	const child = {
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (event === 'error') setImmediate(() => cb(err));
			return child;
		})
	};
	return child;
}

let originalExecPath: string;

beforeEach(() => {
	originalExecPath = process.execPath;
});

afterEach(() => {
	Object.defineProperty(process, 'execPath', { value: originalExecPath, writable: true });
	vi.clearAllMocks();
});

describe('runAutoInstall', () => {
	it('detects npm and installs silently, returning success on exit 0', async () => {
		Object.defineProperty(process, 'execPath', {
			value: '/usr/local/lib/node_modules/.bin/node',
			writable: true
		});
		spawnMock.mockReturnValue(makeChild(0));

		const result = await runAutoInstall();

		expect(result).toBe('success');
		expect(spawnMock).toHaveBeenCalledOnce();
		const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
		expect(cmd).toBe('npm');
		expect(args).toContain('@windagency/valora@latest');
		expect(opts.stdio).toBe('pipe');
	});

	it('returns "no-pm" when package manager cannot be detected', async () => {
		Object.defineProperty(process, 'execPath', { value: '/usr/bin/node', writable: true });

		const result = await runAutoInstall();

		expect(result).toBe('no-pm');
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('returns "failure" when install exits with non-zero code', async () => {
		Object.defineProperty(process, 'execPath', {
			value: '/usr/local/lib/node_modules/.bin/node',
			writable: true
		});
		spawnMock.mockReturnValue(makeChild(1));

		const result = await runAutoInstall();

		expect(result).toBe('failure');
	});

	it('returns "failure" when spawn emits an error', async () => {
		Object.defineProperty(process, 'execPath', {
			value: '/usr/local/lib/node_modules/.bin/node',
			writable: true
		});
		spawnMock.mockReturnValue(makeErrorChild(new Error('ENOENT')));

		const result = await runAutoInstall();

		expect(result).toBe('failure');
	});
});
