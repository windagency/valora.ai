# Plugin Monorepo Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 10 separable Valora plugins into independent npm packages under `packages/` in a pnpm workspace, each publishable as `@windagency/valora-plugin-*`, while keeping `valora-defaults` and `valora-core-generators` bundled in the main `@windagency/valora` package.

**Architecture:** Add a pnpm workspace (`pnpm-workspace.yaml`) with a `packages/*` glob. Nine data-only plugins become pure JSON/markdown packages. One code plugin (`valora-provider-ollama`) becomes a TypeScript package with its own build pipeline; its source moves from `src/plugins-src/valora-provider-ollama/` to `packages/valora-plugin-ollama/src/`. The main package's `data/plugins/` retains only `valora-defaults` and `valora-core-generators`. Plugin manifest `name` fields (e.g. `valora-core-platform`) stay unchanged — they are the runtime identity used by `requires`, independent of npm package names.

**Tech Stack:** pnpm workspaces, TypeScript (for ollama package), JSON/Markdown (data-only packages).

**Prerequisite:** The `2026-04-19-plugin-npm-discovery.md` plan must be complete first — npm discovery is what makes installed packages visible to Valora at runtime.

---

## Plugins to extract vs. keep

| Plugin                     | npm package                              | Keep in main? |
| -------------------------- | ---------------------------------------- | ------------- |
| `valora-core-engineering`  | `@windagency/valora-plugin-engineering`  | No            |
| `valora-core-implement`    | `@windagency/valora-plugin-implement`    | No            |
| `valora-core-product`      | `@windagency/valora-plugin-product`      | No            |
| `valora-core-qa`           | `@windagency/valora-plugin-qa`           | No            |
| `valora-core-quality-gate` | `@windagency/valora-plugin-quality-gate` | No            |
| `valora-core-docs`         | `@windagency/valora-plugin-docs`         | No            |
| `valora-core-secops`       | `@windagency/valora-plugin-secops`       | No            |
| `valora-core-design`       | `@windagency/valora-plugin-design`       | No            |
| `valora-core-platform`     | `@windagency/valora-plugin-platform`     | No            |
| `valora-provider-ollama`   | `@windagency/valora-plugin-ollama`       | No            |
| `valora-defaults`          | (bundled)                                | **Yes**       |
| `valora-core-generators`   | (bundled)                                | **Yes**       |

---

## File Map

**Section 1 — Workspace setup**

| Action | Path                  |
| ------ | --------------------- |
| Create | `pnpm-workspace.yaml` |

**Section 2 — Data-only packages (9 packages)**

| Action | Path                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| Create | `packages/valora-plugin-engineering/package.json`                                 |
| Move   | `data/plugins/valora-core-engineering/` → `packages/valora-plugin-engineering/`   |
| Create | `packages/valora-plugin-implement/package.json`                                   |
| Move   | `data/plugins/valora-core-implement/` → `packages/valora-plugin-implement/`       |
| Create | `packages/valora-plugin-product/package.json`                                     |
| Move   | `data/plugins/valora-core-product/` → `packages/valora-plugin-product/`           |
| Create | `packages/valora-plugin-qa/package.json`                                          |
| Move   | `data/plugins/valora-core-qa/` → `packages/valora-plugin-qa/`                     |
| Create | `packages/valora-plugin-quality-gate/package.json`                                |
| Move   | `data/plugins/valora-core-quality-gate/` → `packages/valora-plugin-quality-gate/` |
| Create | `packages/valora-plugin-docs/package.json`                                        |
| Move   | `data/plugins/valora-core-docs/` → `packages/valora-plugin-docs/`                 |
| Create | `packages/valora-plugin-secops/package.json`                                      |
| Move   | `data/plugins/valora-core-secops/` → `packages/valora-plugin-secops/`             |
| Create | `packages/valora-plugin-design/package.json`                                      |
| Move   | `data/plugins/valora-core-design/` → `packages/valora-plugin-design/`             |
| Create | `packages/valora-plugin-platform/package.json`                                    |
| Move   | `data/plugins/valora-core-platform/` → `packages/valora-plugin-platform/`         |

