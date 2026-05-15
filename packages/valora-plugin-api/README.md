# `@windagency/valora-plugin-api`

The single npm package a code plugin must install. It is type-only — no runtime JavaScript — so it adds nothing to your bundle size.

## Installation

```bash
pnpm add @windagency/valora-plugin-api
pnpm add -D zod   # peer dependency
```

## The plugin entry point

Your `codeEntrypoint` (declared in `valora-plugin.json`) must export a `register` function:

```typescript
import type { PluginAPI } from '@windagency/valora-plugin-api';

export function register(api: PluginAPI): void {
	// set up everything here
}
```

The host calls `register` once, after all plugins are discovered and before any session begins. The `api` object is the complete surface — everything your plugin can do flows through it.

> **Prerequisite:** your manifest must include `"code"` in `contributes` and `"code-exec"` in `permissions`, otherwise `register` is never called.

---

## `api.cli` — adding subcommands

```typescript
api.cli.addSubcommand(
	'my-plugin action', // one or two lowercase kebab-case words
	'Short description shown in valora --help',
	async () => {
		// handler
	}
);
```

Name must match `^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)?$`. If two plugins register the same name, the second registration wins and a warning is logged; declare the name in `overrides` in your manifest to suppress the warning.

**Example** (from `valora-plugin-obsidian`):

```typescript
api.cli.addSubcommand(
	'obsidian open',
	'Sync Obsidian config and open the Valora memory vault in Obsidian',
	async () => {
		const config = getConfig();
		await setupObsidianVault(config);
		openObsidian(resolveVaultDir(config));
	}
);
```

---

## `api.compression` — registering output compression strategies

A compression strategy reduces verbose tool output before it reaches the context window:

```typescript
import type { CompressionStrategy } from '@windagency/valora-plugin-api';

const filterMyTool: CompressionStrategy = (output, command) => {
	// output: raw stdout of the command
	// command: the command name (e.g. 'tsc', 'eslint')
	// return: a shorter string — ANSI codes are already stripped
	return output
		.split('\n')
		.filter((line) => line.includes('error') || line.includes('warning'))
		.join('\n');
};

api.compression.registerStrategy('my-tool', filterMyTool);
```

The strategy must not throw. First registration for a given tool name wins; a duplicate logs a warning and is discarded.

---

## `api.config` — reading typed plugin configuration

```typescript
import { z } from 'zod';

const schema = z.object({
	vaultPath: z.string().default('~/.valora/vault'),
	maxEntries: z.number().int().positive().default(1000)
});

// Call this once inside register() — it returns an accessor, not the value
const getConfig = api.config.extend(schema);

// Call the accessor wherever you need the config
api.lifecycle.onActivate(async () => {
	const config = getConfig(); // parsed and validated at call time
	console.log(config.vaultPath);
});
```

The accessor reads the user's config file, runs `safeParse`, and falls back to `schema.parse({})` (your defaults) on failure. **Never call `getConfig` at register time** — the config file may not be loaded yet.

---

## `api.lifecycle` — activation and teardown hooks

```typescript
api.lifecycle.onActivate(async () => {
	// runs after all plugins are loaded, before the session starts
	await myService.start();
});

api.lifecycle.onDeactivate(async () => {
	// runs at process shutdown or plugin unload
	await myService.stop();
});
```

Hooks are ordered per-plugin only. If you need another plugin to activate first, declare it in `requires` in your manifest.

---

## `api.logger` — structured logging

```typescript
api.logger.debug('cache hit', { key: cacheKey });
api.logger.info('provider ready', { model: defaultModel });
api.logger.warn('rate limit approaching', { remaining: 5 });
api.logger.error('request failed', new Error('timeout'), { url });
```

The logger routes through the host's rotating file logger at runtime. During development (before the host is fully initialised), it falls back to `console.*`.

---

## `api.providers` — registering an LLM provider

Implement `LLMProviderContract` and register it:

```typescript
import type {
	LLMProviderContract,
	PluginAPI,
	PluginLLMCompletionOptions,
	PluginLLMCompletionResult,
	ProviderDescriptor
} from '@windagency/valora-plugin-api';

class MyProvider implements LLMProviderContract {
	name = 'my-provider';

	constructor(private config: Record<string, unknown>) {}

	isConfigured(): boolean {
		return Boolean(this.config['apiKey']);
	}

	getAlternativeModels(current?: string): string[] {
		return ['model-a', 'model-b'];
	}

	async validateModel(name: string): Promise<boolean> {
		return ['model-a', 'model-b'].includes(name);
	}

	async complete(options: PluginLLMCompletionOptions): Promise<PluginLLMCompletionResult> {
		// call your API here
		return { content: '...', role: 'assistant', finish_reason: 'stop' };
	}

	async streamComplete(
		options: PluginLLMCompletionOptions,
		onChunk: (chunk: string) => void
	): Promise<PluginLLMCompletionResult> {
		// stream chunks, then return the full result
		return { content: '...', role: 'assistant', finish_reason: 'stop' };
	}

	// Optional — only needed if you support embeddings:
	async embed(req: PluginEmbeddingRequest): Promise<PluginEmbeddingResult> {
		return { dim: 1536, model: 'text-embedding-ada-002', vectors: [] };
	}
}

const descriptor: ProviderDescriptor = {
	label: 'My Provider',
	description: 'My custom LLM provider',
	defaultModel: 'model-a',
	modelModes: [{ mode: 'default', model: 'model-a' }],
	requiresApiKey: true,
	envVars: { apiKey: 'MY_PROVIDER_API_KEY' }
};

export function register(api: PluginAPI): void {
	// Class form — host calls `new MyProvider(config)`
	api.providers.register('my-provider', MyProvider, descriptor);

	// Factory form — equivalent, use when construction is non-trivial
	api.providers.register('my-provider', (config) => new MyProvider(config), descriptor);
}
```

