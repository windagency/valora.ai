/** Internal shape returned by the Ollama /api/tags endpoint. */
interface OllamaTagsResponse {
	models: Array<{ name: string }>;
}

/**
 * Thrown when the Ollama HTTP API returns a non-OK response.
 */
export class OllamaApiError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = 'OllamaApiError';
		this.statusCode = statusCode;
	}
}

function assertOk(response: globalThis.Response, context: string): void {
	if (!response.ok) {
		throw new OllamaApiError(`Ollama API error during ${context}: ${response.statusText}`, response.status);
	}
}

/**
 * Manages pulling and listing locally available Ollama models via the HTTP API.
 */
export interface OllamaModelManager {
	/** Lists models currently available locally (GET /api/tags). */
	listLocalModels(_baseUrl: string): Promise<string[]>;
	/** Pulls a model from the Ollama registry if not already present (POST /api/pull). */
	ensureModel(_baseUrl: string, _model: string): Promise<void>;
}

/**
 * Concrete implementation of {@link OllamaModelManager} that communicates
 * with a running Ollama server over HTTP.
 */
export class OllamaModelManagerImpl implements OllamaModelManager {
	/** Returns the names of all models stored locally on the Ollama server. */
	async listLocalModels(baseUrl: string): Promise<string[]> {
		const response = await globalThis.fetch(`${baseUrl}/api/tags`);
		assertOk(response, 'listLocalModels');
		const body = (await response.json()) as OllamaTagsResponse;
		return body.models.map((m) => m.name);
	}

	/**
	 * Ensures the given model is available locally.
	 * If the model is already present, this method returns immediately.
	 * Otherwise it issues a pull request and waits for completion.
	 */
	async ensureModel(baseUrl: string, model: string): Promise<void> {
		const localModels = await this.listLocalModels(baseUrl);
		if (localModels.includes(model)) {
			return;
		}

		const response = await globalThis.fetch(`${baseUrl}/api/pull`, {
			body: JSON.stringify({ name: model, stream: false }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST'
		});
		assertOk(response, 'ensureModel');
	}
}
