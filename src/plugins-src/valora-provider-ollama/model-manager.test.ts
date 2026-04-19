import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaApiError, OllamaModelManagerImpl } from './model-manager.js';

const BASE_URL = 'http://localhost:11434';

function makeJsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Internal Server Error',
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

describe('OllamaModelManagerImpl', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('listLocalModels()', () => {
		it('returns an array of model name strings from the API response', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(makeJsonResponse({ models: [{ name: 'llama3' }, { name: 'mistral' }] }))
			);

			const manager = new OllamaModelManagerImpl();
			const result = await manager.listLocalModels(BASE_URL);

			expect(result).toEqual(['llama3', 'mistral']);
			expect(globalThis.fetch).toHaveBeenCalledWith(`${BASE_URL}/api/tags`);
		});

		it('throws OllamaApiError when the response is not ok', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeJsonResponse({}, false, 500)));

			const manager = new OllamaModelManagerImpl();

			await expect(manager.listLocalModels(BASE_URL)).rejects.toThrow(OllamaApiError);
			await expect(manager.listLocalModels(BASE_URL)).rejects.toMatchObject({
				statusCode: 500
			});
		});
	});

	describe('ensureModel()', () => {
		it('returns early without pulling when the model is already local', async () => {
			const mockFetch = vi.fn().mockResolvedValue(makeJsonResponse({ models: [{ name: 'llama3' }] }));
			vi.stubGlobal('fetch', mockFetch);

			const manager = new OllamaModelManagerImpl();
			await manager.ensureModel(BASE_URL, 'llama3');

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/api/tags`);
		});

		it('POSTs to /api/pull when the model is not local', async () => {
			const mockFetch = vi
				.fn()
				.mockResolvedValueOnce(makeJsonResponse({ models: [] }))
				.mockResolvedValueOnce(makeJsonResponse({}));
			vi.stubGlobal('fetch', mockFetch);

			const manager = new OllamaModelManagerImpl();
			await manager.ensureModel(BASE_URL, 'mistral');

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/pull`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'mistral', stream: false })
			});
		});

		it('throws OllamaApiError when the pull response is not ok', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(makeJsonResponse({ models: [] }))
					.mockResolvedValueOnce(makeJsonResponse({}, false, 500))
			);

			const manager = new OllamaModelManagerImpl();
			let caught: unknown;
			try {
				await manager.ensureModel(BASE_URL, 'mistral');
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(OllamaApiError);
			expect(caught).toMatchObject({ statusCode: 500 });
		});
	});
});
