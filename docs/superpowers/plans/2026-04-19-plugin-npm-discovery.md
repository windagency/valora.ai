# Plugin npm Discovery + `requires` Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Valora to automatically discover plugins installed as `@windagency/valora-plugin-*` npm packages from `node_modules`, and enforce `requires` dependency ordering between plugins.

**Architecture:** Two independent changes to the plugin system. (1) `PluginDiscoveryService` gains a fourth discovery root that scans `<cwd>/node_modules/@windagency/valora-plugin-*` for `valora-plugin.json` files, with the `cwd` injected for testability. (2) `PluginLoaderService.loadAll()` passes discovered plugins through a topological sort driven by the `requires` field in each manifest, warning when a required plugin is absent and gracefully skipping cycles.

**Tech Stack:** TypeScript, Vitest, Node.js `fs` module (existing).

---

## Context

- Three existing discovery roots (built-in, global `~/.valora/plugins/`, project `.valora/plugins/`) are in `src/plugins/plugin-discovery.service.ts`.
- `src/plugins/plugin-loader.service.ts:32–37` — `loadAll()` maps discovered dirs through `loadPlugin()`.
- `requires` is already parsed from `valora-plugin.json` into `LoadedPlugin.manifest.requires?: string[]` but is never read after parsing.
- Only one plugin currently declares `requires`: `valora-core-secops` requires `valora-core-platform`.
- Plugin manifest `name` (e.g. `valora-core-platform`) is the runtime identity used in `requires` — it is **separate** from the npm package name (`@windagency/valora-plugin-platform`).

---

## File Map

| Action | Path                                           |
| ------ | ---------------------------------------------- |
| Modify | `src/plugins/plugin-discovery.service.ts`      |
| Create | `src/plugins/plugin-discovery.service.test.ts` |
| Modify | `src/plugins/plugin-loader.service.ts`         |
| Modify | `src/plugins/plugin-loader.service.test.ts`    |

---

## Task 1: `requires` validation and topological sort in `PluginLoaderService`

**Files:**

- Modify: `src/plugins/plugin-loader.service.ts`
- Modify: `src/plugins/plugin-loader.service.test.ts`

- [ ] **Step 1: Write failing tests for dependency ordering**

In `src/plugins/plugin-loader.service.test.ts`, add a new describe block after the last existing one:

```typescript
describe('PluginLoaderService — requires dependency ordering', () => {
	let tmpDirA: string;
	let tmpDirB: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-req-test-a-'));
		tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-req-test-b-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDirA, tmpDirB]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDirA, { recursive: true, force: true });
		fs.rmSync(tmpDirB, { recursive: true, force: true });
	});

	it('loads dependency before dependent when requires is declared', () => {
		// tmpDirA is discovered first but requires tmpDirB — must be reordered
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0'
		});

		const plugins = loader.loadAll();
		const names = plugins.map((p) => p.manifest.name);

		expect(names.indexOf('plugin-b')).toBeLessThan(names.indexOf('plugin-a'));
	});

	it('loads all plugins when requires is satisfied', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0'
		});

		const plugins = loader.loadAll();
		expect(plugins).toHaveLength(2);
	});

	it('still loads the dependent plugin when required plugin is absent (with warning)', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-missing']
		});

		const plugins = loader.loadAll();

		// plugin-a still loads despite missing dep
		expect(plugins).toHaveLength(1);
		expect(plugins[0]?.manifest.name).toBe('plugin-a');
	});

	it('does not throw on a dependency cycle', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0',
			requires: ['plugin-a']
		});

		expect(() => loader.loadAll()).not.toThrow();
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm exec vitest run src/plugins/plugin-loader.service.test.ts
```

Expected: 4 new tests fail because `loadAll()` does no ordering.

- [ ] **Step 3: Add `sortByDependencies` to `PluginLoaderService`**

In `src/plugins/plugin-loader.service.ts`, replace `loadAll`:

```typescript
loadAll(config?: PluginsConfig): LoadedPlugin[] {
	const loaded = this.discovery
		.discoverPluginDirs()
		.map((pluginDir) => this.loadPlugin(pluginDir, config))
		.filter((plugin): plugin is LoadedPlugin => plugin !== null);
	return this.sortByDependencies(loaded);
}
```

