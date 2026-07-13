import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

		it('does not treat a sibling directory sharing a name prefix as forbidden', () => {
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/etc-evil/file.txt', ['/etc'])).toBe(false);
		});

		it('blocks a raw, unnormalized ".." path reaching isForbidden directly (defense in depth)', () => {
			// tool-execution.service.ts always pre-resolves paths via
			// InputValidator.validatePath before calling isForbidden, but
			// isForbidden itself should not silently trust that — a future
			// caller that skips pre-resolution must still be blocked.
			const svc = new PermissionPropagationService();
			expect(svc.isForbidden('/allowed/../etc/passwd', ['/etc'])).toBe(true);
		});

		describe('symlink normalization', () => {
			let tmpDir: string;
			let realSecretsDir: string;
			let symlinkedSecretsDir: string;

			beforeEach(() => {
				tmpDir = mkdtempSync(join(tmpdir(), 'valora-permission-propagation-test-'));
				realSecretsDir = join(tmpDir, 'real-secrets');
				symlinkedSecretsDir = join(tmpDir, 'link-to-secrets');
				mkdirSync(realSecretsDir);
				symlinkSync(realSecretsDir, symlinkedSecretsDir);
			});

			afterEach(() => {
				rmSync(tmpDir, { force: true, recursive: true });
			});

			it('blocks a write to the real, symlink-resolved path when forbidden_paths names the symlink', () => {
				// Mirrors the real call-site shape: tool-execution.service.ts's
				// validateAndResolvePath() symlink-resolves the write target before
				// calling isForbidden, but an agent's forbidden_paths entry may still
				// be configured using an unresolved symlink path (e.g. a commonly
				// documented location that happens to be a symlink on this host).
				const svc = new PermissionPropagationService();
				const resolvedWriteTarget = join(realSecretsDir, 'api-key.txt');

				expect(svc.isForbidden(resolvedWriteTarget, [symlinkedSecretsDir])).toBe(true);
			});

			it('blocks a write to the real path when forbidden_paths already names the real target', () => {
				const svc = new PermissionPropagationService();
				const resolvedWriteTarget = join(realSecretsDir, 'api-key.txt');

				expect(svc.isForbidden(resolvedWriteTarget, [realSecretsDir])).toBe(true);
			});
		});

		describe('relative forbidden_paths entries', () => {
			let tmpDir: string;
			let projectDir: string;
			let otherDir: string;

			beforeEach(() => {
				tmpDir = mkdtempSync(join(tmpdir(), 'valora-permission-propagation-relative-test-'));
				projectDir = join(tmpDir, 'project');
				otherDir = join(tmpDir, 'elsewhere');
				mkdirSync(join(projectDir, 'secrets'), { recursive: true });
				mkdirSync(otherDir, { recursive: true });
			});

			afterEach(() => {
				rmSync(tmpDir, { force: true, recursive: true });
			});

			it('resolves a relative forbidden_paths entry against the given baseDir, not process.cwd()', () => {
				// Real agent personas write forbidden_paths as relative entries
				// (e.g. `.valora/`, `data/`) — see valora-plugin-secops's agent
				// definitions. ToolExecutionService's workingDir can legitimately
				// differ from process.cwd() (its own docs say so, e.g. exploration
				// contexts), so a relative entry must resolve against the caller's
				// actual working directory, not wherever the host process happens
				// to be running from.
				const svc = new PermissionPropagationService();
				const resolvedWriteTarget = join(projectDir, 'secrets', 'api-key.txt');

				expect(svc.isForbidden(resolvedWriteTarget, ['secrets'], projectDir)).toBe(true);
				// Same relative entry, resolved against an unrelated baseDir, must NOT match.
				expect(svc.isForbidden(resolvedWriteTarget, ['secrets'], otherDir)).toBe(false);
			});

			it('still resolves a relative forbidden_paths entry sensibly when no baseDir is given', () => {
				const svc = new PermissionPropagationService();
				expect(svc.isForbidden(join(process.cwd(), 'secrets', 'x.txt'), ['secrets'])).toBe(true);
			});

			it('does not change behaviour for an already-absolute forbidden_paths entry when baseDir is given', () => {
				const svc = new PermissionPropagationService();
				const resolvedWriteTarget = join(projectDir, 'secrets', 'api-key.txt');

				expect(svc.isForbidden(resolvedWriteTarget, [join(projectDir, 'secrets')], otherDir)).toBe(true);
			});
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
