/**
 * npm registry lookup for the latest published version.
 */

const REGISTRY_URL = 'https://registry.npmjs.org/@windagency/valora/latest';
const TIMEOUT_MS = 3000;
const MAX_BYTES = 64 * 1024; // 64 KiB
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

/**
 * Fetches the latest published version of @windagency/valora from the npm
 * registry. Returns null on any failure — never throws.
 */
export async function fetchLatestVersion(currentVersion: string): Promise<null | string> {
	try {
		const response = await fetch(REGISTRY_URL, {
			headers: {
				Accept: 'application/vnd.npm.install-v1+json',
				'User-Agent': `valora-cli/${currentVersion} (+https://github.com/windagency/valora.ai)`
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});

		if (!response.ok) return null;

		const body = response.body;
		if (!body) return null;

		const reader = body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				total += value.byteLength;
				if (total > MAX_BYTES) {
					try {
						await reader.cancel();
					} catch {
						// ignore
					}
					return null;
				}
				chunks.push(value);
			}
		}

		const merged = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const text = new TextDecoder('utf-8').decode(merged);

		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return null;
		}

		if (parsed === null || typeof parsed !== 'object') return null;
		const version = (parsed as { version?: unknown }).version;
		if (typeof version !== 'string') return null;
		if (!VERSION_REGEX.test(version)) return null;

		return version;
	} catch {
		return null;
	}
}