### `ProviderDescriptor` reference

| Field                  | Required | Description                                                  |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `label`                | ✓        | Display name in CLI and UI                                   |
| `defaultModel`         | ✓        | Model used when none is configured                           |
| `modelModes`           | ✓        | Available `{ mode, model }` pairs                            |
| `requiresApiKey`       | ✓        | Shown in setup wizard                                        |
| `description`          | —        | One-line description                                         |
| `helpText`             | —        | Shown when `isConfigured()` returns false                    |
| `modelPrefix`          | —        | Prepended to model names (e.g. `'openrouter:'`)              |
| `envVars`              | —        | `{ apiKey?, model? }` — env var names for auto-configuration |
| `contextWindows`       | —        | `{ modelName: tokenCount }` map                              |
| `configSchema`         | —        | Zod schema for provider-specific config keys                 |
| `configureInteractive` | —        | Async wizard for guided setup                                |

### `PluginLLMCompletionOptions` reference

```typescript
interface PluginLLMCompletionOptions {
	messages: PluginLLMMessage[]; // required
	model?: string;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	stop?: string[];
	tools?: PluginLLMToolDefinition[];
	requires_thinking_trace?: boolean;
}
```

---

## `api.memory` — registering a memory provider

Implement `MemoryProvider` and register it:

```typescript
import type {
	MemoryCapability,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryProvider,
	MemoryProviderDescriptor,
	MemoryQueryOptions,
	MemoryQueryResult,
	PluginAPI
} from '@windagency/valora-plugin-api';

class MyMemoryProvider implements MemoryProvider {
	constructor(private config: Record<string, unknown>) {}

	async create(category, options: MemoryCreateOptions): Promise<MemoryEntry> {
		/* ... */
	}
	async get(category, id, strengthen?): Promise<MemoryQueryResult | null> {
		/* ... */
	}
	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		/* ... */
	}
	async update(category, id, patch): Promise<boolean> {
		/* ... */
	}
	async delete(category, id): Promise<boolean> {
		/* ... */
	}
	async findByPaths(paths: string[]): Promise<MemoryQueryResult[]> {
		/* ... */
	}
	async invalidateByPaths(paths: string[]): Promise<number> {
		/* ... */
	}
	async markStaleByPaths(paths: string[]): Promise<number> {
		/* ... */
	}
	async prune(threshold?: number): Promise<number> {
		/* ... */
	}
	async purge(criteria): Promise<PurgeResult> {
		/* ... */
	}
	async flush(): Promise<void> {
		/* ... */
	}
	async verify(): Promise<MemoryVerifyReport> {
		/* ... */
	}
	async info(): Promise<MemoryProviderInfo> {
		/* ... */
	}

	// Optional — declare 'consolidation' in capabilities if you implement this:
	async consolidate(options?): Promise<ConsolidationResult> {
		/* ... */
	}
}

const descriptor: MemoryProviderDescriptor = {
	label: 'My Memory Backend',
	description: 'Custom graph-based memory storage',
	capabilities: ['consolidation'] satisfies MemoryCapability[]
};

export function register(api: PluginAPI): void {
	api.memory.register('my-backend', MyMemoryProvider, descriptor);
}
```

The `capabilities` array must accurately list which optional methods you implement — the host uses it to guard capability-dependent calls. Available capabilities: `'consolidation'`, `'embeddings'`, `'extraction'`, `'graph-edges'`, `'reembed'`.

To **replace** the built-in `vault` backend, add `"overrides": ["vault"]` to your manifest.

### `MemoryEntry` shape

```typescript
interface MemoryEntry {
	id: string; // use generateMemoryId() from @windagency/valora-runtime
	category: 'decisions' | 'episodic' | 'semantic';
	content: string;
	confidence: 'verified' | 'observed' | 'inferred' | 'stale';
	source: { command: string; label?: string; phase?: string };
	agentRole: string;
	sessionId: string;
	tags: string[];
	relatedPaths: string[];
	halfLifeDays: number; // controls exponential decay
	accessCount: number;
	isError: boolean;
	createdAt: string; // ISO 8601
	updatedAt: string;
	lastAccessedAt: string;
}
```

`strength` in query results is computed as `0.5 ^ (elapsed_days / halfLifeDays)`.

---

## Types reference summary

| Type                                                                            | Use                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `PluginAPI`                                                                     | Injected into `register(api)` — the full plugin surface          |
| `CodePluginModule`                                                              | Interface for the module shape (`{ register }`)                  |
| `LLMProviderContract`                                                           | Implement to add an LLM provider                                 |
| `MemoryProvider`                                                                | Implement to add a memory backend                                |
| `CompressionStrategy`                                                           | `(output, command) => string` — pure function                    |
| `PluginLogger`                                                                  | Logger interface; use `api.logger` instead of importing directly |
| `ProviderDescriptor`                                                            | Metadata for LLM providers                                       |
| `MemoryProviderDescriptor`                                                      | Metadata for memory providers                                    |
| `MemoryEntry`, `MemoryCreateOptions`, `MemoryQueryOptions`, `MemoryQueryResult` | Memory data types                                                |
| `PluginLLMCompletionOptions`, `PluginLLMCompletionResult`, `PluginLLMMessage`   | LLM completion types                                             |
| `PluginEmbeddingRequest`, `PluginEmbeddingResult`                               | Embedding types (optional provider capability)                   |
| `PluginLifecycleHooks`                                                          | Lifecycle hook registration                                      |