Then add this private method after `loadPlugin` (before `isEnabled`):

```typescript
private sortByDependencies(plugins: LoadedPlugin[]): LoadedPlugin[] {
	const byName = new Map(plugins.map((p) => [p.manifest.name, p]));

	for (const plugin of plugins) {
		for (const dep of plugin.manifest.requires ?? []) {
			if (!byName.has(dep)) {
				this.logger.warn(`Plugin "${plugin.manifest.name}" requires "${dep}" which is not loaded`);
			}
		}
	}

	const sorted: LoadedPlugin[] = [];
	const visited = new Set<string>();
	const inStack = new Set<string>();

	const visit = (name: string): void => {
		if (visited.has(name)) return;
		if (inStack.has(name)) {
			this.logger.warn(`Plugin dependency cycle detected at: ${name}`);
			return;
		}
		inStack.add(name);
		const plugin = byName.get(name);
		if (plugin) {
			for (const dep of plugin.manifest.requires ?? []) {
				visit(dep);
			}
			sorted.push(plugin);
		}
		inStack.delete(name);
		visited.add(name);
	};

	for (const plugin of plugins) {
		visit(plugin.manifest.name);
	}

	return sorted;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm exec vitest run src/plugins/plugin-loader.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
pnpm test
```

Expected: same result as before (2 pre-existing failures in `config-file-integration.test.ts`, zero new failures).

- [ ] **Step 6: Commit**

```bash
git add src/plugins/plugin-loader.service.ts src/plugins/plugin-loader.service.test.ts
git commit -m "feat: sort plugins by requires dependency order with cycle and missing-dep warnings"
```

---

## Task 2: npm package auto-discovery in `PluginDiscoveryService`

**Files:**

- Modify: `src/plugins/plugin-discovery.service.ts`
- Create: `src/plugins/plugin-discovery.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/plugins/plugin-discovery.service.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginDiscoveryService } from './plugin-discovery.service';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

// Silence the built-in / global / project root scanning — they don't exist in test tmpDirs
vi.mock('utils/paths', () => ({
	getGlobalPluginsDir: vi.fn(() => '/nonexistent/global'),
	getPackagePluginsDir: vi.fn(() => '/nonexistent/builtin'),
	getProjectPluginsDir: vi.fn(() => undefined)
}));

function writeJson(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

describe('PluginDiscoveryService — npm plugin discovery', () => {
	let tmpDir: string;
	let discovery: PluginDiscoveryService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-discovery-test-'));
		discovery = new PluginDiscoveryService(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('discovers a valid plugin from node_modules/@windagency/valora-plugin-*', () => {
		const pluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), {
			name: 'valora-core-engineering',
			version: '1.0.0'
		});

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).toContain(pluginDir);
	});

	it('ignores packages in the scope that lack valora-plugin.json', () => {
		const nonPluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-empty');
		fs.mkdirSync(nonPluginDir, { recursive: true });
		// No valora-plugin.json written

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).not.toContain(nonPluginDir);
	});

	it('ignores packages in the scope not prefixed with valora-plugin-', () => {
		const nonPluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'some-other-package');
		writeJson(path.join(nonPluginDir, 'valora-plugin.json'), {
			name: 'some-other-package',
			version: '1.0.0'
		});

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).not.toContain(nonPluginDir);
	});

	it('returns empty array (not throws) when node_modules/@windagency does not exist', () => {
		// tmpDir has no node_modules at all
		expect(() => discovery.discoverPluginDirs()).not.toThrow();
	});

	it('discovers multiple plugins from the same scope directory', () => {
		const pluginDirA = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		const pluginDirB = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-qa');
		writeJson(path.join(pluginDirA, 'valora-plugin.json'), { name: 'valora-core-engineering', version: '1.0.0' });
		writeJson(path.join(pluginDirB, 'valora-plugin.json'), { name: 'valora-core-qa', version: '1.0.0' });

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).toContain(pluginDirA);
		expect(dirs).toContain(pluginDirB);
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm exec vitest run src/plugins/plugin-discovery.service.test.ts
```

