import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	type ProcessRunner,
	assertSafeTarball,
	computeTarballIntegrity,
	PluginInstallerService,
	peekTarballManifest,
	resolvePackageName,
	shortNameFromPackage
} from './plugin-installer.service';

const installerWarn = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: installerWarn })
}));

vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return {
		...actual,
		getGlobalPluginsDir: vi.fn(() => '/mock/global/plugins'),
		getProjectPluginsDir: vi.fn(() => null),
		getSystemPluginsDir: vi.fn(() => '/mock/system/plugins')
	};
});

interface MockRunnerOptions {
	packCode?: number;
	packCodeByShortName?: Record<string, number>;
	tarCode?: number;
	manifests?: Record<string, object>;
	tgzManifest?: object;
}

function makeMockRunner(overrides?: MockRunnerOptions): ProcessRunner & { packCalls: string[] } {
	const packCalls: string[] = [];
	return {
		packCalls,
		run: vi.fn(async (argv: string[]) => {
			if (argv[0] === 'npm' && argv[1] === 'pack') {
				const pkgArg = argv[2] as string;
				const shortName = pkgArg.startsWith('@') ? (pkgArg.split('/')[1] ?? pkgArg) : path.basename(pkgArg);
				packCalls.push(shortName);

				if (overrides?.packCodeByShortName?.[shortName] !== undefined) {
					return overrides.packCodeByShortName[shortName];
				}
				if ((overrides?.packCode ?? 0) !== 0) return overrides!.packCode!;

				const destIdx = argv.indexOf('--pack-destination');
				const destDir = argv[destIdx + 1];
				if (destDir) {
					// Produce a real (tiny) tarball so assertSafeTarball can list it.
					const srcDir = fs.mkdtempSync(path.join(destDir, 'tgz-src-'));
					const pkgDir = path.join(srcDir, 'package');
					fs.mkdirSync(pkgDir);
					fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), '{}');
					child_process.spawnSync('tar', [
						'-czf',
						path.join(destDir, `${shortName}-1.0.0.tgz`),
						'-C',
						srcDir,
						'package'
					]);
					fs.rmSync(srcDir, { force: true, recursive: true });
				}
				return 0;
			}
			if (argv[0] === 'tar') {
				if ((overrides?.tarCode ?? 0) !== 0) return overrides!.tarCode!;

				const cIdx = argv.indexOf('-C');
				const destDir = argv[cIdx + 1] as string | undefined;
				if (destDir) {
					const isStaging = path.basename(destDir).startsWith('valora-tgz-staging-');
					if (isStaging && overrides?.tgzManifest) {
						fs.writeFileSync(path.join(destDir, 'valora-plugin.json'), JSON.stringify(overrides.tgzManifest));
					} else if (!isStaging && overrides?.manifests) {
						const shortName = path.basename(destDir);
						const manifest = overrides.manifests[shortName];
						if (manifest) {
							fs.writeFileSync(path.join(destDir, 'valora-plugin.json'), JSON.stringify(manifest));
						}
					}
				}
				return 0;
			}
			return 0;
		})
	};
}

describe('assertSafeTarball', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-tar-safety-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeSafeTgz(): string {
		const pkgDir = path.join(tmpDir, 'package');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), '{}');
		const tgzPath = path.join(tmpDir, 'safe.tgz');
		const result = child_process.spawnSync('tar', ['-czf', tgzPath, '-C', tmpDir, 'package']);
		if (result.status !== 0) throw new Error('failed to build safe tarball');
		return tgzPath;
	}

	function makeEscapeTgz(): string {
		const pkgDir = path.join(tmpDir, 'package');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'manifest.json'), '{}');
		const tgzPath = path.join(tmpDir, 'escape.tgz');
		// GNU tar's --transform rewrites entry names; prepending '../' produces a tarslip archive
		const result = child_process.spawnSync('tar', [
			'--transform=flags=r;s|^|../|',
			'-czf',
			tgzPath,
			'-C',
			tmpDir,
			'package'
		]);
		if (result.status !== 0) throw new Error('failed to build escape tarball');
		return tgzPath;
	}

	it('accepts a tarball whose entries all live under a single top-level prefix', () => {
		expect(() => assertSafeTarball(makeSafeTgz())).not.toThrow();
	});

	it('rejects a tarball whose entry path contains a ".." segment', () => {
		expect(() => assertSafeTarball(makeEscapeTgz())).toThrow(/escape/i);
	});

	it('rejects when tar fails to list the entries', () => {
		expect(() => assertSafeTarball(path.join(tmpDir, 'does-not-exist.tgz'))).toThrow(/list/i);
	});
});

