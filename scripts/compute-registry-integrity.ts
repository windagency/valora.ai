import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * Checks the public npm registry directly (not `registryUrl`, which may be an
 * explicit override to a private registry) — used only to decide whether an
 * unqualified `computeIntegrity()` call can safely download instead of
 * packing locally.
 */
async function isPublishedOnDefaultRegistry(packageName: string, version: string): Promise<boolean> {
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
 * A local `pnpm pack` is never byte-identical to what actually gets served —
 * pnpm/npm publish rewrites JSON field order and gzip metadata. So whenever
 * `packageName@version` is already published, the tarball is downloaded via
 * `npm pack <packageName>@<version> --registry <url>` instead — this matches
 * exactly what `PluginInstallerService.fetchTarball` downloads, so the hash
 * can never diverge from what the installer verifies at install time.
 * "Already published" is the common, expected case, not an error: when
 * `registryUrl` isn't given, this checks the public registry itself and
 * downloads from there automatically — no operator action required.
 *
 * `registryUrl` only needs to be passed to override which registry to use
 * (e.g. a private Verdaccio), in which case it's trusted unconditionally.
 *
 * Local `pnpm pack` is used only as a last resort, for a package that isn't
 * published anywhere yet (still in development).
 */
export async function computeIntegrity(
	packageDir: string,
	packageName: string,
	version: string,
	registryUrl?: string
): Promise<string> {
	const downloadFrom =
		registryUrl ?? ((await isPublishedOnDefaultRegistry(packageName, version)) ? DEFAULT_REGISTRY : undefined);

	const tmp = mkdtempSync(join(tmpdir(), 'valora-registry-pack-'));
	try {
		if (downloadFrom) {
			const pack = spawnSync(
				'npm',
				['pack', `${packageName}@${version}`, '--registry', downloadFrom, '--pack-destination', tmp],
				{ encoding: 'utf-8' }
			);
			if (pack.status !== 0) {
				throw new Error(`npm pack failed for ${packageName}@${version}: ${pack.stderr as string}`);
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
			throw new Error(`pack produced no tarball for ${downloadFrom ? packageName : packageDir}`);
		}

		const hash = createHash('sha256');
		hash.update(readFileSync(join(tmp, tarball.toString())));
		return `sha256-${hash.digest('base64')}`;
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
}
