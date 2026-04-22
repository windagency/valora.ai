import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchLatestVersion, fetchLatestVersionFor } from './registry';

function makeResponse(bodyText: string, init?: { ok?: boolean; status?: number }): Response {
	const ok = init?.ok ?? true;
	const status = init?.status ?? 200;
	return new Response(bodyText, {
		status,
		statusText: ok ? 'OK' : 'Error'
	});
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe('fetchLatestVersion', () => {
	it('returns the version on happy path', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ version: '2.6.0' })));
		const result = await fetchLatestVersion('2.5.0');
		expect(result).toBe('2.6.0');
	});

	it('returns null when fetch throws (network error)', async () => {
		fetchSpy.mockRejectedValue(new Error('network down'));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('returns null when response is not ok', async () => {
		fetchSpy.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('returns null when body exceeds 64 KiB', async () => {
		const huge = 'x'.repeat(70 * 1024);
		fetchSpy.mockResolvedValue(makeResponse(huge));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('returns null when version is missing from JSON', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ name: '@windagency/valora' })));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('returns null when version does not match semver regex', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ version: 'not-a-version' })));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('returns null when JSON is malformed', async () => {
		fetchSpy.mockResolvedValue(makeResponse('{not-json'));
		expect(await fetchLatestVersion('2.5.0')).toBeNull();
	});

	it('accepts prerelease versions', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ version: '2.6.0-rc.1' })));
		expect(await fetchLatestVersion('2.5.0')).toBe('2.6.0-rc.1');
	});
});

describe('fetchLatestVersionFor', () => {
	it('fetches the npm registry URL for the given package', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ version: '1.2.0' })));
		const result = await fetchLatestVersionFor('@windagency/valora-plugin-rtk', '1.0.0');
		expect(result).toBe('1.2.0');
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://registry.npmjs.org/@windagency/valora-plugin-rtk/latest',
			expect.objectContaining({ headers: expect.objectContaining({ Accept: expect.any(String) }) })
		);
	});

	it('returns null when fetch throws', async () => {
		fetchSpy.mockRejectedValue(new Error('network error'));
		expect(await fetchLatestVersionFor('@windagency/valora-plugin-rtk', '1.0.0')).toBeNull();
	});

	it('returns null when the response is not ok', async () => {
		fetchSpy.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
		expect(await fetchLatestVersionFor('@windagency/valora-plugin-rtk', '1.0.0')).toBeNull();
	});

	it('returns null when the body is oversized', async () => {
		fetchSpy.mockResolvedValue(makeResponse('x'.repeat(70 * 1024)));
		expect(await fetchLatestVersionFor('@windagency/valora-plugin-rtk', '1.0.0')).toBeNull();
	});

	it('returns null when the version is not valid semver', async () => {
		fetchSpy.mockResolvedValue(makeResponse(JSON.stringify({ version: 'bad' })));
		expect(await fetchLatestVersionFor('@windagency/valora-plugin-rtk', '1.0.0')).toBeNull();
	});
});
