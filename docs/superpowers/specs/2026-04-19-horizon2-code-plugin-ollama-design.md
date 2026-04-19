# Horizon 2: Code-Plugin Contract + `valora-provider-ollama` Pilot

## Goal

Extend the Valora plugin system to support code contributions (TypeScript/JS entry points loaded via dynamic `import()`), then validate the contract by shipping a self-managed Ollama LLM provider as the first built-in code plugin.

---

## Scope

Two sub-projects, designed together and implemented sequentially:

1. **Code-plugin contract** — core infrastructure changes enabling `contributes: ["code"]` plugins with a restricted `PluginAPI` sandbox.
2. **`valora-provider-ollama`** — the pilot plugin that downloads the Ollama binary, manages the `ollama serve` lifecycle, and registers as a first-class LLM provider.

Both sub-projects are implemented on the `dev` branch as part of Horizon 2. Once proven, the contract enables all remaining Tier 2 candidates (output compression, LLM providers, CLI presenters, memory, batch, worktrees, LSP, dynamic agent selection).

---

## Architecture

### Overview

```
Valora core
├── src/plugins/plugin-manifest.schema.ts   ← add "code" contribution + "code-exec" permission
├── src/plugins/plugin-loader.service.ts    ← resolve codeEntrypoint field
├── src/plugins/plugin-api.factory.ts       ← NEW: creates restricted PluginAPI sandbox per plugin
├── src/types/plugin.types.ts              ← add codeEntrypoint?: string to LoadedPlugin
├── src/di/container.ts                    ← initializePlugins: dynamic import + register(api)
└── src/llm/registry.ts                    ← expose ProviderFactory type

Plugin source (compiled into plugin dir)
├── src/plugins-src/valora-provider-ollama/
│   ├── index.ts                           ← register(api) entry point
│   ├── binary-manager.ts                  ← download + verify Ollama binary
│   ├── process-manager.ts                 ← spawn/stop ollama serve
│   ├── model-manager.ts                   ← ollama pull <model>
│   └── ollama-provider.ts                 ← extends BaseLLMProvider

Plugin data dir (compiled output + manifest)
└── data/plugins/valora-provider-ollama/
    ├── valora-plugin.json
    └── index.js                           ← compiled, gitignored
```

---

## Section 1: Code-Plugin Contract

### 1.1 Manifest Schema Changes

**File:** `src/plugins/plugin-manifest.schema.ts`

Add `"code"` to `PLUGIN_CONTRIBUTION_TYPE_SCHEMA`:

```typescript
export const PLUGIN_CONTRIBUTION_TYPE_SCHEMA = z.enum([
	'agent-context',
	'agents',
	'code',
	'commands',
	'hooks',
	'mcps',
	'prompts',
	'templates'
]);
```

Add `"code-exec"` to `PLUGIN_PERMISSION_SCHEMA`:

```typescript
export const PLUGIN_PERMISSION_SCHEMA = z.enum([
	'code-exec',
	'fs-read',
	'fs-write',
	'mcp-connect',
	'network',
	'shell-hooks'
]);
```

Add optional `codeEntrypoint` to the manifest Zod schema:

```typescript
codeEntrypoint: z.string().optional();
```

### 1.2 `LoadedPlugin` Type

**File:** `src/types/plugin.types.ts`

Add to `LoadedPlugin` interface (alphabetically):

```typescript
codeEntrypoint?: string;
```

### 1.3 Plugin Loader — `resolveContribDirs`

**File:** `src/plugins/plugin-loader.service.ts`

Add `codeEntrypoint` resolution alongside the existing contribution types:

```typescript
const hasCodeExecPermission = manifest.permissions?.includes('code-exec') ?? false;
const entrypoint = manifest.codeEntrypoint ? path.join(pluginDir, manifest.codeEntrypoint) : undefined;

return {
	// ... existing fields
	...(contrib.includes('code') &&
		hasCodeExecPermission &&
		entrypoint &&
		fs.existsSync(entrypoint) && { codeEntrypoint: entrypoint })
};
```

