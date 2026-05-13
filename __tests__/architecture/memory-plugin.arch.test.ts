/**
 * Memory-plugin boundary architecture test.
 *
 * Asserts the core/plugin split established by the memory-as-plugin
 * migration:
 *
 *  1. Production code under `src/` does NOT import the bundled vault
 *     package (`@windagency/valora-plugin-memory-vault`) except at the
 *     small set of bootstrap glue sites listed below. Tests, dist files,
 *     and the bundled package's own tree are excluded from the scan.
 *
 *  2. `new VaultStore` and `new MemoryManager` only appear inside the
 *     bundled package and the legacy migrate/reembed CLI path.
 *
 *  3. Host consumers reach memory exclusively through the
 *     `MemoryProvider` contract (re-exported via `types/memory.types`
 *     and `@windagency/valora-plugin-api`). No host consumer imports a
 *     concrete vault class.
 *
 * If you legitimately need to add another import of the bundled package
 * from the host, add the file path to `ALLOWED_VAULT_IMPORT_SITES` below
 * and reference the reason in the PR.
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it } from 'vitest';

const ROOT = path.join(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');

const BUNDLED_VAULT_PACKAGE = '@windagency/valora-plugin-memory-vault';

/**
 * Host files allowed to reach into the bundled vault package directly.
 * Each entry is a path relative to the repo root.
 *
 *   - `src/memory/bootstrap.ts` — registers the bundled provider as
 *     `'vault'` at boot.
 *   - `src/memory/index.ts` — legacy back-compat barrel that forwards
 *     vault exports for code still importing `from 'memory'`.
 *   - `src/services/index.ts` — legacy back-compat barrel that forwards
 *     the consolidation + extraction service singletons.
 *   - `src/di/container.ts` — reads `parseVaultPluginConfig` to parse the
 *     `plugins['memory-vault']` config block before bootstrap.
 *   - `src/executor/pipeline.ts` — pulls `getMemoryExtraction()` for the
 *     post-session extraction hook. (Candidate for future cleanup: route
 *     through `MemoryProvider.extractFromAgentOutput()`.)
 *   - `src/executor/stage-executor.ts` — reads `parseVaultPluginConfig`
 *     to source the memory-injection thresholds for prompt assembly.
 */
const ALLOWED_VAULT_IMPORT_SITES = new Set<string>([
	'src/memory/bootstrap.ts',
	'src/memory/index.ts',
	'src/services/index.ts',
	'src/di/container.ts',
	'src/executor/pipeline.ts',
	'src/executor/stage-executor.ts'
]);

/**
 * Files outside the bundled package allowed to instantiate the legacy
 * concrete vault classes (`new VaultStore` / `new MemoryManager`). The
 * `memory.command.ts` migrate + reembed subcommands manipulate the vault
 * directly; everything else must route through the registry.
 */
const ALLOWED_CONCRETE_VAULT_SITES = new Set<string>(['src/cli/commands/memory.command.ts']);

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
			!entry.name.endsWith('.d.ts') &&
			!entry.name.includes('.test.') &&
			!entry.name.includes('.spec.')
		) {
			files.push(full);
		}
	}
	return files;
}

function stripComments(content: string): string {
	return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

function importsBundledPackage(content: string): boolean {
	const code = stripComments(content);
	const staticImport = new RegExp(`from\\s+['"]${BUNDLED_VAULT_PACKAGE}['"]`);
	const dynamicImport = new RegExp(`import\\s*\\(\\s*['"]${BUNDLED_VAULT_PACKAGE}['"]\\s*\\)`);
	return staticImport.test(code) || dynamicImport.test(code);
}

describe('Memory plugin boundary', () => {
	describe('Bundled vault is reached only from the allowed bootstrap glue', () => {
		it('no production file under src/ outside the allowlist imports @windagency/valora-plugin-memory-vault', () => {
			const violations: string[] = [];
			for (const file of getTypeScriptSources(SRC_DIR)) {
				const rel = path.relative(ROOT, file);
				if (ALLOWED_VAULT_IMPORT_SITES.has(rel)) continue;
				if (importsBundledPackage(fs.readFileSync(file, 'utf-8'))) {
					violations.push(rel);
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`Unauthorised import of '${BUNDLED_VAULT_PACKAGE}' in core code:\n  - ${violations.join('\n  - ')}\n\n` +
						`Host consumers must reach the active memory backend through ` +
						`getMemoryRegistry().getActive() and the MemoryProvider contract. ` +
						`If this import is legitimately required, add the path to ` +
						`ALLOWED_VAULT_IMPORT_SITES and document the reason in the PR.`
				);
			}
		});

		it('every entry in ALLOWED_VAULT_IMPORT_SITES still exists and actually imports the bundled package', () => {
			const stale: string[] = [];
			const inertEntries: string[] = [];
			for (const rel of ALLOWED_VAULT_IMPORT_SITES) {
				const full = path.join(ROOT, rel);
				if (!fs.existsSync(full)) {
					stale.push(rel);
					continue;
				}
				if (!importsBundledPackage(fs.readFileSync(full, 'utf-8'))) {
					inertEntries.push(rel);
				}
			}

			if (stale.length > 0) {
				throw new Error(
					`ALLOWED_VAULT_IMPORT_SITES references files that no longer exist:\n  - ${stale.join('\n  - ')}\n\n` +
						`Prune the allowlist to keep it accurate.`
				);
			}
			if (inertEntries.length > 0) {
				throw new Error(
					`ALLOWED_VAULT_IMPORT_SITES references files that no longer import the bundled package:\n  - ${inertEntries.join('\n  - ')}\n\n` +
						`Remove them from the allowlist — they no longer need the exemption.`
				);
			}
		});
	});

	describe('Concrete vault classes stay inside the bundled package', () => {
		it('no host file outside the allowlist instantiates VaultStore or MemoryManager', () => {
			const violations: string[] = [];
			const pattern = /\bnew\s+(?:VaultStore|MemoryManager)\s*\(/;

			for (const file of getTypeScriptSources(SRC_DIR)) {
				const rel = path.relative(ROOT, file);
				if (ALLOWED_CONCRETE_VAULT_SITES.has(rel)) continue;
				const code = stripComments(fs.readFileSync(file, 'utf-8'));
				if (pattern.test(code)) {
					violations.push(rel);
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`Direct \`new VaultStore(...)\` or \`new MemoryManager(...)\` in core code:\n  - ${violations.join('\n  - ')}\n\n` +
						`Construct memory backends only inside the bundled package; ` +
						`host consumers should route through getMemoryRegistry().getActive().`
				);
			}
		});
	});

	describe('Host consumers depend on MemoryProvider, not concrete vault classes', () => {
		it('no host file under src/ (outside the bundled-vault import allowlist) imports VaultMemoryProvider', () => {
			const violations: string[] = [];
			const importPattern = /import\s+[^;]*\bVaultMemoryProvider\b[^;]*from/;

			for (const file of getTypeScriptSources(SRC_DIR)) {
				const rel = path.relative(ROOT, file);
				if (ALLOWED_VAULT_IMPORT_SITES.has(rel)) continue;
				if (importPattern.test(fs.readFileSync(file, 'utf-8'))) {
					violations.push(rel);
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`Host code imports VaultMemoryProvider directly:\n  - ${violations.join('\n  - ')}\n\n` +
						`Program against the MemoryProvider contract (from 'types/memory.types' ` +
						`or '@windagency/valora-plugin-api') instead of a concrete provider class.`
				);
			}
		});
	});
});
