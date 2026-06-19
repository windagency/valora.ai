import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('fs', () => ({
	mkdtempSync: vi.fn().mockReturnValue('/tmp/valora-test-xyz'),
	readdirSync: vi.fn().mockReturnValue(['windagency-valora-runtime-1.0.0.tgz']),
	readFileSync: vi.fn().mockReturnValue(Buffer.from('tarball-bytes')),
	rmSync: vi.fn()
}));

const { computeIntegrity } = await import('./compute-registry-integrity.ts');

const FAKE_BYTES = Buffer.from('tarball-bytes');
const EXPECTED_HASH = `sha256-${createHash('sha256').update(FAKE_BYTES).digest('base64')}`;
const PACKAGE_DIR = '/fake/pkg';
const PACKAGE_NAME = '@windagency/valora-runtime';
const REGISTRY_URL = 'http://localhost:4873';

describe('computeIntegrity', () => {
	beforeEach(() => {
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
		vi.mocked(mkdtempSync).mockReturnValue('/tmp/valora-test-xyz');
		vi.mocked(readdirSync).mockReturnValue(['windagency-valora-runtime-1.0.0.tgz'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockReturnValue(FAKE_BYTES);
		vi.mocked(rmSync).mockReturnValue(undefined);
	});

	describe('without a registry URL (local pnpm pack)', () => {
		it('invokes pnpm pack in the package directory', () => {
			computeIntegrity(PACKAGE_DIR, PACKAGE_NAME);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'pnpm',
				expect.arrayContaining(['pack']),
				expect.objectContaining({ cwd: PACKAGE_DIR })
			);
		});

		it('does not invoke npm pack', () => {
			computeIntegrity(PACKAGE_DIR, PACKAGE_NAME);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
		});

		it('returns the SHA256 SRI of the tarball bytes', () => {
			expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME)).toBe(EXPECTED_HASH);
		});
	});

	describe('with a registry URL (npm pack from published registry)', () => {
		it('invokes npm pack with the package name and registry flag', () => {
			computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, REGISTRY_URL);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'npm',
				expect.arrayContaining(['pack', PACKAGE_NAME, '--registry', REGISTRY_URL]),
				expect.anything()
			);
		});

		it('does not invoke pnpm pack', () => {
			computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, REGISTRY_URL);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('pnpm', expect.anything(), expect.anything());
		});

		it('returns the SHA256 SRI of the downloaded tarball bytes', () => {
			expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, REGISTRY_URL)).toBe(EXPECTED_HASH);
		});
	});

	it('cleans up the temporary directory even when pack fails', () => {
		vi.mocked(spawnSync).mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error' } as ReturnType<
			typeof spawnSync
		>);
		expect(() => computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, REGISTRY_URL)).toThrow();
		expect(vi.mocked(rmSync)).toHaveBeenCalledWith('/tmp/valora-test-xyz', { force: true, recursive: true });
	});
});
