/**
 * npm registry lookup for the latest published version.
 */

const NPM_REGISTRY_BASE = 'https://registry.npmjs.org';
const VALORA_PACKAGE = '@windagency/valora';
const TIMEOUT_MS = 3000;
const MAX_BYTES = 64 * 1024; // 64 KiB
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

function exceedsMaxSize(response: Response): boolean {
	const contentLength = response.headers.get('content-length');
	if (contentLength !== null && Number(contentLength) > MAX_BYTES) return true;
	return false;
}

function extractVersion(text: string): null | string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object') return null;
	const version = (parsed as Record<string, unknown>)['version'];
	if (typeof version !== 'string') return null;
	if (!VERSION_REGEX.test(version)) return null;
	return version;
}

/**
 * Fetches the latest published version of any npm package.
 * Returns null on any failure — never throws.
 */
export async function fetchLatestVersionFor(packageName: string, userAgentVersion: string): Promise<null | string> {
	const url = `${NPM_REGISTRY_BASE}/${packageName}/latest`;
	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/vnd.npm.install-v1+json',
				'User-Agent': `valora-cli/${userAgentVersion} (+https://github.com/windagency/valora.ai)`
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});

		if (!response.ok) return null;
		if (exceedsMaxSize(response)) return null;

		const text = await response.text();
		if (text.length > MAX_BYTES) return null;

		return extractVersion(text);
	} catch {
		return null;
	}
}

/**
 * Fetches the latest published version of @windagency/valora from the npm
 * registry. Returns null on any failure — never throws.
 */
export async function fetchLatestVersion(currentVersion: string): Promise<null | string> {
	return fetchLatestVersionFor(VALORA_PACKAGE, currentVersion);
}