### 1.4 `PluginAPI` Interface

**File:** `src/plugins/plugin-api.types.ts` (new)

```typescript
import type { ZodTypeAny } from 'zod';
import type { Logger } from 'output/logger';

export type ProviderFactory = (config: Record<string, unknown>) => import('llm/provider.interface').LLMProvider;

export interface PluginLifecycleHooks {
	onActivate: (fn: () => Promise<void>) => void;
	onDeactivate: (fn: () => Promise<void>) => void;
}

export interface PluginAPI {
	providers: {
		register(name: string, factory: ProviderFactory): void;
	};
	config: {
		extend(schema: ZodTypeAny): void;
	};
	lifecycle: PluginLifecycleHooks;
	logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>;
}

export interface CodePluginModule {
	register(api: PluginAPI): void | Promise<void>;
}
```

### 1.5 `PluginAPI` Factory

**File:** `src/plugins/plugin-api.factory.ts` (new)

Creates a restricted, plugin-scoped `PluginAPI` from the DI container:

```typescript
import type { DIContainer } from 'di/container';
import type { LoadedPlugin } from 'types/plugin.types';
import type { PluginAPI } from './plugin-api.types';
import { getLogger } from 'output/logger';
import { getProviderRegistry } from 'llm/registry';
import { SERVICE_IDENTIFIERS } from 'di/service-identifiers';

export interface PluginLifecycleRegistry {
	activateHooks: Array<() => Promise<void>>;
	deactivateHooks: Array<() => Promise<void>>;
}

export function createPluginAPI(
	container: DIContainer,
	plugin: LoadedPlugin,
	lifecycleRegistry: PluginLifecycleRegistry
): PluginAPI {
	const logger = getLogger().child({ plugin: plugin.manifest.name });

	return {
		providers: {
			register(name, factory) {
				getProviderRegistry().registerProvider(name, factory);
			}
		},
		config: {
			extend(_schema) {
				// Config extension is recorded for future use; Zod merge applied at config load time
				// Full implementation deferred to a follow-up spec
			}
		},
		lifecycle: {
			onActivate(fn) {
				lifecycleRegistry.activateHooks.push(fn);
			},
			onDeactivate(fn) {
				lifecycleRegistry.deactivateHooks.push(fn);
			}
		},
		logger
	};
}
```

### 1.6 `initializePlugins` — Dynamic Import

**File:** `src/di/container.ts`

After the existing contribution wiring, add:

```typescript
const lifecycleRegistries = new Map<string, PluginLifecycleRegistry>();

for (const plugin of plugins) {
	// ... existing wiring (agentsDir, commandsDir, etc.)

	if (plugin.codeEntrypoint) {
		const registry: PluginLifecycleRegistry = { activateHooks: [], deactivateHooks: [] };
		lifecycleRegistries.set(plugin.manifest.name, registry);
		try {
			const mod = (await import(plugin.codeEntrypoint)) as CodePluginModule;
			const api = createPluginAPI(container, plugin, registry);
			await mod.register(api);
		} catch (error) {
			getLogger().warn('Failed to load code plugin', {
				plugin: plugin.manifest.name,
				error: (error as Error).message
			});
		}
	}
}

// Store registries on container for teardown
container.register(SERVICE_IDENTIFIERS.PLUGIN_LIFECYCLE_REGISTRIES, lifecycleRegistries);
```

### 1.7 Trust Model

- Built-in plugins in `data/plugins/` with `code-exec` permission are trusted implicitly, matching the existing `shell-hooks` trust model.
- User-installed plugins in `~/.valora/plugins/` or `.valora/plugins/` with `code-exec` are **blocked** in this implementation — a user-facing allowlist (explicit opt-in via config) is required before any user plugin can execute code. This is deferred to a follow-up spec.

---

## Section 2: `valora-provider-ollama` Plugin

### 2.1 Manifest

**File:** `data/plugins/valora-provider-ollama/valora-plugin.json`

