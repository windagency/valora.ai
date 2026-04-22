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

function readPluginManifest(pluginDir: string): { requires?: string[] } {
	try {
		return JSON.parse(fs.readFileSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE), 'utf-8')) as {
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
	const projectDir = getProjectPluginsDir();
	if (!projectDir) {
		throw new Error('No .valora/ project directory found — run from inside a Valora project or use --scope user');
	}
	return path.join(projectDir, shortName);
}
