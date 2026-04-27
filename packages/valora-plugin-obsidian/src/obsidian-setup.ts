import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ObsidianConfig } from './config.schema.js';

import { buildAppConfig } from './templates/app.js';
import { buildCorePluginsConfig } from './templates/core-plugins.js';
import { buildGraphConfig } from './templates/graph.js';
import { buildWorkspaceConfig } from './templates/workspace.js';

const CATEGORIES = ['episodic', 'semantic', 'decisions'] as const;

export function resolveVaultDir(config: { obsidian: { vaultDir?: string } }, cwd = process.cwd()): string {
	if (config.obsidian.vaultDir) return config.obsidian.vaultDir;
	const projectVault = path.join(cwd, '.valora', 'memory');
	if (fs.existsSync(projectVault)) return projectVault;
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

		writeJsonAtomic(path.join(obsidianDir, 'app.json'), buildAppConfig());
		writeJsonAtomic(path.join(obsidianDir, 'core-plugins.json'), buildCorePluginsConfig());
		writeJsonAtomic(path.join(obsidianDir, 'graph.json'), buildGraphConfig(config.obsidian.colors));

		const workspacePath = path.join(obsidianDir, 'workspace.json');
		if (!fs.existsSync(workspacePath)) {
			writeJsonAtomic(workspacePath, buildWorkspaceConfig());
		}
	} catch (err) {
		console.warn(`Obsidian plugin: could not write .obsidian/ config: ${String(err)}`);
	}
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
