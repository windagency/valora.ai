/**
 * Published-plugin manifest drift check.
 *
 * `valora plugin add`/`update` download whatever npm actually serves for a
 * plugin's declared version — not what's in this repo's working tree. A
 * manual `npm publish` run from a stale checkout can ship a version tag
 * whose packed `valora-plugin.json` silently doesn't match source (this
 * happened to valora-plugin-memory-vault@1.0.1: npm serves a manifest still
 * on version "1.0.0" with a dead `requires: ["valora-runtime"]`). npm
 * versions are immutable, so this can only be caught, never auto-fixed —
 * catching it here means the next `pnpm publish` for that package (at a new,
 * un-shipped version) is what actually fixes it.
 *
 * registry.json's sha256 integrity hash can't catch this class of bug: it's
 * computed FROM whatever is already published (see
 * scripts/compute-registry-integrity.ts), so it faithfully matches stale
 * content just as well as fresh content.
 *
 * This test needs the public npm registry to be reachable. Registry
 * unavailability is reported as a skip, not a failure — a flaky network
 * shouldn't fail CI, and `findPublishedManifestDrift` already treats "can't
 * reach the registry" as "nothing to compare" for exactly this reason.
 */

import * as path from 'path';

import { describe, it } from 'vitest';

import { discoverPluginPackages, findPublishedManifestDrift } from '../../scripts/check-published-plugin-drift.ts';

const ROOT = path.join(__dirname, '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

describe('published plugin manifests match source', () => {
	it('has no valora-plugin-* package whose already-published tarball manifest differs from the checked-in one', async () => {
		const packages = discoverPluginPackages(PACKAGES_DIR);
		const drifts = await findPublishedManifestDrift(packages);

		if (drifts.length === 0) return;

		const details = drifts
			.map(
				(d) =>
					`  ${d.packageName}@${d.version}\n` +
					`    published: ${JSON.stringify(d.published)}\n` +
					`    source:    ${JSON.stringify(d.local)}`
			)
			.join('\n');

		throw new Error(
			`${String(drifts.length)} plugin(s) have published content that no longer matches source:\n\n${details}\n\n` +
				`npm versions are immutable — bump the version, rebuild, and republish.`
		);
	});
});
