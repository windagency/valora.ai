import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * Thrown when a package is already published but `registryUrl` wasn't given —
 * a systemic misconfiguration (the caller forgot `VALORA_NPM_REGISTRY_URL`)
 * that affects every already-published package, not a per-package problem.
 * Callers iterating many packages must let this propagate and abort, rather
 * than catching it the same way as a genuine single-package pack failure.
 */
export class PublishedWithoutRegistryUrlError extends Error {}

/**
 * A local `pnpm pack` is never byte-identical to what actually gets served —
 * pnpm/npm publish rewrites JSON field order and gzip metadata. If the
 * package is already live at this version, silently packing it locally would
 * commit an integrity hash the installer's live download can never match.
 * Checking the default public registry (not `registryUrl`, which may point at
 * a local Verdaccio used deliberately for pre-release testing) catches the
 * case a developer forgot to pass `VALORA_NPM_REGISTRY_URL` for a package
 * that has genuinely already shipped.
 */
async function isAlreadyPublished(packageName: string, version: string): Promise<boolean> {
	try {
		const response = await fetch(`${DEFAULT_REGISTRY}/${packageName}/${version}`, {
			signal: AbortSignal.timeout(10000)
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Compute SHA-256 SRI for a plugin package tarball.
 *
 * When `registryUrl` is supplied, the tarball is fetched from a live npm
 * registry via `npm pack <packageName> --registry <registryUrl>`. This
 * matches exactly what `PluginInstallerService.fetchTarball` downloads, so
 * the hash will never diverge from what the installer verifies at install
 * time.
 *
 * When `registryUrl` is absent, the tarball is produced locally via
 * `pnpm pack`. Use this only when the package is not yet published — if
 * `packageName@version` already resolves on the public registry, this throws
 * rather than silently computing a hash the installer will never match.
 */
export async function computeIntegrity(
	packageDir: string,
	packageName: string,
	version: string,
	registryUrl?: string
): Promise<string> {
	if (!registryUrl && (await isAlreadyPublished(packageName, version))) {
		throw new PublishedWithoutRegistryUrlError(
			`${packageName}@${version} is already published to the npm registry. ` +
				'Computing its integrity from a local pnpm pack would not match the published tarball bytes. ' +
				`Set VALORA_NPM_REGISTRY_URL (e.g. ${DEFAULT_REGISTRY}) and re-run.`
		);
	}

	const tmp = mkdtempSync(join(tmpdir(), 'valora-registry-pack-'));
	try {
		if (registryUrl) {
			const pack = spawnSync('npm', ['pack', packageName, '--registry', registryUrl, '--pack-destination', tmp], {
				encoding: 'utf-8'
			});
			if (pack.status !== 0) {
				throw new Error(`npm pack failed for ${packageName}: ${pack.stderr as string}`);
			}
		} else {
			const pack = spawnSync('pnpm', ['pack', '--pack-destination', tmp, '--silent'], {
				cwd: packageDir,
				encoding: 'utf-8'
			});
			if (pack.status !== 0) {
				throw new Error(`pnpm pack failed for ${packageDir}: ${pack.stderr as string}`);
			}
		}

		const tarball = readdirSync(tmp).find((f) => f.toString().endsWith('.tgz'));
		if (!tarball) {
			throw new Error(`pack produced no tarball for ${registryUrl ? packageName : packageDir}`);
		}

		const hash = createHash('sha256');
		hash.update(readFileSync(join(tmp, tarball.toString())));
		return `sha256-${hash.digest('base64')}`;
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
}
