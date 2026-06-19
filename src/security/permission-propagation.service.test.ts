import { describe, expect, it } from 'vitest';

import type { AgentConstraints } from 'types/agent.types';
import { PermissionPropagationService } from './permission-propagation.service';

const noConstraints: AgentConstraints = {};

const parentStrict: AgentConstraints = {
	forbidden_paths: ['/etc', '/sys'],
	requires_approval_for: ['*.env', 'package.json']
};

const childLoose: AgentConstraints = {
	forbidden_paths: ['/tmp'],
	requires_approval_for: ['config.yml']
};

describe('PermissionPropagationService', () => {
	describe('derive — forbidden_paths', () => {
		it('returns empty forbidden_paths when both parent and child have none', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(noConstraints, noConstraints);
			expect(result.forbidden_paths).toEqual([]);
		});

		it('returns parent forbidden_paths when child has none', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(parentStrict, noConstraints);
			expect(result.forbidden_paths).toEqual(expect.arrayContaining(['/etc', '/sys']));
		});

		it('returns child forbidden_paths when parent has none', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(noConstraints, childLoose);
			expect(result.forbidden_paths).toContain('/tmp');
		});

		it('unions forbidden_paths — intersection rule means BOTH parents restrictions apply', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(parentStrict, childLoose);
			// Child can never gain permission parent forbids — union of forbidden = intersection of allowed
			expect(result.forbidden_paths).toEqual(expect.arrayContaining(['/etc', '/sys', '/tmp']));
		});

		it('deduplicates overlapping forbidden_paths', () => {
			const parent: AgentConstraints = { forbidden_paths: ['/etc', '/shared'] };
			const child: AgentConstraints = { forbidden_paths: ['/etc', '/tmp'] };
			const svc = new PermissionPropagationService();
			const result = svc.derive(parent, child);
			const etcCount = result.forbidden_paths.filter((p) => p === '/etc').length;
			expect(etcCount).toBe(1);
		});
	});

	describe('derive — requires_approval_for', () => {
		it('unions requires_approval_for from parent and child', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(parentStrict, childLoose);
			expect(result.requires_approval_for).toEqual(expect.arrayContaining(['*.env', 'package.json', 'config.yml']));
		});

		it('returns parent requires_approval_for when child has none', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(parentStrict, noConstraints);
			expect(result.requires_approval_for).toEqual(expect.arrayContaining(['*.env', 'package.json']));
		});
	});

	describe('derive — delegation depth', () => {
		it('increments delegation depth', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(noConstraints, noConstraints, 1);
			expect(result.delegationDepth).toBe(2);
		});

		it('defaults to depth 1 when no parent depth given', () => {
			const svc = new PermissionPropagationService();
			const result = svc.derive(noConstraints, noConstraints);
			expect(result.delegationDepth).toBe(1);
		});
	});

	describe('isForbidden', () => {
		it('returns false when no forbidden_paths', () => {
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/etc/passwd', [])).toBe(false);
		});

		it('returns true for exact prefix match', () => {
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/etc/passwd', ['/etc'])).toBe(true);
		});

		it('returns false for non-matching path', () => {
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/home/user/file.txt', ['/etc', '/sys'])).toBe(false);
		});

		it('returns true for exact match', () => {
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/etc', ['/etc'])).toBe(true);
		});
	});

	describe('requiresApproval', () => {
		it('returns false when no patterns', () => {
			const svc = new PermissionPropagationService();
			expect(svc.requiresApproval('package.json', [])).toBe(false);
		});

		it('returns true for glob wildcard match', () => {
			const svc = new PermissionPropagationService();
			expect(svc.requiresApproval('.env.production', ['*.env*'])).toBe(true);
		});

		it('returns true for exact file name match', () => {
			const svc = new PermissionPropagationService();
			expect(svc.requiresApproval('package.json', ['package.json'])).toBe(true);
		});

		it('returns false for non-matching path', () => {
			const svc = new PermissionPropagationService();
			expect(svc.requiresApproval('src/index.ts', ['package.json', '*.env'])).toBe(false);
		});
	});
});
