import * as fs from 'fs';
import * as path from 'path';

import { describe, it } from 'vitest';

/**
 * Registry Boundary Architecture Tests
 *
 * src/registry/ is a composition-root utility — it provides the
 * AgentRegistryService used during application bootstrap and CLI
 * audit commands. It must not leak into lower-level infrastructure
 * layers (services, types, utils, output, memory, observability).
 *
 * Allowed importers: src/cli/, src/mcp/, src/executor/, src/di/
 */

const ROOT = path.join(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const REGISTRY_DIR = path.join(SRC_DIR, 'registry');

function getTypeScriptSources(dir: string): string[] {
	const files: string[] = [];
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
			files.push(...getTypeScriptSources(full));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.includes('.test.') &&
			!entry.name.includes('.spec.')
		) {
			files.push(full);
		}
	}
	return files;
}

/** Match runtime imports (not type-only) from the top-level registry/ module. */
function hasRuntimeImportFromRegistry(content: string): boolean {
	// Matches: import { Foo } from 'registry/...' but NOT import type { Foo } from 'registry/...'
	return /^\s*import\s+(?!type\s+)\{[^}]+\}\s+from\s+['"]registry\//.test(content);
}

describe('registry/ may only be imported by composition-root layers', () => {
	/**
	 * Layers that must NOT import from src/registry/ at runtime.
	 * These are foundational or infrastructure layers that should have
	 * no awareness of agent-registry composition.
	 */
	const forbiddenLayers = ['services', 'types', 'utils', 'output', 'memory', 'observability'];

	for (const layer of forbiddenLayers) {
		it(`src/${layer}/ does not runtime-import from registry/`, () => {
			const layerDir = path.join(SRC_DIR, layer);
			const violations = getTypeScriptSources(layerDir)
				.filter((file) => hasRuntimeImportFromRegistry(fs.readFileSync(file, 'utf-8')))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`src/${layer}/ must not import from 'registry/' — registry is a composition-root utility.\n` +
						`Violations:\n  - ${violations.join('\n  - ')}\n\n` +
						`Inject AgentRegistryService via the DI container or pass it as a constructor argument.`
				);
			}
		});
	}

	/**
	 * Positive check: at least one composition-root layer does import from registry/,
	 * confirming the module is actually used and the boundary is meaningful.
	 */
	it('registry/ is consumed by at least one composition-root layer (cli, mcp, executor, di)', () => {
		const compositionRoots = ['cli', 'mcp', 'executor', 'di'];
		const consumers: string[] = [];

		for (const layer of compositionRoots) {
			const layerDir = path.join(SRC_DIR, layer);
			const found = getTypeScriptSources(layerDir).filter((file) =>
				hasRuntimeImportFromRegistry(fs.readFileSync(file, 'utf-8'))
			);
			consumers.push(...found.map((f) => path.relative(ROOT, f)));
		}

		if (consumers.length === 0) {
			throw new Error(
				`No file in src/cli/, src/mcp/, src/executor/, or src/di/ imports from 'registry/'.\n` +
					`Either the registry module has been moved or the allowlist above needs updating.`
			);
		}
	});

	/**
	 * Exhaustive check: every file that imports from registry/ must reside in an
	 * approved composition-root layer.
	 */
	it('no file outside approved layers imports from registry/', () => {
		const approvedPrefixes = [
			path.join(SRC_DIR, 'cli') + path.sep,
			path.join(SRC_DIR, 'mcp') + path.sep,
			path.join(SRC_DIR, 'executor') + path.sep,
			path.join(SRC_DIR, 'di') + path.sep,
			REGISTRY_DIR + path.sep // registry/ may import from itself
		];

		const violations = getTypeScriptSources(SRC_DIR)
			.filter((file) => !approvedPrefixes.some((prefix) => file.startsWith(prefix)))
			.filter((file) => hasRuntimeImportFromRegistry(fs.readFileSync(file, 'utf-8')))
			.map((file) => path.relative(ROOT, file));

		if (violations.length > 0) {
			throw new Error(
				`Files outside approved layers (cli/, mcp/, executor/, di/) import from 'registry/'.\n` +
					`Violations:\n  - ${violations.join('\n  - ')}\n\n` +
					`Approved importers: src/cli/, src/mcp/, src/executor/, src/di/. ` +
					`If this dependency is intentional, see ADR-015 for guidance.\n` +
					`// TODO(governance): consider whether this dependency is intentional (ADR-015)`
			);
		}
	});
});
