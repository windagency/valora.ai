import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const VERSION = '1.0.0';
const REGISTRY_URL = 'http://localhost:4873';

function packumentResponse(init: { status?: number } = {}): Response {
	const status = init.status ?? 200;
	return new Response('{}', { status, statusText: status === 200 ? 'OK' : 'Not Found' });
}

describe('computeIntegrity', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
		vi.mocked(mkdtempSync).mockReturnValue('/tmp/valora-test-xyz');
		vi.mocked(readdirSync).mockReturnValue(['windagency-valora-runtime-1.0.0.tgz'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockReturnValue(FAKE_BYTES);
		vi.mocked(rmSync).mockReturnValue(undefined);
		// Default: package not found on the public registry, so the
		// not-yet-published fallback path is exercised unless a test overrides this.
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(packumentResponse({ status: 404 }));
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	describe('without a registry URL, package not yet published (local pnpm pack)', () => {
		it('invokes pnpm pack in the package directory', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'pnpm',
				expect.arrayContaining(['pack']),
				expect.objectContaining({ cwd: PACKAGE_DIR })
			);
		});

		it('does not invoke npm pack', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
		});

		it('returns the SHA256 SRI of the tarball bytes', async () => {
			expect(await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION)).toBe(EXPECTED_HASH);
		});
	});

	describe('without a registry URL, package already published', () => {
		beforeEach(() => {
			fetchSpy.mockResolvedValue(packumentResponse({ status: 200 }));
		});

		it('refuses to fall back to a local pnpm pack', async () => {
			await expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION)).rejects.toThrow(
				/already published.*VALORA_NPM_REGISTRY_URL/is
			);
		});

		it('never invokes pnpm pack', async () => {
			await expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION)).rejects.toThrow();
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();
		});
	});

	describe('with a registry URL (npm pack from published registry)', () => {
		it('skips the already-published check entirely', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, REGISTRY_URL);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('invokes npm pack with the package name and registry flag', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, REGISTRY_URL);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'npm',
				expect.arrayContaining(['pack', PACKAGE_NAME, '--registry', REGISTRY_URL]),
				expect.anything()
			);
		});

		it('does not invoke pnpm pack', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, REGISTRY_URL);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('pnpm', expect.anything(), expect.anything());
		});

		it('returns the SHA256 SRI of the downloaded tarball bytes', async () => {
			expect(await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, REGISTRY_URL)).toBe(EXPECTED_HASH);
		});
	});

	it('cleans up the temporary directory even when pack fails', async () => {
		vi.mocked(spawnSync).mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error' } as ReturnType<
			typeof spawnSync
		>);
		await expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, REGISTRY_URL)).rejects.toThrow();
		expect(vi.mocked(rmSync)).toHaveBeenCalledWith('/tmp/valora-test-xyz', { force: true, recursive: true });
	});
});
