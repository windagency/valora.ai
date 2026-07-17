import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { computeRuntimeApiFingerprint, RUNTIME_PACKAGE_JSON } from '../../scripts/compute-runtime-fingerprint.ts';

const ROOT = path.join(__dirname, '../..');
const RUNTIME_DIR = path.join(ROOT, 'packages', 'valora-runtime');
const REGISTRY_JSON = path.join(ROOT, 'data', 'plugins', 'registry.json');
const RUNTIME_PACKAGE_NAME = '@windagency/valora-runtime';

interface RuntimePackageJson {
	apiFingerprints?: Record<string, string>;
	version: string;
}

describe('valora-runtime is a shared internal library, not an installable plugin', () => {
	it('has no valora-plugin.json manifest', () => {
		const manifestPath = path.join(RUNTIME_DIR, 'valora-plugin.json');
		expect(fs.existsSync(manifestPath)).toBe(false);
	});

	it('is not listed in data/plugins/registry.json', () => {
		if (!fs.existsSync(REGISTRY_JSON)) return;

		const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf-8')) as Array<{ package: string }>;
		const runtimeEntry = registry.find((entry) => entry.package === RUNTIME_PACKAGE_NAME);

		expect(runtimeEntry, `${RUNTIME_PACKAGE_NAME} must not be discoverable via 'valora plugin add'`).toBeUndefined();
	});
});

describe('valora-runtime API changes require a version bump', () => {
	it('declares an apiFingerprints entry for its current version matching its source', () => {
		const pkg = JSON.parse(fs.readFileSync(RUNTIME_PACKAGE_JSON, 'utf-8')) as RuntimePackageJson;
		const recorded = pkg.apiFingerprints?.[pkg.version];
		const actual = computeRuntimeApiFingerprint();

		if (recorded === undefined) {
			throw new Error(
				`packages/valora-runtime/package.json has no apiFingerprints["${pkg.version}"] entry.\n` +
					`Run 'pnpm --filter @windagency/valora-runtime run fingerprint:update' and commit the result ` +
					`alongside a version bump whenever valora-runtime's source changes.`
			);
		}

		expect(
			actual,
			`valora-runtime's source changed but its version ("${pkg.version}") wasn't bumped.\n` +
				`Bump the version in packages/valora-runtime/package.json, then run ` +
				`'pnpm --filter @windagency/valora-runtime run fingerprint:update' and commit both.`
		).toBe(recorded);
	});
});
