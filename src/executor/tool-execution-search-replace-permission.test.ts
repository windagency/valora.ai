import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolExecutionService } from './tool-execution.service';

describe('ToolExecutionService.search_replace permission propagation', () => {
	let workingDir: string;
	let svc: ToolExecutionService;

	beforeEach(() => {
		workingDir = mkdtempSync(join(tmpdir(), 'valora-sr-perm-'));
		svc = new ToolExecutionService(workingDir);
		svc.disableIdempotency();
	});

	afterEach(() => {
		rmSync(workingDir, { recursive: true, force: true });
	});

	it('refuses search_replace on a path matching effective forbidden_paths and leaves the file unmodified', async () => {
		const secretsDir = join(workingDir, 'secrets');
		mkdirSync(secretsDir);
		const target = join(secretsDir, 'forbidden.txt');
		const original = 'top-secret-value';
		writeFileSync(target, original, 'utf8');

		svc.setEffectiveConstraints({
			delegationDepth: 1,
			forbidden_paths: [join(workingDir, 'secrets')],
			requires_approval_for: [],
		});

		const result = await svc.executeTool({
			arguments: { new_str: 'rewritten', old_str: 'top-secret-value', path: 'secrets/forbidden.txt' },
			id: 'search-replace-perm-1',
			name: 'search_replace',
		});

		expect(result.output).toMatch(/forbidden/i);
		expect(readFileSync(target, 'utf8')).toBe(original);
	});

	it('allows search_replace on a path outside effective forbidden_paths', async () => {
		const target = join(workingDir, 'normal.txt');
		writeFileSync(target, 'before', 'utf8');

		svc.setEffectiveConstraints({
			delegationDepth: 1,
			forbidden_paths: [join(workingDir, 'secrets')],
			requires_approval_for: [],
		});

		const result = await svc.executeTool({
			arguments: { new_str: 'after', old_str: 'before', path: 'normal.txt' },
			id: 'search-replace-perm-2',
			name: 'search_replace',
		});

		expect(result.output).toMatch(/Successfully replaced/);
		expect(readFileSync(target, 'utf8')).toBe('after');
	});
});
