import { createHash } from 'node:crypto';

const DEFAULT_REGISTRY_BASE = 'https://registry.npmjs.org';
const TIMEOUT_MS = 15000;
const MAX_TARBALL_BYTES = 50 * 1024 * 1024;

interface Packument {
	dist?: {
		integrity?: string;
		shasum?: string;
		tarball?: string;
	};
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function fetchPackument(packageName: string, version: string): Promise<Packument> {
	const url = `${registryBase()}/${packageName}/${version}`;
	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (err) {
		throw new Error(`Failed to reach the npm registry for ${packageName}@${version}: ${errorMessage(err)}`);
	}
	if (!response.ok) {
		throw new Error(
			`Failed to fetch package metadata for ${packageName}@${version}: HTTP ${response.status.toString()}`
		);
	}
	const text = await response.text();
	try {
		return JSON.parse(text) as Packument;
	} catch {
		throw new Error(`Registry response for ${packageName}@${version} was not valid JSON.`);
	}
}

async function fetchTarballBytes(tarballUrl: string, packageName: string, version: string): Promise<Buffer> {
	let response: Response;
	try {
		response = await fetch(tarballUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (err) {
		throw new Error(`Failed to download tarball for ${packageName}@${version}: ${errorMessage(err)}`);
	}
	if (!response.ok) {
		throw new Error(`Failed to download tarball for ${packageName}@${version}: HTTP ${response.status.toString()}`);
	}
	if (!response.body) {
		throw new Error(`Failed to download tarball for ${packageName}@${version}: response has no body.`);
	}

	const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_TARBALL_BYTES) {
			await reader.cancel();
			throw new Error(
				`Tarball for ${packageName}@${version} exceeds the ${MAX_TARBALL_BYTES.toString()}-byte size limit.`
			);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

function registryBase(): string {
	return (process.env['VALORA_NPM_REGISTRY_URL'] ?? DEFAULT_REGISTRY_BASE).replace(/\/$/, '');
}

function verifyDistIntegrity(buffer: Buffer, dist: Packument['dist'], packageName: string, version: string): void {
	if (dist?.integrity) {
		const [algo, expected] = dist.integrity.split('-');
		if (algo && expected && createHash(algo).update(buffer).digest('base64') === expected) return;
		throw new Error(`Tarball for ${packageName}@${version} failed the npm registry integrity check.`);
	}
	if (dist?.shasum) {
		if (createHash('sha1').update(buffer).digest('hex') === dist.shasum) return;
		throw new Error(`Tarball for ${packageName}@${version} failed the npm registry shasum check.`);
	}
	throw new Error(`Registry response for ${packageName}@${version} has no integrity or shasum to verify against.`);
}

/**
 * Downloads a package tarball directly from the npm registry (default
 * https://registry.npmjs.org, overridable via VALORA_NPM_REGISTRY_URL) — no
 * npm CLI, no .npmrc, no ambient environment config required.
 */
export async function fetchPackageTarball(packageName: string, version: string): Promise<Buffer> {
	const packument = await fetchPackument(packageName, version);
	const tarballUrl = packument.dist?.tarball;
	if (!tarballUrl) {
		throw new Error(`Registry response for ${packageName}@${version} is missing a tarball URL.`);
	}
	const buffer = await fetchTarballBytes(tarballUrl, packageName, version);
	verifyDistIntegrity(buffer, packument.dist, packageName, version);
	return buffer;
}
