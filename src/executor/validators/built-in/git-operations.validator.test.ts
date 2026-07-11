import { describe, it, expect } from 'vitest';

import { gitOperationsValidator } from './git-operations.validator';

const CTX = { stageName: 'coder.apply-git-operations' };

describe('gitOperationsValidator', () => {
	it('passes when no operations are planned', () => {
		expect(gitOperationsValidator.validate({}, CTX).passed).toBe(true);
	});

	it('passes when operations array is empty', () => {
		expect(gitOperationsValidator.validate({ operations: [] }, CTX).passed).toBe(true);
	});

	it('passes for safe git operations', () => {
		const output = { operations: ['git add .', 'git commit -m "fix"', 'git push origin feature-branch'] };
		expect(gitOperationsValidator.validate(output, CTX).passed).toBe(true);
	});

	it('fails and stops pipeline when force push to main is planned', () => {
		const output = { operations: ['git push --force origin main'] };
		const result = gitOperationsValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
		expect(result.violations[0]).toContain('git push --force origin main');
	});

	it('fails when force push to master is planned', () => {
		const output = { operations: ['git push -f origin master'] };
		const result = gitOperationsValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
	});

	it('fails when git reset --hard is planned', () => {
		const output = { operations: ['git reset --hard HEAD~5'] };
		expect(gitOperationsValidator.validate(output, CTX).passed).toBe(false);
	});

	it('fails when branch deletion of main is planned', () => {
		const output = { operations: ['git branch -D main'] };
		expect(gitOperationsValidator.validate(output, CTX).passed).toBe(false);
	});

	it('accumulates one violation per dangerous operation', () => {
		const output = {
			operations: ['git push --force origin main', 'git reset --hard HEAD~1']
		};
		const result = gitOperationsValidator.validate(output, CTX);
		expect(result.violations).toHaveLength(2);
	});

	it('also inspects a commands array field as an alternative to operations', () => {
		const output = { commands: ['git push --force origin main'] };
		expect(gitOperationsValidator.validate(output, CTX).passed).toBe(false);
	});

	describe('ground-truth cross-check against real tool-call history', () => {
		it('fails when the LLM omits a dangerous operation from its self-reported operations array but actually executed it via a real run_terminal_cmd tool call', () => {
			// The self-report claims nothing dangerous happened — a compromised
			// or hallucinating stage can force `passed: true` at will by simply
			// not mentioning the operation it ran. Ground truth (the real
			// executed tool call) must be checked independently of what the
			// stage claims about itself.
			const output = { operations: ['git add .', 'git commit -m "fix"'] };
			const context = {
				...CTX,
				executedToolCalls: [{ arguments: { command: 'git push --force origin main' }, name: 'run_terminal_cmd' }]
			};
			const result = gitOperationsValidator.validate(output, context);
			expect(result.passed).toBe(false);
			expect(result.shouldStopPipeline).toBe(true);
		});

		it('still passes when both the self-report and the real executed commands are safe', () => {
			const output = { operations: ['git add .'] };
			const context = {
				...CTX,
				executedToolCalls: [{ arguments: { command: 'git commit -m "fix"' }, name: 'run_terminal_cmd' }]
			};
			expect(gitOperationsValidator.validate(output, context).passed).toBe(true);
		});

		it('ignores non-git-shaped real tool calls (no false positive from ordinary terminal commands)', () => {
			const context = {
				...CTX,
				executedToolCalls: [{ arguments: { command: 'ls -la' }, name: 'run_terminal_cmd' }]
			};
			expect(gitOperationsValidator.validate({}, context).passed).toBe(true);
		});

		it('ignores tool calls that are not run_terminal_cmd (e.g. read_file) even if their arguments happen to contain dangerous-looking text', () => {
			const context = {
				...CTX,
				executedToolCalls: [{ arguments: { path: 'notes about git reset --hard' }, name: 'read_file' }]
			};
			expect(gitOperationsValidator.validate({}, context).passed).toBe(true);
		});
	});
});