```json
{
	"name": "valora-provider-ollama",
	"version": "1.0.0",
	"description": "Self-managed Ollama provider — downloads the Ollama binary on first use and runs it locally. Supports any model available via ollama pull.",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code"],
	"permissions": ["code-exec", "fs-write", "network"],
	"codeEntrypoint": "index.js"
}
```

### 2.2 `OllamaBinaryManager`

**File:** `src/plugins-src/valora-provider-ollama/binary-manager.ts`

Responsibilities:

- Detect current platform (`process.platform`) and architecture (`process.arch`)
- Map to the correct GitHub release asset URL (`https://github.com/ollama/ollama/releases/download/v{version}/ollama-{platform}-{arch}`)
- Download with progress reporting to stderr
- Verify SHA256 checksum against the release's `.sha256` file
- Save to `~/.valora/ollama/bin/ollama` (or `.exe` on Windows) and `chmod 755`
- Skip download if binary already exists and `ollama --version` matches the target version

Target Ollama version is pinned in `binary-manager.ts` as a constant (e.g., `OLLAMA_VERSION = '0.6.0'`), updated manually per release.

### 2.3 `OllamaProcessManager`

**File:** `src/plugins-src/valora-provider-ollama/process-manager.ts`

Responsibilities:

- Spawn `ollama serve` as a detached child process using `child_process.spawn`
- Poll `GET http://localhost:11434/api/tags` until healthy (max 30 s, 500 ms interval)
- Track PID; register `process.on('exit', stop)` for graceful shutdown
- `stop()` sends `SIGTERM`, waits up to 5 s, then `SIGKILL`
- `ensureRunning()` — idempotent: no-op if already running and healthy

### 2.4 `OllamaModelManager`

**File:** `src/plugins-src/valora-provider-ollama/model-manager.ts`

Responsibilities:

- Call `GET http://localhost:11434/api/tags` to list local models
- If the configured model is absent, spawn `ollama pull <model>` and stream progress to stderr
- `ensureModel(name)` — idempotent: no-op if model already present

### 2.5 `OllamaProvider`

**File:** `src/plugins-src/valora-provider-ollama/ollama-provider.ts`

Extends `BaseLLMProvider`. On the first call to `complete()` or `streamComplete()`:

1. `binaryManager.ensureBinary()`
2. `processManager.ensureRunning()`
3. `modelManager.ensureModel(config.model)`

Then delegates to the `openai` npm package with `baseURL: config.base_url` and no API key. Model name is passed as-is (e.g., `'llama3.1'`).

```typescript
export class OllamaProvider extends BaseLLMProvider {
	name = 'ollama';
	isConfigured(): boolean {
		return true;
	} // always available once binary is present
	getAlternativeModels(): string[] {
		return ['llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2'];
	}
}
```

### 2.6 Plugin Entry Point

**File:** `src/plugins-src/valora-provider-ollama/index.ts`

```typescript
import { OllamaBinaryManager } from './binary-manager';
import { OllamaProcessManager } from './process-manager';
import { OllamaModelManager } from './model-manager';
import { OllamaProvider } from './ollama-provider';
import type { PluginAPI } from 'plugins/plugin-api.types';

export async function register(api: PluginAPI): Promise<void> {
	const binaryManager = new OllamaBinaryManager(api.logger);
	const processManager = new OllamaProcessManager(binaryManager, api.logger);
	const modelManager = new OllamaModelManager(api.logger);

	api.providers.register('ollama', (config) => new OllamaProvider(config, binaryManager, processManager, modelManager));

	api.lifecycle.onDeactivate(async () => {
		await processManager.stop();
	});
}
```

### 2.7 Config

Users configure Ollama in `~/.valora/config.json`:

```json
{
	"providers": {
		"ollama": {
			"model": "llama3.1",
			"base_url": "http://localhost:11434/v1",
			"auto_pull": true
		}
	}
}
```

Default model: `llama3.1`. Default `auto_pull`: `true` (model is pulled automatically if absent).