Expected: fails — `PluginDiscoveryService` constructor doesn't accept a `cwd` argument yet.

- [ ] **Step 3: Update `PluginDiscoveryService`**

Replace the full content of `src/plugins/plugin-discovery.service.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getPackagePluginsDir, getProjectPluginsDir } from 'utils/paths';

import { PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

const NPM_PACKAGE_SCOPE = '@windagency';
const NPM_PLUGIN_PREFIX = 'valora-plugin-';

export class PluginDiscoveryService {
	private readonly logger = getLogger();

	constructor(private readonly cwd = process.cwd()) {}

	/**
	 * Discover all plugin directories from the standard search locations plus
	 * any @windagency/valora-plugin-* packages installed in node_modules.
	 *
	 * Precedence (lowest to highest): built-in → global user → project → npm.
	 * All discovered dirs are returned; filtering by enabled list is handled by the loader.
	 */
	discoverPluginDirs(): string[] {
		const standard = this.buildSearchRoots().flatMap((root) => this.scanPluginRoot(root));
		const npm = this.discoverNpmPluginDirs();
		return [...standard, ...npm];
	}

	private buildSearchRoots(): string[] {
		const builtIn = getPackagePluginsDir();
		const global = getGlobalPluginsDir();
		const project = getProjectPluginsDir();

		return [builtIn, global, ...(project ? [project] : [])].filter((dir) => fs.existsSync(dir));
	}

	private discoverNpmPluginDirs(): string[] {
		const scopeDir = path.join(this.cwd, 'node_modules', NPM_PACKAGE_SCOPE);
		if (!fs.existsSync(scopeDir)) return [];

		try {
			return fs
				.readdirSync(scopeDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && entry.name.startsWith(NPM_PLUGIN_PREFIX))
				.map((entry) => path.join(scopeDir, entry.name))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			this.logger.warn('Failed to scan npm plugin scope', { error: (error as Error).message });
			return [];
		}
	}

	private scanPluginRoot(rootDir: string): string[] {
		const resolvedRoot = path.resolve(rootDir);
		try {
			return fs
				.readdirSync(rootDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.resolve(rootDir, entry.name))
				.filter((pluginDir) => pluginDir.startsWith(resolvedRoot + path.sep))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			this.logger.warn(`Failed to scan plugin root: ${rootDir}`, { error: (error as Error).message });
			return [];
		}
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm exec vitest run src/plugins/plugin-discovery.service.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: same result as before (2 pre-existing failures in `config-file-integration.test.ts`, zero new failures).

- [ ] **Step 6: Commit**

```bash
git add src/plugins/plugin-discovery.service.ts src/plugins/plugin-discovery.service.test.ts
git commit -m "feat: auto-discover @windagency/valora-plugin-* npm packages from node_modules"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                                  | Covered by                           |
| ------------------------------------------------------------ | ------------------------------------ |
| Discover `@windagency/valora-plugin-*` from `node_modules`   | Task 2                               |
| Ignore packages without `valora-plugin.json`                 | Task 2 Step 1 (test 2)               |
| Ignore packages not prefixed `valora-plugin-`                | Task 2 Step 1 (test 3)               |
| No throw when `node_modules/@windagency` absent              | Task 2 Step 1 (test 4)               |
| npm plugins appended after standard roots (lower precedence) | Task 2 Step 3 (return order)         |
| `cwd` injectable for test isolation                          | Task 2 Step 3 (constructor param)    |
| Topological sort by `requires`                               | Task 1                               |
| Warning when required plugin not loaded                      | Task 1 Step 3 (`sortByDependencies`) |
| Warning on cycle, no throw                                   | Task 1 Step 3                        |
| Missing dep: dependent still loads                           | Task 1 Step 1 (test 3)               |

**Placeholder scan:** None found.

**Type consistency:** `LoadedPlugin[]` flows unchanged through `sortByDependencies`. `plugin.manifest.requires` is `string[] | undefined`, already typed correctly in `PluginManifest`.
