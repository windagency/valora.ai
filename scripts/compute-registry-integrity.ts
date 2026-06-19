import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
 * `pnpm pack`. Use this only when the package is not yet published.
 */
export function computeIntegrity(packageDir: string, packageName: string, registryUrl?: string): string {
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
