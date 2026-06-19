import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ObsidianConfig } from './config.schema.js';

import { buildAppConfig } from './templates/app.js';
import { buildCorePluginsConfig } from './templates/core-plugins.js';
import { buildGraphConfig } from './templates/graph.js';
import { buildWorkspaceConfig } from './templates/workspace.js';

const CATEGORIES = ['episodic', 'semantic', 'decisions'] as const;

/**
 * Resolve the vault directory the plugin should manage. Mirrors the host
 * memory module's `getDefaultVaultDir` algorithm so both surfaces agree on the
 * same path even when Valora is invoked from a subdirectory of the project:
 *
 *   1. Honour an explicit `config.obsidian.vaultDir` if set.
 *   2. Walk up from `cwd` looking for an ancestor `.valora/` directory; if
 *      found, return `<ancestor>/.valora/memory`.
 *   3. Fall back to `~/.valora/memory`.
 *
 * The walk-up algorithm matches `utils/paths.getProjectConfigDir` in the host;
 * a parity test in `__tests__/integration/memory-obsidian-vault-parity.test.ts`
 * asserts both produce the same path and prevents drift.
 */
export function resolveVaultDir(config: { obsidian: { vaultDir?: string } }, cwd = process.cwd()): string {
	if (config.obsidian.vaultDir) return config.obsidian.vaultDir;
	const projectConfigDir = findAncestorValoraDir(cwd);
	if (projectConfigDir !== null) return path.join(projectConfigDir, 'memory');
	return path.join(os.homedir(), '.valora', 'memory');
}

export async function setupObsidianVault(config: ObsidianConfig): Promise<void> {
	const vaultDir = resolveVaultDir(config);
	const obsidianDir = path.join(vaultDir, '.obsidian');

	try {
		for (const category of CATEGORIES) {
			fs.mkdirSync(path.join(vaultDir, category), { recursive: true });
		}
		fs.mkdirSync(obsidianDir, { recursive: true });

		// Each config file is scaffolded once, then left alone. A user who tweaks
		// graph colours, toggles plugins, or rearranges the workspace via Obsidian's
		// settings UI must not have those edits silently clobbered every time
		// Valora boots. To regenerate from the template, the user can delete the
		// file and re-run any Valora command.
		writeJsonIfMissing(path.join(obsidianDir, 'app.json'), buildAppConfig());
		writeJsonIfMissing(path.join(obsidianDir, 'core-plugins.json'), buildCorePluginsConfig());
		writeJsonIfMissing(path.join(obsidianDir, 'graph.json'), buildGraphConfig(config.obsidian.colors));
		writeJsonIfMissing(path.join(obsidianDir, 'workspace.json'), buildWorkspaceConfig());
	} catch (err) {
		console.warn(`Obsidian plugin: could not write .obsidian/ config: ${String(err)}`);
	}
}

function findAncestorValoraDir(startDir: string): null | string {
	let dir = startDir;
	for (let i = 0; i < 20; i++) {
		const candidate = path.join(dir, '.valora');
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
			return candidate;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}
	return null;
}

function writeJsonAtomic(filePath: string, content: unknown): void {
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(content, null, 2), 'utf-8');
	try {
		fs.renameSync(tmp, filePath);
	} catch {
		fs.rmSync(tmp, { force: true });
		throw new Error(`Failed to write ${filePath}`);
	}
}

function writeJsonIfMissing(filePath: string, content: unknown): void {
	if (fs.existsSync(filePath)) return;
	writeJsonAtomic(filePath, content);
}
