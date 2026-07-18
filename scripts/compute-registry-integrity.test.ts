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
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const PRIVATE_REGISTRY_URL = 'http://localhost:4873';

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
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	describe('no registryUrl given, package already published on the public registry', () => {
		beforeEach(() => {
			fetchSpy.mockResolvedValue(packumentResponse({ status: 200 }));
		});

		it('downloads via npm pack from the public registry automatically — no error, no manual override needed', async () => {
			await expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION)).resolves.toBe(EXPECTED_HASH);
		});

		it('packs the exact published version, not whatever "latest" happens to point to', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'npm',
				expect.arrayContaining(['pack', `${PACKAGE_NAME}@${VERSION}`, '--registry', DEFAULT_REGISTRY]),
				expect.anything()
			);
		});

		it('does not invoke pnpm pack', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('pnpm', expect.anything(), expect.anything());
		});
	});

	describe('no registryUrl given, package not yet published anywhere (local pnpm pack)', () => {
		beforeEach(() => {
			fetchSpy.mockResolvedValue(packumentResponse({ status: 404 }));
		});

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

	describe('explicit registryUrl given (e.g. a private Verdaccio)', () => {
		it('trusts the override and packs from it without checking the public registry first', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, PRIVATE_REGISTRY_URL);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('invokes npm pack with the exact version and the given registry', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, PRIVATE_REGISTRY_URL);
			expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
				'npm',
				expect.arrayContaining(['pack', `${PACKAGE_NAME}@${VERSION}`, '--registry', PRIVATE_REGISTRY_URL]),
				expect.anything()
			);
		});

		it('does not invoke pnpm pack', async () => {
			await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, PRIVATE_REGISTRY_URL);
			expect(vi.mocked(spawnSync)).not.toHaveBeenCalledWith('pnpm', expect.anything(), expect.anything());
		});

		it('returns the SHA256 SRI of the downloaded tarball bytes', async () => {
			expect(await computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, PRIVATE_REGISTRY_URL)).toBe(EXPECTED_HASH);
		});
	});

	it('cleans up the temporary directory even when pack fails', async () => {
		vi.mocked(spawnSync).mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error' } as ReturnType<
			typeof spawnSync
		>);
		await expect(computeIntegrity(PACKAGE_DIR, PACKAGE_NAME, VERSION, PRIVATE_REGISTRY_URL)).rejects.toThrow();
		expect(vi.mocked(rmSync)).toHaveBeenCalledWith('/tmp/valora-test-xyz', { force: true, recursive: true });
	});
});
