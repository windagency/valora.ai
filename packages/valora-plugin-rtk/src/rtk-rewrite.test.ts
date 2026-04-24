import { execFile } from 'child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../hooks/rtk-rewrite.sh');

interface HookOutput {
	hookSpecificOutput: { hookEventName: string; updatedInput: { command: string } };
}

function run(
	input: Record<string, unknown>,
	env: Record<string, string>
): Promise<{ exitCode: number; stdout: string }> {
	return new Promise((resolve) => {
		const child = execFile('bash', [SCRIPT], { env: { ...process.env, ...env } }, (error, stdout) => {
			const rawCode = error?.code;
			resolve({ exitCode: typeof rawCode === 'number' ? rawCode : 0, stdout });
		});
		child.stdin!.write(JSON.stringify(input));
		child.stdin!.end();
	});
}

describe('rtk-rewrite.sh', () => {
	let rtkBinDir: string;
	let pathWithRtk: string;

	beforeAll(() => {
		rtkBinDir = join(tmpdir(), `valora-rtk-test-${Date.now()}`);
		mkdirSync(rtkBinDir, { recursive: true });
		writeFileSync(join(rtkBinDir, 'rtk'), '#!/usr/bin/env bash\n');
		chmodSync(join(rtkBinDir, 'rtk'), 0o755);
		pathWithRtk = `${rtkBinDir}:${process.env['PATH'] ?? ''}`;
	});

	afterAll(() => {
		rmSync(rtkBinDir, { force: true, recursive: true });
	});

	it('passes through when rtk is not on PATH', async () => {
		// Strip every PATH component that contains an rtk binary — handles both the
		// test-created fake binary and any real rtk installed on this host.
		const pathWithoutRtk = (process.env['PATH'] ?? '')
			.split(':')
			.filter((p) => !existsSync(join(p, 'rtk')))
			.join(':');
		const { exitCode, stdout } = await run({ tool_input: { command: 'git status' } }, { PATH: pathWithoutRtk });
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe('');
	});

	it('passes through when tool_input.command is absent', async () => {
		const { exitCode, stdout } = await run({ tool_input: {} }, { PATH: pathWithRtk });
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe('');
	});

	it('passes through for non-whitelisted commands', async () => {
		const { exitCode, stdout } = await run({ tool_input: { command: 'echo hello' } }, { PATH: pathWithRtk });
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe('');
	});

	it('does not double-wrap a command already prefixed with rtk', async () => {
		const { exitCode, stdout } = await run({ tool_input: { command: 'rtk git status' } }, { PATH: pathWithRtk });
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe('');
	});

	it.each([
		'git',
		'cargo',
		'npm',
		'docker',
		'kubectl',
		'make',
		'python',
		'pip',
		'yarn',
		'bun',
		'pnpm',
		'npx',
		'bunx',
		'tsc',
		'eslint',
		'vitest',
		'jest',
		'pytest',
		'ruff',
		'go',
		'rake',
		'rspec',
		'rubocop',
		'bundle',
		'prisma',
		'aws',
		'golangci-lint',
		'playwright',
		'next',
		'biome'
	])('rewrites %s commands', async (tool) => {
		const { stdout } = await run({ tool_input: { command: `${tool} build` } }, { PATH: pathWithRtk });
		const output = JSON.parse(stdout) as HookOutput;
		expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
		expect(output.hookSpecificOutput.updatedInput.command).toBe(`rtk ${tool} build`);
	});

	it('passes through sudo-prefixed commands unchanged', async () => {
		// rtk's handling of sudo as a first argument is undefined — pass through rather than risk breakage.
		const { exitCode, stdout } = await run({ tool_input: { command: 'sudo git push' } }, { PATH: pathWithRtk });
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe('');
	});

	it('passes through malformed JSON without erroring', async () => {
		const { exitCode } = await run('not-valid-json' as unknown as Record<string, unknown>, { PATH: pathWithRtk });
		expect(exitCode).toBe(0);
	});
});
