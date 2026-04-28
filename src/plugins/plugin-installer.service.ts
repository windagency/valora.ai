import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getGlobalPluginsDir, getProjectPluginsDir, getSystemPluginsDir } from 'utils/paths';

import { PluginLoaderService } from './plugin-loader.service';
import { PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

export type InstalledPluginsLookup = (shortName: string) => boolean;
export type InstallScope = 'global' | 'project' | 'user';

export interface ProcessRunner {
	run(argv: string[], options?: { cwd?: string }): Promise<number>;
}

export class PluginInstallerService {
	constructor(
		private readonly runner: ProcessRunner,
		private readonly isPluginInstalled: InstalledPluginsLookup = defaultIsPluginInstalled
	) {}

	async install(pluginRef: string, scope: InstallScope): Promise<void> {
		await this.installWithVisited(pluginRef, scope, new Set<string>());
	}

	async installFromTarball(tgzPath: string, scope: InstallScope): Promise<void> {
		const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-tgz-staging-'));
		let targetDir: string | undefined;
		try {
			const code = await this.runner.run(['tar', '-xf', tgzPath, '--strip-components=1', '-C', stagingDir]);
			if (code !== 0) throw new Error(`Failed to extract plugin from ${tgzPath}`);

			const manifest = readPluginManifest(stagingDir);
			if (!manifest.name) throw new Error('Plugin manifest is missing required field: name');
			const shortName = manifest.name;

			targetDir = resolveTargetDir(scope, shortName);
			fs.mkdirSync(path.dirname(targetDir), { recursive: true });
			fs.rmSync(targetDir, { force: true, recursive: true });
			fs.cpSync(stagingDir, targetDir, { recursive: true });

			const visited = new Set<string>();
			for (const dep of manifest.requires ?? []) {
				await this.installWithVisited(dep, scope, visited);
			}
		} catch (err) {
			if (targetDir) fs.rmSync(targetDir, { force: true, recursive: true });
			if (scope === 'global' && isPermissionError(err)) {
				throw new Error('global scope requires elevated privileges — re-run with sudo or use --scope user');
			}
			throw err;
		} finally {
			fs.rmSync(stagingDir, { force: true, recursive: true });
		}
	}

	uninstall(pluginRef: string, scope: InstallScope): void {
		const shortName = shortNameFromPackage(resolvePackageName(pluginRef));
		const targetDir = resolveTargetDir(scope, shortName);
		if (!fs.existsSync(targetDir)) {
			throw new Error(`Plugin "${shortName}" is not installed in the ${scope} scope`);
		}
		fs.rmSync(targetDir, { force: true, recursive: true });
	}

	private async extractTarball(tmpDir: string, targetDir: string): Promise<void> {
		const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
		if (!tarball) throw new Error('npm pack produced no tarball');

		fs.mkdirSync(targetDir, { recursive: true });
		const code = await this.runner.run([
			'tar',
			'-xf',
			path.join(tmpDir, tarball),
			'--strip-components=1',
			'-C',
			targetDir
		]);
		if (code !== 0) {
			throw new Error(`Failed to extract plugin to ${targetDir}`);
		}
	}

	private async fetchTarball(packageName: string, destDir: string): Promise<void> {
		const code = await this.runner.run(['npm', 'pack', packageName, '--pack-destination', destDir]);
		if (code !== 0) {
			throw new Error(`Failed to download ${packageName} (npm pack exited ${code.toString()})`);
		}
	}

	private async installWithVisited(pluginRef: string, scope: InstallScope, visited: Set<string>): Promise<void> {
		const packageName = resolvePackageName(pluginRef);
		const shortName = shortNameFromPackage(packageName);

		if (visited.has(shortName)) return;
		visited.add(shortName);

		if (this.isPluginInstalled(shortName)) return;

		const packSource = resolveLocalPluginDir(shortName) ?? packageName;
		const targetDir = resolveTargetDir(scope, shortName);

		try {
			await this.materialize(packSource, targetDir);
			const manifest = readPluginManifest(targetDir);
			for (const dep of manifest.requires ?? []) {
				await this.installWithVisited(dep, scope, visited);
			}
		} catch (err) {
			if (scope === 'global' && isPermissionError(err)) {
				throw new Error('global scope requires elevated privileges — re-run with sudo or use --scope user');
			}
			fs.rmSync(targetDir, { force: true, recursive: true });
			throw err;
		}
	}

	private async materialize(packSource: string, targetDir: string): Promise<void> {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-install-'));
		try {
			await this.fetchTarball(packSource, tmpDir);
			await this.extractTarball(tmpDir, targetDir);
		} finally {
			fs.rmSync(tmpDir, { force: true, recursive: true });
		}
	}
}

export function peekTarballManifest(tgzPath: string): { name: string; version: string } {
	const result = spawnSync('tar', ['-xOf', tgzPath, 'package/valora-plugin.json']);
	if (result.status !== 0) throw new Error('Could not read manifest from tarball');
	const manifest = JSON.parse(result.stdout.toString()) as Record<string, unknown>;
	if (!manifest['name']) throw new Error('Manifest is missing required field: name');
	if (!manifest['version']) throw new Error('Manifest is missing required field: version');
	return { name: String(manifest['name']), version: String(manifest['version']) };
}

export function resolvePackageName(input: string): string {
	if (input.startsWith('@')) return input;
	const withPrefix = input.startsWith('valora-plugin-') ? input : `valora-plugin-${input}`;
	return `@windagency/${withPrefix}`;
}

export function shortNameFromPackage(packageName: string): string {
	return packageName.startsWith('@') ? (packageName.split('/')[1] ?? packageName) : packageName;
}

function defaultIsPluginInstalled(shortName: string): boolean {
	try {
		return new PluginLoaderService().isInstalled(shortName);
	} catch {
		return false;
	}
}

function isPermissionError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === 'EACCES' || code === 'EPERM';
}

function readPluginManifest(pluginDir: string): { name?: string; requires?: string[] } {
	try {
		return JSON.parse(fs.readFileSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE), 'utf-8')) as {
			name?: string;
			requires?: string[];
		};
	} catch {
		return {};
	}
}

function resolveLocalPluginDir(shortName: string): null | string {
	const registryFile = process.env['VALORA_PLUGIN_REGISTRY'];
	if (!registryFile) return null;
	try {
		const entries = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Array<{
			name: string;
			path?: string;
		}>;
		const entry = entries.find((e) => e.name === shortName);
		if (!entry?.path) return null;
		const resolved = path.resolve(entry.path);
		return fs.existsSync(resolved) ? resolved : null;
	} catch {
		return null;
	}
}

function resolveTargetDir(scope: InstallScope, shortName: string): string {
	if (scope === 'global') {
		return path.join(getSystemPluginsDir(), shortName);
	}
	if (scope === 'user') {
		return path.join(getGlobalPluginsDir(), shortName);
	}
	const projectDir = getProjectPluginsDir() ?? path.join(process.cwd(), '.valora', 'plugins');
	return path.join(projectDir, shortName);
}
