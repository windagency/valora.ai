# Compression Plugin Design

## Goal

Extract the output compression strategies from core into three in-tree plugin packages, expose a `compression.registerStrategy` surface on `PluginAPI`, and leave the two call sites in `tool-execution.service.ts` completely unchanged.

## Architecture

### Core after extraction

`src/executor/output-compression.service.ts` retains four responsibilities:

1. **Registry** — `registerStrategy`, `getStrategy`, `resetRegistry`, and the first-wins guard
2. **Pure utilities** — `stripAnsiCodes`, `truncateTerminalOutput`
3. **Dispatch** — `compressTerminalOutput` reads from the registry instead of the deleted `TOOL_FILTERS` map
4. **Stats** — `getCompressionStats`, `resetCompressionStats` (unchanged)

The `TOOL_FILTERS` record and all 13 filter functions (`filterGit`, `filterTsc`, `filterEslint`, `filterTestRunner`, `filterPackageManager`, `filterRg`, `filterDocker`, `filterMake`, `filterCargo`, `filterPython`) are deleted from core entirely.

### Three in-tree plugins

Source lives in `src/plugins-src/` and is compiled by `tsconfig.plugins.json` to `data/plugins/`:

```
src/plugins-src/
  valora-plugin-compression-universal/    git, grep/rg, docker, make
  valora-plugin-compression-typescript/   tsc, eslint, jest, vitest, pnpm, npm, yarn, npx
  valora-plugin-compression-python/       python, pytest

data/plugins/                             ← compiled output (gitignored JS)
  valora-plugin-compression-universal/
  valora-plugin-compression-typescript/
  valora-plugin-compression-python/
```

Cargo/Rust is deferred to a future `valora-plugin-compression-rust`.

Shipping as in-tree `data/plugins/` entries (rather than separate npm packages) is deliberate: `data/plugins/` is discovered before user plugins (`~/.valora/plugins/`, `.valora/plugins/`) and npm-installed plugins, so built-in strategies are always registered first — which is the security mechanism (see Security section).

Each plugin has:

- `valora-plugin.json` — `contributes: ["code"]`, `permissions: ["code-exec"]`, `codeEntrypoint: "index.js"`
- `src/strategies.ts` — the extracted pure filter functions
- `src/strategies.test.ts` — unit tests per strategy (relocated from `output-compression.service.test.ts`)
- `src/index.ts` — `register(api)` calls `api.compression.registerStrategy` once per strategy
- `src/index.test.ts` — verifies `register(api)` calls the API for every declared tool key

`valora-plugin-compression-typescript` declares `"requires": ["valora-plugin-compression-universal"]` in its manifest. `valora-plugin-compression-python` is independent.

### `PluginAPI` extension

`src/plugins/plugin-api.types.ts` gains one new namespace:

```typescript
compression: {
    registerStrategy(tool: string, fn: CompressionStrategy): void;
}
```

`src/plugins/plugin-api.factory.ts` wires it to core's `registerStrategy`. No special flag — the factory calls `registerStrategy(tool, fn)` identically for all plugins.

## Components

### Registry (`src/executor/output-compression.service.ts`)

```typescript
export type CompressionStrategy = (output: string, command: string) => string;

const registry = new Map<string, CompressionStrategy>();

export function registerStrategy(tool: string, fn: CompressionStrategy): void {
	if (registry.has(tool)) return; // first registered wins
	registry.set(tool, fn);
}

export function getStrategy(tool: string): CompressionStrategy | undefined {
	return registry.get(tool);
}

export function resetRegistry(): void {
	registry.clear();
}
```

`compressTerminalOutput` replaces `applyFilter(tool, clean, command)` with:

```typescript
const strategy = registry.get(tool);
const compressed = strategy
	? (() => {
			try {
				return strategy(clean, command);
			} catch {
				return clean;
			}
		})()
	: clean;
```

### `PluginAPI` factory addition (`src/plugins/plugin-api.factory.ts`)

```typescript
compression: {
    registerStrategy(tool: string, fn: CompressionStrategy) {
        registerStrategy(tool, fn);
    }
}
```

### Plugin entry point (same shape for all three)

```typescript
// src/plugins-src/valora-plugin-compression-universal/src/index.ts
import type { PluginAPI } from 'plugins/plugin-api.types';
import { filterGit, filterDocker, filterMake, filterRg } from './strategies';

export async function register(api: PluginAPI): Promise<void> {
	api.compression.registerStrategy('git', filterGit);
	api.compression.registerStrategy('docker', filterDocker);
	api.compression.registerStrategy('make', filterMake);
	api.compression.registerStrategy('grep', filterRg);
	api.compression.registerStrategy('rg', filterRg);
}
```

## Data Flow

### Registration (startup)

```
initializePlugins()
  └─ for each plugin with codeEntrypoint (topological order):
       import(plugin.codeEntrypoint)
         └─ register(api)
              └─ api.compression.registerStrategy('git', filterGit)
              └─ ...
                   └─ registerStrategy(tool, fn)
                        └─ if (!registry.has(tool)) registry.set(tool, fn)
```