### 2.8 Provider Resolution

**File:** `src/cli/provider-resolver.ts`

Add to `getProviderForModel()`:

```typescript
if (model.includes('ollama') || model.includes('llama') || model.includes('mistral')) {
	return ProviderName.OLLAMA;
}
```

Add `OLLAMA = 'ollama'` to the `ProviderName` enum in `src/types/provider-names.types.ts`.

Note: The existing `LOCAL = 'local'` provider (which also targets Ollama) remains unchanged. `OllamaProvider` is a distinct, self-managing alternative — users choose it explicitly via `--provider ollama` or by setting the model to one of the Ollama keywords.

---

## Section 3: Build Pipeline

### 3.1 `tsconfig.plugins.json`

New file at the repo root:

```json
{
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"outDir": ".",
		"rootDir": "src/plugins-src",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"declaration": false,
		"sourceMap": false
	},
	"include": ["src/plugins-src/**/*"]
}
```

Each plugin's `index.ts` at `src/plugins-src/valora-provider-ollama/index.ts` compiles to `data/plugins/valora-provider-ollama/index.js`.

### 3.2 `package.json` Scripts

```json
"build:plugins": "tsc -p tsconfig.plugins.json",
"build": "tsc -p tsconfig.json && pnpm build:plugins",
"pretest": "pnpm build:plugins"
```

### 3.3 `.gitignore`

Add:

```
data/plugins/valora-provider-ollama/index.js
data/plugins/valora-provider-ollama/index.js.map
```

---

## Data Flow

```
valora run --provider ollama --model llama3.1
  │
  ├─ CLIProviderResolver → ProviderName.OLLAMA
  ├─ LLMProviderRegistry.createProvider('ollama', config)
  │    └─ OllamaProvider(config, binaryManager, processManager, modelManager)
  │
  └─ OllamaProvider.complete(options)
       ├─ binaryManager.ensureBinary()   // download if absent (~100MB, cached)
       ├─ processManager.ensureRunning() // spawn ollama serve if not running
       ├─ modelManager.ensureModel('llama3.1') // ollama pull if absent
       └─ openai.chat.completions.create(...)  // via http://localhost:11434/v1
```

---

## Error Handling

| Scenario                                    | Behaviour                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Platform not supported (e.g. Windows arm64) | `OllamaBinaryManager` throws with a clear message listing supported platforms   |
| Download fails (no network)                 | Error logged; `OllamaProvider.complete()` throws with a user-facing message     |
| Checksum mismatch                           | Binary deleted; error thrown asking user to retry                               |
| `ollama serve` fails to start               | Timeout after 30 s; error with link to Ollama docs                              |
| Model pull fails                            | Error thrown; `auto_pull: false` skips pull and lets Ollama error naturally     |
| Code plugin load failure                    | `initializePlugins` logs a warning and continues — other plugins are unaffected |

---

## Testing

- **Unit tests** for `OllamaBinaryManager` (platform mapping, URL construction, checksum logic) using mocked `fetch` and `fs`
- **Unit tests** for `OllamaProcessManager` (spawn/stop/health-check logic) using mocked `child_process`
- **Unit tests** for `OllamaModelManager` (model list parsing, pull invocation) using mocked HTTP
- **Plugin loader tests** — extend `plugin-loader.service.test.ts` with `'code'` contribution + `code-exec` permission cases (same pattern as existing mcps tests)
- **Integration test** — `initializePlugins` with a mock code plugin that calls `api.providers.register()` and verifies the provider appears in the registry
- **No live Ollama tests** — all binary/network calls are mocked; no test requires Ollama to be installed

---

## Out of Scope

- User-installed code plugin allowlisting (security model for `~/.valora/plugins/`)
- Config schema merging via `api.config.extend()` (interface defined, implementation stubbed)
- GPU detection or acceleration flags for `ollama serve`
- Ollama auto-update (version is pinned; users update by bumping the plugin version)
- Other Tier 2 candidates (output compression, memory, etc.) — they use the same contract but are separate specs
