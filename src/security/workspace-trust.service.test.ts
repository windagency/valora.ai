import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isWorkspaceTrusted, revokeWorkspaceTrust, trustWorkspace } from './workspace-trust.service';

describe('workspace trust', () => {
	let dir: string;
	let storePath: string;
	let projectDir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'valora-workspace-trust-'));
		storePath = join(dir, 'trusted-workspaces.json');
		projectDir = join(dir, 'my-project');
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('reports a project directory as untrusted before it has ever been trusted', () => {
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(false);
	});

	it('reports a project directory as trusted after trustWorkspace() is called', () => {
		trustWorkspace(projectDir, storePath);
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(true);
	});

	it('persists trust across separate calls against the same store path', () => {
		trustWorkspace(projectDir, storePath);
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(true);
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(true);
	});

	it('does not trust an unrelated directory just because a sibling was trusted', () => {
		trustWorkspace(projectDir, storePath);
		expect(isWorkspaceTrusted(join(dir, 'other-project'), storePath)).toBe(false);
	});

	it('revokes trust previously granted', () => {
		trustWorkspace(projectDir, storePath);
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(true);

		revokeWorkspaceTrust(projectDir, storePath);
		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(false);
	});

	it('resolves relative and absolute forms of the same directory to the same trust entry', () => {
		trustWorkspace(projectDir, storePath);
		const originalCwd = process.cwd();
		try {
			process.chdir(dir);
			expect(isWorkspaceTrusted('my-project', storePath)).toBe(true);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it('resolves a symlinked project directory to the same trust entry as its real path', () => {
		// Lexical resolve() alone can't see through a symlink — trusting the
		// symlink path and checking the real path (or vice versa) must be the
		// same trust decision, matching command-guard.ts's own symlink-aware
		// path handling elsewhere in this session.
		mkdirSync(projectDir);
		const symlinkedPath = join(dir, 'project-link');
		symlinkSync(projectDir, symlinkedPath);

		trustWorkspace(symlinkedPath, storePath);

		expect(isWorkspaceTrusted(projectDir, storePath)).toBe(true);
		expect(isWorkspaceTrusted(symlinkedPath, storePath)).toBe(true);
	});
});

describe('workspace trust store location (default path resolution)', () => {
	// A malicious project needs its own .valora/ directory to declare hooks in
	// the first place — if the trust store's default location preferred a
	// project-local path the way getRuntimeDataDir() does for caching/logging,
	// the project could ship a hand-written trust file that self-grants trust,
	// with zero victim interaction. The store must resolve to a fixed global
	// location regardless of what project-local path resolution would return.
	let fakeGlobalDir: string;
	let fakeProjectDir: string;

	beforeEach(() => {
		fakeGlobalDir = mkdtempSync(join(tmpdir(), 'valora-fake-global-'));
		fakeProjectDir = mkdtempSync(join(tmpdir(), 'valora-fake-project-'));
	});

	afterEach(() => {
		rmSync(fakeGlobalDir, { recursive: true, force: true });
		rmSync(fakeProjectDir, { recursive: true, force: true });
		vi.doUnmock('utils/paths');
		vi.resetModules();
	});

	it("does not resolve the trust store under getProjectConfigDir()'s path, even when one exists", async () => {
		vi.doMock('utils/paths', () => ({
			getGlobalConfigDir: () => fakeGlobalDir,
			getProjectConfigDir: () => fakeProjectDir,
			getRuntimeDataDir: () => fakeProjectDir
		}));
		vi.resetModules();
		const { isWorkspaceTrusted: isTrustedFresh, trustWorkspace: trustFresh } =
			await import('./workspace-trust.service');

		trustFresh('/some/project');

		expect(isTrustedFresh('/some/project')).toBe(true);
		expect(existsSync(join(fakeProjectDir, 'trusted-workspaces.json'))).toBe(false);
		expect(existsSync(join(fakeGlobalDir, 'trusted-workspaces.json'))).toBe(true);
	});
});