describe('computeTarballIntegrity', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-integrity-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns a sha256-prefixed base64 SRI string', () => {
		const tgzPath = path.join(tmpDir, 'plugin.tgz');
		fs.writeFileSync(tgzPath, 'arbitrary-bytes');
		const integrity = computeTarballIntegrity(tgzPath);
		expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
	});

	it('returns a stable hash for identical bytes', () => {
		const a = path.join(tmpDir, 'a.tgz');
		const b = path.join(tmpDir, 'b.tgz');
		fs.writeFileSync(a, 'identical-bytes');
		fs.writeFileSync(b, 'identical-bytes');
		expect(computeTarballIntegrity(a)).toBe(computeTarballIntegrity(b));
	});

	it('returns a different hash when the bytes differ', () => {
		const a = path.join(tmpDir, 'a.tgz');
		const b = path.join(tmpDir, 'b.tgz');
		fs.writeFileSync(a, 'first');
		fs.writeFileSync(b, 'second');
		expect(computeTarballIntegrity(a)).not.toBe(computeTarballIntegrity(b));
	});
});

describe('peekTarballManifest', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-peek-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeTgz(manifest: object): string {
		const pkgDir = path.join(tmpDir, 'package');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), JSON.stringify(manifest));
		const tgzPath = path.join(tmpDir, 'test-plugin.tgz');
		child_process.spawnSync('tar', ['-czf', tgzPath, '-C', tmpDir, 'package']);
		return tgzPath;
	}

	it('returns name and version from a valid tgz manifest', () => {
		const tgzPath = makeTgz({ name: 'valora-plugin-docs', version: '1.2.3' });
		expect(peekTarballManifest(tgzPath)).toEqual({ name: 'valora-plugin-docs', version: '1.2.3' });
	});

	it('throws when the tgz path does not exist on disk', () => {
		expect(() => peekTarballManifest('/nonexistent/path.tgz')).toThrow('Could not read manifest from tarball');
	});

	it('throws when the manifest is missing the name field', () => {
		const tgzPath = makeTgz({ version: '1.0.0' });
		expect(() => peekTarballManifest(tgzPath)).toThrow('name');
	});

	it('throws when the manifest is missing the version field', () => {
		const tgzPath = makeTgz({ name: 'valora-plugin-docs' });
		expect(() => peekTarballManifest(tgzPath)).toThrow('version');
	});

	it('rejects a manifest whose name attempts to escape the install scope via path segments', () => {
		const tgzPath = makeTgz({ name: '../../etc/cron.d/evil', version: '1.0.0' });
		expect(() => peekTarballManifest(tgzPath)).toThrow(/invalid plugin name|kebab/i);
	});

	it('rejects a manifest whose name contains uppercase letters', () => {
		const tgzPath = makeTgz({ name: 'NotKebab', version: '1.0.0' });
		expect(() => peekTarballManifest(tgzPath)).toThrow(/invalid plugin name|kebab/i);
	});

	it('rejects a manifest whose name starts with a dash or dot', () => {
		const tgzPath = makeTgz({ name: '-bad', version: '1.0.0' });
		expect(() => peekTarballManifest(tgzPath)).toThrow(/invalid plugin name|kebab/i);
	});
});