**Section 3 — Code plugin package**

| Action | Path                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| Create | `packages/valora-plugin-ollama/package.json`                                              |
| Create | `packages/valora-plugin-ollama/tsconfig.json`                                             |
| Create | `packages/valora-plugin-ollama/valora-plugin.json`                                        |
| Move   | `src/plugins-src/valora-provider-ollama/*.ts` → `packages/valora-plugin-ollama/src/`      |
| Move   | `src/plugins-src/valora-provider-ollama/*.test.ts` → `packages/valora-plugin-ollama/src/` |

**Section 4 — Main package cleanup**

| Action | Path                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Delete | `data/plugins/valora-core-{engineering,implement,product,qa,quality-gate,docs,secops,design,platform}/` |
| Delete | `data/plugins/valora-provider-ollama/` (compiled artefact replaced by package)                          |
| Delete | `src/plugins-src/valora-provider-ollama/` (source moved to packages/)                                   |
| Modify | `tsconfig.plugins.json`                                                                                 |
| Modify | `.gitignore`                                                                                            |
| Modify | `vitest.config.ts`                                                                                      |

---

## Task 1: pnpm workspace setup

**Files:**

- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

Create `pnpm-workspace.yaml` at the repository root:

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Verify pnpm recognises the workspace**

```bash
pnpm list -r --depth 0 2>&1 | head -5
```

