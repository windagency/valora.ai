import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCredentialGuard } from 'security/credential-guard';

vi.mock('child_process', async () => {
	const actual = await vi.importActual<typeof import('child_process')>('child_process');
	return {
		...actual,
		exec: vi.fn()
	};
});

import { exec } from 'child_process';

import { ToolExecutionService } from './tool-execution.service';

interface ExecError extends Error {
	code: number;
	stderr: string;
	stdout: string;
}

describe('ToolExecutionService — terminal command credential redaction', () => {
	beforeEach(() => {
		resetCredentialGuard();
		(exec as unknown as ReturnType<typeof vi.fn>).mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not surface credentials from a failing command's stderr to the LLM", async () => {
		const credential = 'postgres://admin:s3cretP4ssw0rd@db.internal:5432/app';
		const stderrLeak = `fatal: failed to connect: ${credential}`;

		(exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			(
				_command: string,
				_options: unknown,
				callback: (err: ExecError | null, stdio: { stderr: string; stdout: string }) => void
			) => {
				const err = Object.assign(new Error('Command failed'), {
					code: 1,
					stderr: stderrLeak,
					stdout: ''
				}) as ExecError;
				callback(err, { stderr: stderrLeak, stdout: '' });
			}
		);

		const svc = new ToolExecutionService(process.cwd());

		const result = await svc.executeTool({
			arguments: { command: `git ls-remote unused-stderr-${Date.now()}` },
			id: 'test-call-1',
			name: 'run_terminal_cmd'
		});

		expect(result.output).not.toContain('s3cretP4ssw0rd');
		expect(result.output).toContain('[REDACTED]');
	});

	it('still does not leak a credential present in the error message field itself', async () => {
		const credential = 'postgres://admin:supersecretvalue@db.internal/app';

		(exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			(
				_command: string,
				_options: unknown,
				callback: (err: ExecError | null, stdio: { stderr: string; stdout: string }) => void
			) => {
				const err = Object.assign(new Error(`Command failed: connection ${credential}`), {
					code: 1,
					stderr: '',
					stdout: ''
				}) as ExecError;
				callback(err, { stderr: '', stdout: '' });
			}
		);

		const svc = new ToolExecutionService(process.cwd());

		const result = await svc.executeTool({
			arguments: { command: `git ls-remote unused-message-${Date.now()}` },
			id: 'test-call-2',
			name: 'run_terminal_cmd'
		});

		expect(result.output).not.toContain('supersecretvalue');
	});
});