describe('resolvePackageName', () => {
	it('expands a bare short name to the full scoped package', () => {
		expect(resolvePackageName('compression-universal')).toBe('@windagency/valora-plugin-compression-universal');
	});

	it('expands a name that already has the valora-plugin- prefix', () => {
		expect(resolvePackageName('valora-plugin-rtk')).toBe('@windagency/valora-plugin-rtk');
	});

	it('leaves a full @scope/name unchanged', () => {
		expect(resolvePackageName('@windagency/valora-plugin-rtk')).toBe('@windagency/valora-plugin-rtk');
	});

	it('leaves an arbitrary third-party scoped package unchanged', () => {
		expect(resolvePackageName('@other/some-plugin')).toBe('@other/some-plugin');
	});

	it('scopes a valora- prefixed name directly without adding valora-plugin-', () => {
		expect(resolvePackageName('valora-core-product')).toBe('@windagency/valora-core-product');
	});

	it('scopes a valora-plugin- prefixed name directly', () => {
		expect(resolvePackageName('valora-plugin-core-product')).toBe('@windagency/valora-plugin-core-product');
	});
});

describe('shortNameFromPackage', () => {
	it('extracts the package name from a scoped package', () => {
		expect(shortNameFromPackage('@windagency/valora-plugin-rtk')).toBe('valora-plugin-rtk');
	});

	it('returns an unscoped package name unchanged', () => {
		expect(shortNameFromPackage('valora-plugin-rtk')).toBe('valora-plugin-rtk');
	});
});

