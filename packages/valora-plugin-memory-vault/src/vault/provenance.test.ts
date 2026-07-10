import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSigningKeyPathForTests, setSigningKeyPathForTests, signProvenance, verifyProvenance } from './provenance';

describe('provenance signing', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'valora-vault-signing-'));
		setSigningKeyPathForTests(join(dir, 'vault-signing.key'));
	});

	afterEach(() => {
		resetSigningKeyPathForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it('produces a signature that verifies against the same inputs', () => {
		const signature = signProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z');
		expect(verifyProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z', signature)).toBe(true);
	});

	it('fails verification when the content has been altered', () => {
		const signature = signProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z');
		expect(verifyProvenance('tampered content', 'product-manager', '2026-07-09T00:00:00.000Z', signature)).toBe(false);
	});

	it('fails verification when the agentRole has been altered', () => {
		const signature = signProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z');
		expect(verifyProvenance('some content', 'secops-engineer', '2026-07-09T00:00:00.000Z', signature)).toBe(false);
	});

	it('fails verification when the signature is missing', () => {
		expect(verifyProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z', undefined)).toBe(false);
	});

	it('fails verification for a forged signature with no valid key', () => {
		expect(verifyProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z', 'deadbeef')).toBe(false);
	});

	it('persists the signing key across calls so re-signing the same inputs is stable', () => {
		const first = signProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z');
		const second = signProvenance('some content', 'product-manager', '2026-07-09T00:00:00.000Z');
		expect(first).toBe(second);
	});

	it('does not verify a re-partitioned (content, agentRole) pair that reconstructs the same signed text', () => {
		// content/agentRole/createdAt are stored as independent frontmatter
		// fields with no length-prefixing or escaping when signed — joining them
		// with any single fixed delimiter character (a space, a NUL byte, or
		// otherwise) means an attacker who can get that delimiter's own
		// character embedded inside `content` (filesystem write access is
		// enough — no signing key needed) can shift the content/agentRole
		// boundary and produce a signature collision: `"a\0b"` split as
		// (content="a", role="b") signs identically to (content="a\0b", role="")
		// under a plain `${content}\0${role}` join.
		const signature = signProvenance('bug in payment\0module', 'engineer', '2026-07-09T10:00:00.000Z');
		const forged = verifyProvenance('bug in payment', 'module\0engineer', '2026-07-09T10:00:00.000Z', signature);
		expect(forged).toBe(false);
	});
});

describe('signing key store location (default path resolution)', () => {
	// A malicious repo needs its own .valora/ directory to plant a forged
	// vault entry in the first place — if the signing key's default location
	// preferred a project-local path the way getRuntimeDataDir() does for the
	// vault content itself, the repo could ship its own hand-written
	// vault-signing.key alongside the forged entry and sign it with a key it
	// generated itself, so the forgery verifies as trusted with zero victim
	// interaction. The key must resolve to a fixed global location regardless
	// of what project-local path resolution would return — the same property
	// workspace-trust.service.ts's trust store was just fixed to have.
	let fakeGlobalDir: string;
	let fakeProjectDir: string;

	beforeEach(() => {
		fakeGlobalDir = mkdtempSync(join(tmpdir(), 'valora-fake-global-'));
		fakeProjectDir = mkdtempSync(join(tmpdir(), 'valora-fake-project-'));
	});

	afterEach(() => {
		rmSync(fakeGlobalDir, { recursive: true, force: true });
		rmSync(fakeProjectDir, { recursive: true, force: true });
		vi.doUnmock('@windagency/valora-runtime');
		vi.resetModules();
	});

	it("does not resolve the signing key under getProjectConfigDir()'s path, even when one exists", async () => {
		vi.doMock('@windagency/valora-runtime', () => ({
			getGlobalConfigDir: () => fakeGlobalDir,
			getProjectConfigDir: () => fakeProjectDir,
			getRuntimeDataDir: () => fakeProjectDir
		}));
		vi.resetModules();
		const { signProvenance: signFresh, verifyProvenance: verifyFresh } = await import('./provenance');

		const signature = signFresh('some content', 'product-manager', '2026-07-09T00:00:00.000Z');

		expect(verifyFresh('some content', 'product-manager', '2026-07-09T00:00:00.000Z', signature)).toBe(true);
		expect(existsSync(join(fakeProjectDir, 'vault-signing.key'))).toBe(false);
		expect(existsSync(join(fakeGlobalDir, 'vault-signing.key'))).toBe(true);
	});
});