Load order: `data/plugins/` → `~/.valora/plugins/` → `.valora/plugins/` → npm-discovered.
The three compression plugins (all in `data/plugins/`) always register before any user or third-party plugin. The first-wins guard then protects their strategies for the remainder of the process lifetime.

`valora-plugin-compression-typescript` declares `requires: ["valora-plugin-compression-universal"]`, so the topological sort guarantees universal strategies are registered before TypeScript ones. The three plugins have disjoint tool key sets, so no ordering conflicts exist between them.

### Per tool call

```
compressTerminalOutput(command, output)        ← signature unchanged
  ├─ stripAnsiCodes(output)
  ├─ threshold check → pass-through if short
  ├─ firstToken(command) → tool key
  ├─ registry.get(tool)
  │    ├─ found  → try { strategy(clean, command) } catch { return clean }
  │    └─ absent → clean (pass-through, e.g. bazel, gradle)
  └─ truncateTerminalOutput(result)
```

The two call sites in `tool-execution.service.ts` (lines 1615, 1630) are untouched.

## Error Handling

| Scenario                          | Behaviour                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Strategy throws                   | `catch` in `compressTerminalOutput` returns uncompressed-but-ANSI-stripped output; logs `warn` with tool name and error message |
| Plugin `register()` throws        | Existing `catch` in `initializePlugins` logs `warn` and continues — no strategies from that plugin are registered               |
| Duplicate tool key (any plugin)   | `registerStrategy` is a no-op for already-registered keys; first registered wins silently                                       |
| No strategy registered for a tool | Output passes through ANSI-stripped and truncated — same behaviour as today for unknown commands                                |

## Security

The `code-exec` permission gate in `resolveCodeEntrypoint` is the primary security boundary — only plugins that declare this permission receive a `PluginAPI` instance.

The **first-wins guard** is the protection mechanism for built-in strategies: since `data/plugins/` is scanned before all other roots, the three compression plugins always register their tool keys first. Any later plugin attempting to register the same key (`git`, `tsc`, etc.) receives a silent no-op.

Compression strategies sit between the credential guard and the LLM context window. The credential guard (`credentialGuard.scanOutput`) always runs before `compressTerminalOutput`, so strategies never see raw credentials. The `try/catch` wrapper prevents a misbehaving strategy from disrupting the pipeline.

A third-party plugin can only register strategies for tool keys that the three built-in plugins do not cover — a narrow, explicitly additive capability.

## Testing

| Layer                                                                | Scope                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/executor/output-compression.service.test.ts`                    | Registry unit tests: `registerStrategy` first-wins, `resetRegistry`, strategy-throws fallback, `compressTerminalOutput` with mocked registry |
| `src/plugins-src/valora-plugin-compression-*/src/strategies.test.ts` | Per-strategy unit tests (relocated from the existing `output-compression.service.test.ts`)                                                   |
| `src/plugins-src/valora-plugin-compression-*/src/index.test.ts`      | Verifies `register(api)` calls `api.compression.registerStrategy` for every declared tool key                                                |
| `src/di/container.code-plugin.test.ts` (extended)                    | Integration fixture: minimal plugin registers a strategy; asserts it is retrievable via `getStrategy()` after `initializePlugins`            |

`resetRegistry()` is called in `afterEach` in any test that writes to the registry directly.

## Files Changed / Created

**Core — modified**

| File                                              | Change                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/executor/output-compression.service.ts`      | Delete `TOOL_FILTERS` and all 13 filter functions; add registry (`registerStrategy`, `getStrategy`, `resetRegistry`); update `compressTerminalOutput` dispatch |
| `src/plugins/plugin-api.types.ts`                 | Add `compression` namespace to `PluginAPI`; export `CompressionStrategy` type                                                                                  |
| `src/plugins/plugin-api.factory.ts`               | Wire `compression.registerStrategy` to core registry                                                                                                           |
| `src/executor/output-compression.service.test.ts` | Replace strategy tests with registry tests; keep stats, ANSI, truncation tests                                                                                 |
| `tsconfig.plugins.json`                           | Add the three new plugin source dirs to `include`                                                                                                              |
| `.gitignore`                                      | Add `data/plugins/valora-plugin-compression-*/` compiled output                                                                                                |

**Core — unchanged**

- `src/executor/tool-execution.service.ts` (two call sites untouched)
- `src/executor/stage-executor.ts`
- `src/di/container.ts`
- `src/plugins/plugin-loader.service.ts`

**New in-tree plugin source**

| Path                                                    | Tools covered                                   |
| ------------------------------------------------------- | ----------------------------------------------- |
| `src/plugins-src/valora-plugin-compression-universal/`  | git (diff/log/status), grep, rg, docker, make   |
| `src/plugins-src/valora-plugin-compression-typescript/` | tsc, eslint, jest, vitest, pnpm, npm, npx, yarn |
| `src/plugins-src/valora-plugin-compression-python/`     | python, pytest                                  |

Each contains: `valora-plugin.json`, `src/strategies.ts`, `src/strategies.test.ts`, `src/index.ts`, `src/index.test.ts`.