describe('PluginInstallerService', () => {
	let tmpTarget: string;

	beforeEach(() => {
		tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-install-target-'));
	});

	afterEach(() => {
		fs.rmSync(tmpTarget, { recursive: true, force: true });
		vi.resetAllMocks();
	});

	describe('user scope', () => {
		it('invokes npm pack with the resolved package name', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['npm', 'pack', '@windagency/valora-plugin-rtk']));
		});

		it('extracts the tarball into a subdirectory of the global plugins root', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			expect(runner.run).toHaveBeenCalledWith(
				expect.arrayContaining(['-C', path.join(tmpTarget, 'valora-plugin-rtk')])
			);
		});

		it('creates the target directory when it does not already exist', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			const targetRoot = path.join(tmpTarget, 'new-dir');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(targetRoot);

			await new PluginInstallerService(makeMockRunner()).install('rtk', 'user');

			expect(fs.existsSync(path.join(targetRoot, 'valora-plugin-rtk'))).toBe(true);
		});

		it('throws when npm pack exits non-zero', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			await expect(new PluginInstallerService(makeMockRunner({ packCode: 1 })).install('rtk', 'user')).rejects.toThrow(
				'Failed to download'
			);
		});

		it('throws when npm pack produces no tarball', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const noTarballRunner: ProcessRunner = { run: vi.fn(async () => 0) };
			await expect(new PluginInstallerService(noTarballRunner).install('rtk', 'user')).rejects.toThrow('no tarball');
		});

		it('throws when tar extraction exits non-zero', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			await expect(new PluginInstallerService(makeMockRunner({ tarCode: 1 })).install('rtk', 'user')).rejects.toThrow(
				'Failed to extract'
			);
		});
	});

	describe('global scope', () => {
		it('installs to the system plugins directory, not the user directory', async () => {
			const { getSystemPluginsDir } = await import('utils/paths');
			vi.mocked(getSystemPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'global');

			expect(runner.run).toHaveBeenCalledWith(
				expect.arrayContaining(['-C', path.join(tmpTarget, 'valora-plugin-rtk')])
			);
		});

		it('installs to a different directory than user scope', async () => {
			const { getGlobalPluginsDir, getSystemPluginsDir } = await import('utils/paths');
			const systemDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-system-'));
			vi.mocked(getSystemPluginsDir).mockReturnValue(systemDir);
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			await new PluginInstallerService(makeMockRunner()).install('rtk', 'global');

			const systemTarget = path.join(systemDir, 'valora-plugin-rtk');
			const userTarget = path.join(tmpTarget, 'valora-plugin-rtk');
			expect(fs.existsSync(systemTarget)).toBe(true);
			expect(fs.existsSync(userTarget)).toBe(false);
			fs.rmSync(systemDir, { force: true, recursive: true });
		});

		it('surfaces a permission error as an elevated-privileges message', async () => {
			const { getSystemPluginsDir } = await import('utils/paths');

			// A read-only parent directory causes mkdirSync to throw EACCES for any subdirectory
			const readonlyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-readonly-'));
			fs.chmodSync(readonlyDir, 0o555);
			vi.mocked(getSystemPluginsDir).mockReturnValue(readonlyDir);

			try {
				await expect(new PluginInstallerService(makeMockRunner()).install('rtk', 'global')).rejects.toThrow(
					/elevated privileges/
				);
			} finally {
				fs.chmodSync(readonlyDir, 0o755);
				fs.rmSync(readonlyDir, { force: true, recursive: true });
			}
		});
	});

	describe('local package override via VALORA_PLUGIN_REGISTRY', () => {
		let localPackagesDir: string;
		let registryFile: string;

		beforeEach(() => {
			localPackagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-local-pkgs-'));
			const pkgDir = path.join(localPackagesDir, 'valora-plugin-rtk');
			fs.mkdirSync(pkgDir);
			fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), '{"name":"valora-plugin-rtk"}');

			registryFile = path.join(localPackagesDir, 'registry.json');
			fs.writeFileSync(
				registryFile,
				JSON.stringify([
					{
						name: 'valora-plugin-rtk',
						package: '@windagency/valora-plugin-rtk',
						path: path.join(localPackagesDir, 'valora-plugin-rtk'),
						version: '1.0.0'
					}
				])
			);
		});

		afterEach(() => {
			fs.rmSync(localPackagesDir, { recursive: true, force: true });
			delete process.env['VALORA_PLUGIN_REGISTRY'];
		});

		it('uses npm pack with the local source path from the registry entry', async () => {
			process.env['VALORA_PLUGIN_REGISTRY'] = registryFile;
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			const localPath = path.join(localPackagesDir, 'valora-plugin-rtk');
			expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['npm', 'pack', localPath]));
		});

		it('falls back to npm pack when the registry entry has no path field', async () => {
			const noPathRegistry = path.join(localPackagesDir, 'no-path-registry.json');
			fs.writeFileSync(
				noPathRegistry,
				JSON.stringify([{ name: 'valora-plugin-rtk', package: '@windagency/valora-plugin-rtk', version: '1.0.0' }])
			);
			process.env['VALORA_PLUGIN_REGISTRY'] = noPathRegistry;
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['npm', 'pack', '@windagency/valora-plugin-rtk']));
		});

		it('falls back to npm pack when the path in the registry entry does not exist on disk', async () => {
			const missingPathRegistry = path.join(localPackagesDir, 'missing-path-registry.json');
			fs.writeFileSync(
				missingPathRegistry,
				JSON.stringify([
					{
						name: 'valora-plugin-rtk',
						package: '@windagency/valora-plugin-rtk',
						path: '/nonexistent/path',
						version: '1.0.0'
					}
				])
			);
			process.env['VALORA_PLUGIN_REGISTRY'] = missingPathRegistry;
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['npm', 'pack', '@windagency/valora-plugin-rtk']));
		});
	});

	describe('uninstall', () => {
		it('removes the plugin directory from the user scope', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			const pluginDir = path.join(tmpTarget, 'valora-plugin-rtk');
			fs.mkdirSync(pluginDir, { recursive: true });
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			new PluginInstallerService(makeMockRunner()).uninstall('rtk', 'user');

			expect(fs.existsSync(pluginDir)).toBe(false);
		});

		it('throws when the plugin directory does not exist in the given scope', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			expect(() => new PluginInstallerService(makeMockRunner()).uninstall('rtk', 'user')).toThrow('not installed');
		});
	});

	describe('project scope', () => {
		it('extracts to the project plugins directory', async () => {
			const { getProjectPluginsDir } = await import('utils/paths');
			vi.mocked(getProjectPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'project');

			expect(runner.run).toHaveBeenCalledWith(
				expect.arrayContaining(['-C', path.join(tmpTarget, 'valora-plugin-rtk')])
			);
		});

		it('bootstraps .valora/plugins/ in cwd and installs there when no project dir exists', async () => {
			const { getProjectPluginsDir } = await import('utils/paths');
			vi.mocked(getProjectPluginsDir).mockReturnValue(null);

			const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-bootstrap-'));
			const originalCwd = process.cwd();
			try {
				process.chdir(projectDir);
				await new PluginInstallerService(makeMockRunner()).install('rtk', 'project');
				expect(fs.existsSync(path.join(projectDir, '.valora', 'plugins', 'valora-plugin-rtk'))).toBe(true);
			} finally {
				process.chdir(originalCwd);
				fs.rmSync(projectDir, { recursive: true, force: true });
			}
		});
	});

	describe('dependency resolution', () => {
		let tmpDepTarget: string;

		beforeEach(() => {
			tmpDepTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-dep-test-'));
		});

		afterEach(() => {
			fs.rmSync(tmpDepTarget, { recursive: true, force: true });
			vi.resetAllMocks();
		});

		it('installs required dependencies transitively', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpDepTarget);

			const runner = makeMockRunner({
				manifests: {
					'valora-plugin-a': { name: 'valora-plugin-a', version: '1.0.0', requires: ['valora-plugin-b'] },
					'valora-plugin-b': { name: 'valora-plugin-b', version: '1.0.0', requires: ['valora-plugin-c'] },
					'valora-plugin-c': { name: 'valora-plugin-c', version: '1.0.0' }
				}
			});

			await new PluginInstallerService(runner, () => false).install('valora-plugin-a', 'user');

			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-a'))).toBe(true);
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-b'))).toBe(true);
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-c'))).toBe(true);
		});

		it('skips a required dependency that is already installed in any scope', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpDepTarget);

			const runner = makeMockRunner({
				manifests: {
					'valora-plugin-a': { name: 'valora-plugin-a', version: '1.0.0', requires: ['valora-plugin-b'] }
				}
			});

			const isInstalled = (name: string) => name === 'valora-plugin-b';
			await new PluginInstallerService(runner, isInstalled).install('valora-plugin-a', 'user');

			expect(runner.packCalls).not.toContain('valora-plugin-b');
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-a'))).toBe(true);
		});

		it('rolls back the parent plugin directory when a dependency cannot be installed', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpDepTarget);

			const runner = makeMockRunner({
				manifests: {
					'valora-plugin-a': { name: 'valora-plugin-a', version: '1.0.0', requires: ['valora-plugin-b'] }
				},
				packCodeByShortName: { 'valora-plugin-b': 1 }
			});

			await expect(new PluginInstallerService(runner, () => false).install('valora-plugin-a', 'user')).rejects.toThrow(
				'Failed to download'
			);
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-a'))).toBe(false);
		});

		it('terminates without error when plugins have a circular dependency', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpDepTarget);

			const runner = makeMockRunner({
				manifests: {
					'valora-plugin-a': { name: 'valora-plugin-a', version: '1.0.0', requires: ['valora-plugin-b'] },
					'valora-plugin-b': { name: 'valora-plugin-b', version: '1.0.0', requires: ['valora-plugin-a'] }
				}
			});

			await expect(
				new PluginInstallerService(runner, () => false).install('valora-plugin-a', 'user')
			).resolves.toBeUndefined();
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-a'))).toBe(true);
			expect(fs.existsSync(path.join(tmpDepTarget, 'valora-plugin-b'))).toBe(true);
		});
	});

	describe('integrity verification', () => {
		it('aborts the install when the tarball SHA256 does not match the expected integrity', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			const wrongIntegrity = `sha256-${'A'.repeat(43)}=`;

			await expect(new PluginInstallerService(runner).install('rtk', 'user', wrongIntegrity)).rejects.toThrow(
				/integrity/i
			);
			expect(fs.existsSync(path.join(tmpTarget, 'valora-plugin-rtk'))).toBe(false);
		});

		it('proceeds when the tarball SHA256 matches the expected integrity', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			let capturedIntegrity = '';
			const runner: ProcessRunner & { packCalls: string[] } = {
				packCalls: [],
				run: vi.fn(async (argv: string[]) => {
					if (argv[0] === 'npm' && argv[1] === 'pack') {
						const destIdx = argv.indexOf('--pack-destination');
						const destDir = argv[destIdx + 1];
						const tgz = path.join(destDir, 'valora-plugin-rtk-1.0.0.tgz');
						const srcDir = fs.mkdtempSync(path.join(destDir, 'src-'));
						const pkgDir = path.join(srcDir, 'package');
						fs.mkdirSync(pkgDir);
						fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), '{}');
						child_process.spawnSync('tar', ['-czf', tgz, '-C', srcDir, 'package']);
						fs.rmSync(srcDir, { force: true, recursive: true });
						capturedIntegrity = computeTarballIntegrity(tgz);
					}
					return 0;
				})
			};

			// First call to compute the integrity that the runner will produce
			await new PluginInstallerService(runner).install('rtk', 'user');
			fs.rmSync(path.join(tmpTarget, 'valora-plugin-rtk'), { force: true, recursive: true });

			// Second call: pass the captured integrity — should succeed without throwing
			await expect(
				new PluginInstallerService(runner, () => false).install('rtk', 'user', capturedIntegrity)
			).resolves.toBeUndefined();
		});

		it('proceeds without checking when no integrity is provided (forward compat)', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);

			const runner = makeMockRunner();
			await expect(new PluginInstallerService(runner).install('rtk', 'user')).resolves.toBeUndefined();
		});

		it('warns when no integrity is provided for a registry install', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
			installerWarn.mockReset();

			const runner = makeMockRunner();
			await new PluginInstallerService(runner).install('rtk', 'user');

			const messages = installerWarn.mock.calls.map((c) => String(c[0]));
			expect(messages.some((m) => m.includes('integrity verification'))).toBe(true);
		});

		it('does not warn about integrity when the install resolves to a local source path', async () => {
			const { getGlobalPluginsDir } = await import('utils/paths');
			vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
			installerWarn.mockReset();

			const localPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-local-src-'));
			const registryFile = path.join(tmpTarget, 'local-registry.json');
			fs.writeFileSync(
				registryFile,
				JSON.stringify([{ name: 'valora-plugin-rtk', path: localPluginDir, version: '1.0.0' }])
			);
			process.env['VALORA_PLUGIN_REGISTRY'] = registryFile;

			try {
				const runner = makeMockRunner();
				await new PluginInstallerService(runner).install('rtk', 'user');

				const integrityWarns = installerWarn.mock.calls
					.map((c) => String(c[0]))
					.filter((m) => m.includes('integrity verification'));
				expect(integrityWarns).toEqual([]);
			} finally {
				delete process.env['VALORA_PLUGIN_REGISTRY'];
				fs.rmSync(localPluginDir, { force: true, recursive: true });
			}
		});
	});
});

