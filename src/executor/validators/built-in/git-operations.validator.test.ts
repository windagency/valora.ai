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
});
