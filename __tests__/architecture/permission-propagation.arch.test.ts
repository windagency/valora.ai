import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Architecture test: permission propagation invariants.
 *
 * Ensures that the execution layer enforces the intersection rule — a child
 * context can never gain scope that its parent forbids.  These checks are
 * static source reads so they remain fast and free of runtime side-effects.
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
		expect(src).toContain('isForbidden(fullPath, this.effectiveConstraints.forbidden_paths)');
	});

	it('ToolExecutionService enforces forbidden_paths before delete', () => {
		const src = read('executor/tool-execution.service.ts');
		// There are two isForbidden calls — one in executeWrite and one in executeDeleteFile
		const matches = src.match(/isForbidden\(fullPath,\s*this\.effectiveConstraints\.forbidden_paths\)/g);
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
});
