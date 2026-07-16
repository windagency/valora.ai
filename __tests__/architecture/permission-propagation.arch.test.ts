import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolExecutionService } from 'executor/tool-execution.service';

/**
 * Architecture test: permission propagation invariants.
 *
 * Ensures that the execution layer enforces the intersection rule — a child
 * context can never gain scope that its parent forbids. Most checks here are
 * static source reads (fast, no runtime side-effects) — but a source-text
 * match alone can't prove the guard actually blocks anything at runtime (a
 * refactor that inverts the condition, or moves the call into unreachable
 * code, would keep the literal string present while the real protection is
 * broken) — so the "actually blocks a write" test below drives a real
 * ToolExecutionService end-to-end instead.
 */

const SRC = resolve(import.meta.dirname, '../../src');

function read(rel: string): string {
	return readFileSync(resolve(SRC, rel), 'utf-8');
}

describe('Permission propagation architecture', () => {
	it('command-isolation.executor uses PermissionPropagationService when creating child contexts', () => {
		const src = read('executor/command-isolation.executor.ts');
		expect(src).toContain('getPermissionPropagationService');
		expect(src).toContain('.derive(');
	});

	it('stage-executor propagates effectiveConstraints to ToolExecutionService before every stage', () => {
		const src = read('executor/stage-executor.ts');
		expect(src).toContain('setEffectiveConstraints(executionContext.effectiveConstraints)');
	});

	it('ToolExecutionService enforces forbidden_paths before write', () => {
		const src = read('executor/tool-execution.service.ts');
		// isForbidden's third argument (this.workingDir) is required so a relative
		// forbidden_paths entry resolves against the caller's actual working
		// directory rather than process.cwd() — see PermissionPropagationService.
		expect(src).toContain('isForbidden(fullPath, this.effectiveConstraints.forbidden_paths, this.workingDir)');
	});

	it('ToolExecutionService enforces forbidden_paths before delete', () => {
		const src = read('executor/tool-execution.service.ts');
		// There are multiple isForbidden calls — in executeWrite, executeDeleteFile, and search_replace
		const matches = src.match(
			/isForbidden\(fullPath,\s*this\.effectiveConstraints\.forbidden_paths,\s*this\.workingDir\)/g
		);
		expect(matches).not.toBeNull();
		expect(matches!.length).toBeGreaterThanOrEqual(2);
	});

	it('ToolExecutionService enforces requires_approval_for before write', () => {
		const src = read('executor/tool-execution.service.ts');
		expect(src).toContain('requiresApproval(');
		expect(src).toContain('this.effectiveConstraints.requires_approval_for');
	});

	it('ExecutionContext exposes effectiveConstraints as a public readonly field', () => {
		const src = read('executor/execution-context.ts');
		expect(src).toContain('public readonly effectiveConstraints: EffectivePermissions');
	});

	it('ExecutionCoordinator loads the resolved agent and wires its constraints into the root ExecutionContext', () => {
		// Downstream enforcement (isForbidden/requiresApproval, asserted above) is only
		// meaningful if the root context is ever populated with real persona constraints.
		// Without this, effectiveConstraints silently defaults to empty for every command —
		// exactly the gap that let SECURITY.md/system-card.md claim enforcement that wasn't
		// actually wired.
		const src = read('cli/execution-coordinator.ts');
		expect(src).toContain('this.agentLoader.loadAgent(');
		expect(src).toContain('agentConstraints: agent.constraints');
	});

	describe('runtime enforcement (not just source-text presence)', () => {
		let workingDir: string;
		let svc: ToolExecutionService;

		beforeEach(() => {
			workingDir = mkdtempSync(join(tmpdir(), 'valora-permission-arch-'));
			svc = new ToolExecutionService(workingDir);
			svc.disableIdempotency();
		});

		afterEach(() => {
			rmSync(workingDir, { force: true, recursive: true });
		});

		it('actually refuses a write to a path under an effective forbidden_paths entry', async () => {
			svc.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [join(workingDir, 'secrets')],
				requires_approval_for: []
			});

			const result = await svc.executeTool({
				arguments: { content: 'leaked', path: 'secrets/api-key.txt' },
				id: 'perm-arch-write-1',
				name: 'write'
			});

			expect(result.output).toMatch(/forbidden/i);
		});

		it('actually refuses a delete_file to a path under an effective forbidden_paths entry, and leaves the file intact', async () => {
			const target = join(workingDir, 'secrets', 'api-key.txt');
			mkdirSync(join(workingDir, 'secrets'), { recursive: true });
			writeFileSync(target, 'top-secret', 'utf8');

			svc.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [join(workingDir, 'secrets')],
				requires_approval_for: []
			});

			const result = await svc.executeTool({
				arguments: { path: 'secrets/api-key.txt' },
				id: 'perm-arch-delete-1',
				name: 'delete_file'
			});

			expect(result.output).toMatch(/forbidden/i);
			expect(readFileSync(target, 'utf8')).toBe('top-secret');
		});

		it('still allows a write outside any forbidden_paths entry', async () => {
			svc.setEffectiveConstraints({
				delegationDepth: 1,
				forbidden_paths: [join(workingDir, 'secrets')],
				requires_approval_for: []
			});

			const result = await svc.executeTool({
				arguments: { content: 'fine', path: 'normal.txt' },
				id: 'perm-arch-write-2',
				name: 'write'
			});

			expect(result.output).not.toMatch(/forbidden/i);
			expect(readFileSync(join(workingDir, 'normal.txt'), 'utf8')).toBe('fine');
		});
	});
});
