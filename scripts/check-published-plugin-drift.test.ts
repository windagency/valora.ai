import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdtempSync: vi.fn().mockReturnValue('/tmp/valora-drift-check-xyz'),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
	rmSync: vi.fn(),
	writeFileSync: vi.fn()
}));

const { discoverPluginPackages, fetchPublishedManifest, findPublishedManifestDrift } =
	await import('./check-published-plugin-drift.ts');

const PACKAGES_DIR = '/fake/packages';
const PACKAGE_NAME = '@windagency/valora-plugin-memory-vault';
const VERSION = '1.0.1';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
	const status = init.status ?? 200;
	return new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Not Found' });
}

function localManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { contributes: ['code'], name: 'valora-plugin-memory-vault', version: VERSION, ...overrides };
}

describe('discoverPluginPackages', () => {
	beforeEach(() => {
		vi.mocked(existsSync).mockReturnValue(true);
	});

	it('returns an entry per discoverable valora-plugin-* directory that has a manifest', () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-a', 'not-a-plugin'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify(localManifest({ name: 'valora-plugin-a' })));

		const packages = discoverPluginPackages(PACKAGES_DIR);

		expect(packages).toEqual([
			{
				manifest: localManifest({ name: 'valora-plugin-a' }),
				name: 'valora-plugin-a',
				packageName: '@windagency/valora-plugin-a',
				version: VERSION
			}
		]);
	});

	it('skips a valora-plugin-* directory with no manifest file', () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-a'] as unknown as ReturnType<typeof readdirSync>);
		vi.mocked(existsSync).mockReturnValue(false);

		expect(discoverPluginPackages(PACKAGES_DIR)).toEqual([]);
	});

	it('skips a manifest that is not valid JSON', () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-a'] as unknown as ReturnType<typeof readdirSync>);
		vi.mocked(readFileSync).mockReturnValue('not json');

		expect(discoverPluginPackages(PACKAGES_DIR)).toEqual([]);
	});
});

describe('fetchPublishedManifest', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as ReturnType<typeof spawnSync>);
		vi.mocked(mkdtempSync).mockReturnValue('/tmp/valora-drift-check-xyz');
		vi.mocked(writeFileSync).mockReturnValue(undefined);
		vi.mocked(rmSync).mockReturnValue(undefined);
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('returns null when the package/version is not published (404)', async () => {
		fetchSpy.mockResolvedValue(jsonResponse({}, { status: 404 }));

		expect(await fetchPublishedManifest(PACKAGE_NAME, VERSION)).toBeNull();
	});

	it('returns null when the npm registry is unreachable', async () => {
		fetchSpy.mockRejectedValue(new Error('network down'));

		expect(await fetchPublishedManifest(PACKAGE_NAME, VERSION)).toBeNull();
	});

	it('returns null when the packument has no tarball URL', async () => {
		fetchSpy.mockResolvedValue(jsonResponse({ dist: {} }));

		expect(await fetchPublishedManifest(PACKAGE_NAME, VERSION)).toBeNull();
	});

	it('downloads the tarball and extracts package/valora-plugin.json from it', async () => {
		const tarballUrl = 'https://registry.npmjs.org/@windagency/valora-plugin-memory-vault/-/x-1.0.1.tgz';
		fetchSpy.mockResolvedValueOnce(jsonResponse({ dist: { tarball: tarballUrl } }));
		fetchSpy.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stderr: '',
			stdout: JSON.stringify(localManifest({ requires: ['valora-runtime'], version: '1.0.0' }))
		} as ReturnType<typeof spawnSync>);

		const published = await fetchPublishedManifest(PACKAGE_NAME, VERSION);

		expect(published).toEqual(localManifest({ requires: ['valora-runtime'], version: '1.0.0' }));
		expect(fetchSpy).toHaveBeenNthCalledWith(1, `${DEFAULT_REGISTRY}/${PACKAGE_NAME}/${VERSION}`, expect.anything());
		expect(fetchSpy).toHaveBeenNthCalledWith(2, tarballUrl, expect.anything());
	});

	it('returns null when tar extraction fails', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ dist: { tarball: 'https://example.test/x.tgz' } }));
		fetchSpy.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
		vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'no such entry', stdout: '' } as ReturnType<
			typeof spawnSync
		>);

		expect(await fetchPublishedManifest(PACKAGE_NAME, VERSION)).toBeNull();
	});

	it('cleans up the temporary directory after extracting', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ dist: { tarball: 'https://example.test/x.tgz' } }));
		fetchSpy.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '{}' } as ReturnType<typeof spawnSync>);

		await fetchPublishedManifest(PACKAGE_NAME, VERSION);

		expect(vi.mocked(rmSync)).toHaveBeenCalledWith('/tmp/valora-drift-check-xyz', { force: true, recursive: true });
	});
});

describe('findPublishedManifestDrift', () => {
	it('flags a package whose published manifest content differs from its local source (the memory-vault incident)', async () => {
		const local = localManifest();
		const published = localManifest({ requires: ['valora-runtime'], version: '1.0.0' });
		const fetchManifest = vi.fn().mockResolvedValue(published);

		const drift = await findPublishedManifestDrift(
			[{ manifest: local, name: 'valora-plugin-memory-vault', packageName: PACKAGE_NAME, version: VERSION }],
			undefined,
			fetchManifest
		);

		expect(drift).toEqual([
			{ local, name: 'valora-plugin-memory-vault', packageName: PACKAGE_NAME, published, version: VERSION }
		]);
	});

	it('reports no drift when the published manifest matches local source exactly', async () => {
		const local = localManifest();
		const fetchManifest = vi.fn().mockResolvedValue(local);

		const drift = await findPublishedManifestDrift(
			[{ manifest: local, name: 'valora-plugin-memory-vault', packageName: PACKAGE_NAME, version: VERSION }],
			undefined,
			fetchManifest
		);

		expect(drift).toEqual([]);
	});

	it('treats differing key order in the published manifest as no drift (content, not formatting, is what matters)', async () => {
		const local = { contributes: ['code'], name: 'valora-plugin-memory-vault', version: VERSION };
		const published = { contributes: ['code'], name: 'valora-plugin-memory-vault', version: VERSION };
		const fetchManifest = vi.fn().mockResolvedValue(published);

		const drift = await findPublishedManifestDrift(
			[{ manifest: local, name: 'valora-plugin-memory-vault', packageName: PACKAGE_NAME, version: VERSION }],
			undefined,
			fetchManifest
		);

		expect(drift).toEqual([]);
	});

	it('skips a package that is not published yet, without flagging drift', async () => {
		const fetchManifest = vi.fn().mockResolvedValue(null);

		const drift = await findPublishedManifestDrift(
			[{ manifest: localManifest(), name: 'valora-plugin-memory-vault', packageName: PACKAGE_NAME, version: VERSION }],
			undefined,
			fetchManifest
		);

		expect(drift).toEqual([]);
	});
});