Expected: pnpm runs without error. (No packages yet — that's fine, `packages/` doesn't exist yet.)

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: initialise pnpm workspace for independent plugin packages"
```

---

## Task 2: Scaffold and populate the nine data-only plugin packages

**Files:** All `packages/valora-plugin-*/` directories (created and populated in this task).

Each data-only package has:

- `package.json` — npm metadata + `files` field
- Content moved from `data/plugins/valora-core-*/` (valora-plugin.json + subdirs)

- [ ] **Step 1: Create the `packages/` root and all nine `package.json` files**

```bash
mkdir -p packages
```

Create `packages/valora-plugin-engineering/package.json`:

```json
{
	"name": "@windagency/valora-plugin-engineering",
	"version": "1.0.0",
	"description": "Lead engineer agent and core engineering workflow commands for Valora (commit, create-pr, plan, plan-architecture, plan-implementation, review-code, review-functional, review-plan, validate-parallel, validate-plan, gather-knowledge).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-implement/package.json`:

```json
{
	"name": "@windagency/valora-plugin-implement",
	"version": "1.0.0",
	"description": "TypeScript software-engineer agent family for Valora (software-engineer-typescript, -backend, -frontend, -frontend-react) and the implement command with dynamic agent selection.",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-product/package.json`:

```json
{
	"name": "@windagency/valora-plugin-product",
	"version": "1.0.0",
	"description": "Product manager agent and discovery workflow commands for Valora (create-prd, refine-specs, refine-task, create-backlog, fetch-task, feedback).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-qa/package.json`:

```json
{
	"name": "@windagency/valora-plugin-qa",
	"version": "1.0.0",
	"description": "QA agent and testing workflow commands for Valora (test, validate-coverage, pre-check).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-quality-gate/package.json`:

```json
{
	"name": "@windagency/valora-plugin-quality-gate",
	"version": "1.0.0",
	"description": "Asserter agent and pre-testing static-assertion commands for Valora (assert).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-docs/package.json`:

```json
{
	"name": "@windagency/valora-plugin-docs",
	"version": "1.0.0",
	"description": "Documentation generation commands for Valora (generate-docs, generate-all-documentation). Requires valora-plugin-engineering for the lead agent.",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "commands"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": {
		"@windagency/valora": ">=0.1.0",
		"@windagency/valora-plugin-engineering": ">=1.0.0"
	}
}
```

Create `packages/valora-plugin-secops/package.json`:

```json
{
	"name": "@windagency/valora-plugin-secops",
	"version": "1.0.0",
	"description": "Security Operations Engineer agent for Valora (threat detection, vulnerability management, incident response). Requires valora-plugin-platform.",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": {
		"@windagency/valora": ">=0.1.0",
		"@windagency/valora-plugin-platform": ">=1.0.0"
	}
}
```

Create `packages/valora-plugin-design/package.json`:

```json
{
	"name": "@windagency/valora-plugin-design",
	"version": "1.0.0",
	"description": "UI/UX designer agent for Valora (interface design, accessibility, user experience advisory).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

Create `packages/valora-plugin-platform/package.json`:

```json
{
	"name": "@windagency/valora-plugin-platform",
	"version": "1.0.0",
	"description": "Platform Engineer agent for Valora (cloud-native architecture, Kubernetes, CI/CD, infrastructure reliability).",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"files": ["valora-plugin.json", "agents"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": { "@windagency/valora": ">=0.1.0" }
}
```

- [ ] **Step 2: Move plugin data into each package**

```bash
# Move each plugin directory; keep valora-plugin.json and all subdirs
cp -r data/plugins/valora-core-engineering/. packages/valora-plugin-engineering/
cp -r data/plugins/valora-core-implement/. packages/valora-plugin-implement/
cp -r data/plugins/valora-core-product/. packages/valora-plugin-product/
cp -r data/plugins/valora-core-qa/. packages/valora-plugin-qa/
cp -r data/plugins/valora-core-quality-gate/. packages/valora-plugin-quality-gate/
cp -r data/plugins/valora-core-docs/. packages/valora-plugin-docs/
cp -r data/plugins/valora-core-secops/. packages/valora-plugin-secops/
cp -r data/plugins/valora-core-design/. packages/valora-plugin-design/
cp -r data/plugins/valora-core-platform/. packages/valora-plugin-platform/
```

- [ ] **Step 3: Verify each package has valora-plugin.json and the right subdirs**

```bash
for pkg in engineering implement product qa quality-gate docs secops design platform; do
  echo "=== valora-plugin-$pkg ==="
  ls packages/valora-plugin-$pkg/
  echo
done
```

Expected for engineering:

```
agents  commands  package.json  valora-plugin.json
```

Expected for docs:

```
commands  package.json  valora-plugin.json
```

Expected for secops / design / platform:

```
agents  package.json  valora-plugin.json
```

- [ ] **Step 4: Verify pnpm recognises all nine packages in the workspace**

```bash
pnpm list -r --depth 0 2>&1 | grep valora-plugin
```

Expected: nine lines, one per package, e.g. `@windagency/valora-plugin-engineering 1.0.0`.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "feat: scaffold nine data-only plugin packages in pnpm workspace"
```

---

## Task 3: Extract `valora-provider-ollama` into its own TypeScript package

**Files:**

- Create: `packages/valora-plugin-ollama/package.json`
- Create: `packages/valora-plugin-ollama/tsconfig.json`
- Create: `packages/valora-plugin-ollama/valora-plugin.json`
- Move: `src/plugins-src/valora-provider-ollama/*.ts` → `packages/valora-plugin-ollama/src/`

The compiled output will go to `packages/valora-plugin-ollama/dist/` (a new location). The `codeEntrypoint` in `valora-plugin.json` changes from `"index.js"` to `"dist/index.js"` to match.

- [ ] **Step 1: Create the package directory and copy TypeScript source**

```bash
mkdir -p packages/valora-plugin-ollama/src

# Copy all TS files (source AND tests)
cp src/plugins-src/valora-provider-ollama/*.ts packages/valora-plugin-ollama/src/
```

- [ ] **Step 2: Create `packages/valora-plugin-ollama/package.json`**

```json
{
	"name": "@windagency/valora-plugin-ollama",
	"version": "1.0.0",
	"description": "Self-managed Ollama provider plugin for Valora — manages the Ollama binary and server process, supports any model available via ollama pull.",
	"keywords": ["valora-plugin"],
	"license": "UNLICENSED",
	"scripts": {
		"build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
		"prepublishOnly": "pnpm build"
	},
	"files": ["valora-plugin.json", "dist"],
	"engines": { "node": ">=22.0.0" },
	"peerDependencies": {
		"@windagency/valora": ">=0.1.0",
		"openai": ">=4.0.0"
	},
	"devDependencies": {
		"openai": "catalog:"
	}
}
```

- [ ] **Step 3: Create `packages/valora-plugin-ollama/tsconfig.json`**

This extends the root tsconfig so that path aliases (`plugins/*`, `types/*`, etc.) resolve to the workspace root's `src/` directories. TypeScript resolves path aliases from the location of the tsconfig that defines them — so inheriting them from `../../tsconfig.json` keeps them pointing at `../../src/*`.

```json
{
	"extends": "../../tsconfig.json",
	"compilerOptions": {
		"declaration": false,
		"module": "ESNext",
		"moduleResolution": "bundler",
		"outDir": "dist",
		"rootDir": "src",
		"sourceMap": false
	},
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist", "src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

- [ ] **Step 4: Create `packages/valora-plugin-ollama/valora-plugin.json`**

Same as the current manifest but with `codeEntrypoint` updated to `"dist/index.js"`:

```json
{
	"name": "valora-provider-ollama",
	"version": "1.0.0",
	"description": "Self-managed Ollama provider — downloads the Ollama binary on first use and runs it locally. Supports any model available via ollama pull.",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code"],
	"permissions": ["code-exec", "fs-write", "network"],
	"codeEntrypoint": "dist/index.js"
}
```

- [ ] **Step 5: Build the package to confirm TypeScript compilation succeeds**

```bash
pnpm --filter @windagency/valora-plugin-ollama build
```

Expected: `packages/valora-plugin-ollama/dist/` is created with `index.js`, `binary-manager.js`, `model-manager.js`, `ollama-provider.js`, `process-manager.js`. Zero TypeScript errors.

- [ ] **Step 6: Add `dist/` to `.gitignore` for the ollama package**

Append to `.gitignore`:

```
# valora-plugin-ollama compiled output (published from dist/, not committed)
packages/valora-plugin-ollama/dist/
```

- [ ] **Step 7: Commit**

```bash
git add packages/valora-plugin-ollama/ .gitignore
git commit -m "feat: extract valora-provider-ollama into standalone @windagency/valora-plugin-ollama package"
```

---

## Task 4: Clean up the main package

Remove the moved plugins from `data/plugins/`, remove the ollama source from `src/plugins-src/`, and update build config.

- [ ] **Step 1: Delete the nine moved data-only plugin directories from `data/plugins/`**

```bash
rm -rf \
  data/plugins/valora-core-engineering \
  data/plugins/valora-core-implement \
  data/plugins/valora-core-product \
  data/plugins/valora-core-qa \
  data/plugins/valora-core-quality-gate \
  data/plugins/valora-core-docs \
  data/plugins/valora-core-secops \
  data/plugins/valora-core-design \
  data/plugins/valora-core-platform
```

- [ ] **Step 2: Delete the compiled ollama artefacts from `data/plugins/`**

```bash
rm -rf data/plugins/valora-provider-ollama
```

This directory contained compiled JS output. It is now replaced by `packages/valora-plugin-ollama/dist/`.

- [ ] **Step 3: Delete the ollama TypeScript source from `src/plugins-src/`**

```bash
rm -rf src/plugins-src/valora-provider-ollama
```

The source now lives in `packages/valora-plugin-ollama/src/`.

- [ ] **Step 4: Verify `data/plugins/` contains only the two bundled plugins**

```bash
ls data/plugins/
```

Expected:

```
valora-core-generators  valora-defaults
```

- [ ] **Step 5: Verify `src/plugins-src/` is now empty**

```bash
ls src/plugins-src/ 2>/dev/null || echo "empty or gone"
```

Expected: `empty or gone` (or just the directory exists with no files).

- [ ] **Step 6: Update `tsconfig.plugins.json`**

The `build:plugins` script in `package.json` already guards with `[ -d src/plugins-src ] && ...`, so no script change is needed. But `tsconfig.plugins.json` still references `src/plugins-src` as `rootDir`. Update it to avoid confusion when the directory is empty:

Replace `tsconfig.plugins.json`:

```json
{
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"declaration": false,
		"module": "ESNext",
		"moduleResolution": "bundler",
		"outDir": "data/plugins",
		"rootDir": "src/plugins-src",
		"sourceMap": false
	},
	"exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"],
	"include": ["src/plugins-src/**/*"]
}
```

No change needed to the content — the guard in `build:plugins` (`[ -d src/plugins-src ] && ...`) already skips the build when the directory is absent. The tsconfig file can remain as-is for future plugins that may be added to `src/plugins-src/`. Leave it unchanged.

- [ ] **Step 7: Update `.gitignore` — remove the old ollama compiled output entry**

The old entry was:

```
data/plugins/valora-provider-ollama/index.js
data/plugins/valora-provider-ollama/*.js.map
```

Remove those two lines from `.gitignore` (they refer to paths that no longer exist). The new entry added in Task 3 Step 6 covers the new location.

Open `.gitignore`, find and remove:

```
data/plugins/valora-provider-ollama/index.js
data/plugins/valora-provider-ollama/*.js.map
```

- [ ] **Step 8: Update `vitest.config.ts` to include package tests**

In `vitest.config.ts`, find the `include` array (currently `["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"]`) and add the packages glob:

```typescript
include: [
  'src/**/*.{test,spec}.ts',
  'tests/**/*.{test,spec}.ts',
  'packages/**/*.{test,spec}.ts'
],
```

- [ ] **Step 9: Run the full test suite to confirm nothing broke**

```bash
pnpm test
```

Expected: same result as before (2 pre-existing failures in `config-file-integration.test.ts`). The ollama plugin tests now run from `packages/valora-plugin-ollama/src/`. All other tests continue to pass.

- [ ] **Step 10: Commit**

```bash
git add data/plugins/ src/plugins-src/ .gitignore vitest.config.ts tsconfig.plugins.json
git commit -m "chore: remove extracted plugins from main package data/plugins and src/plugins-src"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                                              | Covered by                 |
| ------------------------------------------------------------------------ | -------------------------- |
| pnpm workspace recognises `packages/*`                                   | Task 1                     |
| 9 data-only packages with `package.json` + data files                    | Task 2                     |
| Each package has `valora-plugin.json` from original bundle               | Task 2 Step 2              |
| `valora-plugin-secops` declares `valora-plugin-platform` as peer         | Task 2 Step 1              |
| `valora-plugin-docs` declares `valora-plugin-engineering` as peer        | Task 2 Step 1              |
| `valora-plugin-ollama` has TS source in `src/`, output in `dist/`        | Task 3                     |
| `codeEntrypoint` updated from `"index.js"` to `"dist/index.js"`          | Task 3 Step 4              |
| Ollama `tsconfig.json` extends root to inherit path aliases              | Task 3 Step 3              |
| Ollama `dist/` gitignored                                                | Task 3 Step 6              |
| `valora-defaults` and `valora-core-generators` stay in main              | Task 4 Step 4 verification |
| Main package `data/plugins/` contains only 2 bundled plugins             | Task 4 Step 4              |
| `src/plugins-src/` cleaned up                                            | Task 4 Steps 3 & 5         |
| Old gitignore entries for `data/plugins/valora-provider-ollama/` removed | Task 4 Step 7              |
| `vitest.config.ts` includes `packages/**/*.{test,spec}.ts`               | Task 4 Step 8              |
| Full test suite passes                                                   | Task 4 Step 9              |

**Placeholder scan:** None found.

**Type consistency:** `valora-plugin.json` manifest `name` fields are unchanged throughout — `valora-core-engineering`, `valora-core-platform`, etc. remain the runtime plugin identities. npm package names (`@windagency/valora-plugin-*`) are the distribution identities and live only in `package.json`.

**Potential regression — arch-unit tests:** Run `grep -rn "data/plugins/valora-core" src/ tests/ --include="*.ts"` after Task 4. If any test references the old paths, update those strings to the new package locations.