describe('PluginInstallerService.installFromTarball', () => {
	let tmpTarget: string;

	beforeEach(() => {
		tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-tgz-target-'));
	});

	afterEach(() => {
		fs.rmSync(tmpTarget, { recursive: true, force: true });
		vi.resetAllMocks();
	});

	function makeRealTgz(dir: string, manifest: object): string {
		const pkgDir = path.join(dir, 'pkg-src', 'package');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'valora-plugin.json'), JSON.stringify(manifest));
		const tgzPath = path.join(dir, 'plugin.tgz');
		const result = child_process.spawnSync('tar', ['-czf', tgzPath, '-C', path.join(dir, 'pkg-src'), 'package']);
		if (result.status !== 0) throw new Error(`Failed to build test tgz: ${String(result.stderr)}`);
		return tgzPath;
	}

	it('extracts the tgz directly without invoking npm pack', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		const runner = makeMockRunner({ tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0' } });
		await new PluginInstallerService(runner).installFromTarball(tgzPath, 'user');

		expect(runner.run).not.toHaveBeenCalledWith(expect.arrayContaining(['npm', 'pack']));
		expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['tar', '-xf', tgzPath]));
	});

	it('passes --no-same-owner and --no-same-permissions to tar to harden extraction', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		const runner = makeMockRunner({ tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0' } });
		await new PluginInstallerService(runner).installFromTarball(tgzPath, 'user');

		expect(runner.run).toHaveBeenCalledWith(expect.arrayContaining(['--no-same-owner', '--no-same-permissions']));
	});

	it('installs to the correct scope directory using the short name from the manifest', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		const runner = makeMockRunner({ tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0' } });
		await new PluginInstallerService(runner).installFromTarball(tgzPath, 'user');

		expect(fs.existsSync(path.join(tmpTarget, 'valora-plugin-docs'))).toBe(true);
	});

	it('installs transitive dependencies declared in the manifest requires field', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		const runner = makeMockRunner({
			tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0', requires: ['valora-plugin-rtk'] },
			manifests: { 'valora-plugin-rtk': { name: 'valora-plugin-rtk', version: '1.0.0' } }
		});
		await new PluginInstallerService(runner, () => false).installFromTarball(tgzPath, 'user');

		expect(runner.packCalls).toContain('valora-plugin-rtk');
		expect(fs.existsSync(path.join(tmpTarget, 'valora-plugin-rtk'))).toBe(true);
	});

	it('throws and cleans up the staging directory when extraction fails', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		const runner = makeMockRunner({ tarCode: 1 });
		await expect(new PluginInstallerService(runner).installFromTarball(tgzPath, 'user')).rejects.toThrow(
			'Failed to extract'
		);

		const stagingDirs = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('valora-tgz-staging-'));
		expect(stagingDirs).toHaveLength(0);
	});

	it('bootstraps .valora/plugins/ in cwd when installing from tarball with project scope and no existing project dir', async () => {
		const { getProjectPluginsDir } = await import('utils/paths');
		vi.mocked(getProjectPluginsDir).mockReturnValue(null);

		const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-bootstrap-tgz-'));
		const tgzPath = makeRealTgz(projectDir, { name: 'valora-plugin-docs', version: '1.0.0' });
		const originalCwd = process.cwd();
		try {
			process.chdir(projectDir);
			const runner = makeMockRunner({ tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0' } });
			await new PluginInstallerService(runner).installFromTarball(tgzPath, 'project');
			expect(fs.existsSync(path.join(projectDir, '.valora', 'plugins', 'valora-plugin-docs'))).toBe(true);
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(projectDir, { recursive: true, force: true });
		}
	});

	it('rejects a tarball whose extracted manifest declares a path-escaping name', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		vi.mocked(getGlobalPluginsDir).mockReturnValue(tmpTarget);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		// Mock runner: extract writes a malicious manifest into the staging dir
		const runner: ProcessRunner & { packCalls: string[] } = {
			packCalls: [],
			run: vi.fn(async (argv: string[]) => {
				if (argv[0] === 'tar' && argv[1] === '-xf') {
					const cIdx = argv.indexOf('-C');
					const destDir = argv[cIdx + 1];
					if (destDir && path.basename(destDir).startsWith('valora-tgz-staging-')) {
						fs.writeFileSync(
							path.join(destDir, 'valora-plugin.json'),
							JSON.stringify({ name: '../../etc/cron.d/evil', version: '1.0.0' })
						);
					}
				}
				return 0;
			})
		};

		await expect(new PluginInstallerService(runner).installFromTarball(tgzPath, 'user')).rejects.toThrow(
			/invalid plugin name|kebab/i
		);
		// The escape target must not have been written.
		expect(fs.existsSync('/etc/cron.d/evil')).toBe(false);
	});

	it('surfaces a permission error on global scope as an elevated-privileges message', async () => {
		const { getSystemPluginsDir } = await import('utils/paths');
		const readonlyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-readonly-'));
		fs.chmodSync(readonlyDir, 0o555);
		vi.mocked(getSystemPluginsDir).mockReturnValue(readonlyDir);
		const tgzPath = makeRealTgz(tmpTarget, { name: 'valora-plugin-docs', version: '1.0.0' });

		try {
			const runner = makeMockRunner({ tgzManifest: { name: 'valora-plugin-docs', version: '1.0.0' } });
			await expect(new PluginInstallerService(runner).installFromTarball(tgzPath, 'global')).rejects.toThrow(
				/elevated privileges/
			);
		} finally {
			fs.chmodSync(readonlyDir, 0o755);
			fs.rmSync(readonlyDir, { force: true, recursive: true });
		}
	});
});
