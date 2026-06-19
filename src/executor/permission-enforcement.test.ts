import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EffectivePermissions } from 'security/permission-propagation.service';

import { ToolExecutionService } from './tool-execution.service';

const noConstraints: EffectivePermissions = {
	delegationDepth: 0,
	forbidden_paths: [],
	requires_approval_for: []
};

describe('ToolExecutionService — permission enforcement', () => {
	let tmpDir: string;
	let service: ToolExecutionService;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-permission-test-'));
		service = new ToolExecutionService(tmpDir);
		service.setEffectiveConstraints(noConstraints);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('forbidden_paths enforcement on write', () => {
		it('allows write when no forbidden paths are set', async () => {
			const result = await service.executeTools([
				{ arguments: { content: 'hello', path: 'allowed.txt' }, id: 't1', name: 'write' }
			]);
			expect(result[0]!.output).toContain('Successfully wrote');
		});

		it('blocks write to a forbidden path', async () => {
			const forbiddenDir = join(tmpDir, 'secrets');
			mkdirSync(forbiddenDir);

			service.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [forbiddenDir],
				requires_approval_for: []
			});

			const result = await service.executeTools([
				{
					arguments: { content: 'payload', path: join(forbiddenDir, 'file.txt') },
					id: 't2',
					name: 'write'
				}
			]);
			expect(result[0]!.output).toMatch(/forbidden/i);
		});

		it('blocks write to a sub-path of a forbidden directory', async () => {
			const forbiddenDir = join(tmpDir, 'protected');
			mkdirSync(join(tmpDir, 'protected', 'nested'), { recursive: true });

			service.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [forbiddenDir],
				requires_approval_for: []
			});

			const result = await service.executeTools([
				{
					arguments: { content: 'payload', path: join(forbiddenDir, 'nested', 'file.txt') },
					id: 't3',
					name: 'write'
				}
			]);
			expect(result[0]!.output).toMatch(/forbidden/i);
		});
	});

	describe('forbidden_paths enforcement on delete', () => {
		it('allows delete when no forbidden paths are set', async () => {
			const filePath = join(tmpDir, 'deleteme.txt');
			writeFileSync(filePath, 'content');

			const result = await service.executeTools([{ arguments: { path: filePath }, id: 't4', name: 'delete_file' }]);
			expect(result[0]!.output).toContain('Successfully deleted');
		});

		it('blocks delete of a file inside a forbidden path', async () => {
			const forbiddenDir = join(tmpDir, 'readonly');
			mkdirSync(forbiddenDir);
			const filePath = join(forbiddenDir, 'important.txt');
			writeFileSync(filePath, 'critical');

			service.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [forbiddenDir],
				requires_approval_for: []
			});

			const result = await service.executeTools([{ arguments: { path: filePath }, id: 't5', name: 'delete_file' }]);
			expect(result[0]!.output).toMatch(/forbidden/i);
		});
	});

	describe('requires_approval_for on write', () => {
		it('queues write for approval when path matches requires_approval_for pattern', async () => {
			service.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [],
				requires_approval_for: ['*.env*']
			});

			const result = await service.executeTools([
				{
					arguments: { content: 'SECRET=value', path: join(tmpDir, '.env.production') },
					id: 't6',
					name: 'write'
				}
			]);
			expect(result[0]!.output).toMatch(/queued|approval|confirm/i);
			expect(service.hasPendingWrites()).toBe(true);
		});

		it('does not queue write when path does not match requires_approval_for', async () => {
			service.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [],
				requires_approval_for: ['*.env*']
			});

			const result = await service.executeTools([
				{
					arguments: { content: 'hello', path: join(tmpDir, 'safe.ts') },
					id: 't7',
					name: 'write'
				}
			]);
			expect(result[0]!.output).toContain('Successfully wrote');
			expect(service.hasPendingWrites()).toBe(false);
		});
	});
});
