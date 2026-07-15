import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPackageTarball } from './npm-registry-client';

function integrityFor(buffer: Buffer): string {
	return `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
}

function packumentResponse(dist: Record<string, unknown>, init?: { status?: number }): Response {
	const status = init?.status ?? 200;
	return new Response(JSON.stringify({ dist }), { status, statusText: status === 200 ? 'OK' : 'Error' });
}

function tarballResponse(buffer: Buffer, init?: { status?: number }): Response {
	const status = init?.status ?? 200;
	return new Response(buffer, { status, statusText: status === 200 ? 'OK' : 'Error' });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
let savedRegistryUrl: string | undefined;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, 'fetch');
	savedRegistryUrl = process.env['VALORA_NPM_REGISTRY_URL'];
	delete process.env['VALORA_NPM_REGISTRY_URL'];
});

afterEach(() => {
	fetchSpy.mockRestore();
	if (savedRegistryUrl === undefined) {
		delete process.env['VALORA_NPM_REGISTRY_URL'];
	} else {
		process.env['VALORA_NPM_REGISTRY_URL'] = savedRegistryUrl;
	}
});

describe('fetchPackageTarball', () => {
	it('fetches the packument then the tarball and returns the bytes, verified against dist.integrity', async () => {
		const bytes = Buffer.from('fake-tarball-bytes');
		fetchSpy
			.mockResolvedValueOnce(
				packumentResponse({ integrity: integrityFor(bytes), tarball: 'https://registry.npmjs.org/tarball.tgz' })
			)
			.mockResolvedValueOnce(tarballResponse(bytes));

		const result = await fetchPackageTarball('@windagency/valora-runtime', '1.0.0');

		expect(result).toEqual(bytes);
		expect(fetchSpy).toHaveBeenNthCalledWith(
			1,
			'https://registry.npmjs.org/@windagency/valora-runtime/1.0.0',
			expect.objectContaining({ signal: expect.anything() as unknown })
		);
		expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://registry.npmjs.org/tarball.tgz', expect.anything());
	});

	it('verifies against dist.shasum when dist.integrity is absent', async () => {
		const bytes = Buffer.from('other-bytes');
		const shasum = createHash('sha1').update(bytes).digest('hex');
		fetchSpy
			.mockResolvedValueOnce(packumentResponse({ shasum, tarball: 'https://registry.npmjs.org/tarball.tgz' }))
			.mockResolvedValueOnce(tarballResponse(bytes));

		const result = await fetchPackageTarball('@windagency/valora-runtime', '1.0.0');
		expect(result).toEqual(bytes);
	});

	it('requests the exact version passed in, not "latest"', async () => {
		const bytes = Buffer.from('bytes');
		fetchSpy
			.mockResolvedValueOnce(
				packumentResponse({ integrity: integrityFor(bytes), tarball: 'https://registry.npmjs.org/t.tgz' })
			)
			.mockResolvedValueOnce(tarballResponse(bytes));

		await fetchPackageTarball('@windagency/valora-runtime', '2.3.4');

		expect(fetchSpy).toHaveBeenNthCalledWith(
			1,
			'https://registry.npmjs.org/@windagency/valora-runtime/2.3.4',
			expect.anything()
		);
	});

	it('throws a descriptive error when the packument fetch is forbidden', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403, statusText: 'Forbidden' }));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow(
			/Failed to fetch package metadata.*403/
		);
	});

	it('throws a descriptive error when the packument fetch throws (network error)', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('network down'));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow(
			/Failed to reach the npm registry/
		);
	});

	it('throws when the packument response is not valid JSON', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('{not-json', { status: 200 }));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow('not valid JSON');
	});

	it('throws when the packument has no dist.tarball', async () => {
		fetchSpy.mockResolvedValueOnce(packumentResponse({}));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow('missing a tarball URL');
	});

	it('throws a descriptive error when the tarball fetch is not ok', async () => {
		fetchSpy
			.mockResolvedValueOnce(packumentResponse({ integrity: 'sha512-x', tarball: 'https://registry.npmjs.org/t.tgz' }))
			.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow(
			/Failed to download tarball.*404/
		);
	});

	it('throws when the downloaded bytes exceed the size limit', async () => {
		const huge = Buffer.alloc(51 * 1024 * 1024);
		fetchSpy
			.mockResolvedValueOnce(
				packumentResponse({ integrity: integrityFor(huge), tarball: 'https://registry.npmjs.org/t.tgz' })
			)
			.mockResolvedValueOnce(tarballResponse(huge));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow(/size limit/);
	});

	it('throws when the downloaded bytes fail the dist.integrity check', async () => {
		const bytes = Buffer.from('real-bytes');
		fetchSpy
			.mockResolvedValueOnce(
				packumentResponse({ integrity: 'sha512-not-the-real-hash', tarball: 'https://registry.npmjs.org/t.tgz' })
			)
			.mockResolvedValueOnce(tarballResponse(bytes));

		await expect(fetchPackageTarball('@windagency/valora-runtime', '1.0.0')).rejects.toThrow(/integrity check/);
	});

	it('respects VALORA_NPM_REGISTRY_URL as a base-URL override', async () => {
		process.env['VALORA_NPM_REGISTRY_URL'] = 'https://internal-mirror.example.com';
		const bytes = Buffer.from('bytes');
		fetchSpy
			.mockResolvedValueOnce(
				packumentResponse({ integrity: integrityFor(bytes), tarball: 'https://internal-mirror.example.com/t.tgz' })
			)
			.mockResolvedValueOnce(tarballResponse(bytes));

		await fetchPackageTarball('@windagency/valora-runtime', '1.0.0');

		expect(fetchSpy).toHaveBeenNthCalledWith(
			1,
			'https://internal-mirror.example.com/@windagency/valora-runtime/1.0.0',
			expect.anything()
		);
	});
});
