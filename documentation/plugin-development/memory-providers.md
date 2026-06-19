---
updated: 2026-05-11
---

# Writing a Memory Provider Plugin

> Replace Valora's bundled vault with your own memory backend. See [ADR-016: Memory as a Replaceable Plugin](../adr/016-memory-as-plugin.md) for the rationale; this guide is the practical recipe.

A memory provider is a code plugin that implements the `MemoryProvider` contract from `@windagency/valora-plugin-api` and registers itself via `api.memory.register(name, factory, descriptor)`. Once installed and enabled, the user activates it by setting `memory.provider: '<your-name>'`.

## Prerequisites

- A Valora installation with code plugins enabled (the default since 2.7.0).
- A package that follows the layout in [Writing Plugins](../developer-guide/writing-plugins.md). The bundled vault at `packages/valora-plugin-memory-vault/` is the reference.
- Familiarity with the `MemoryProvider` interface at `packages/valora-plugin-api/src/memory.types.ts`.

## Skeleton

A complete in-memory backend in ~80 lines. Drop this into your plugin's `src/provider.ts` and adapt:

```ts
import type {
	ConsolidationOptions,
	ConsolidationResult,
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryProvider,
	MemoryProviderInfo,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryVerifyReport,
	PurgeCriteria,
	PurgeResult
} from '@windagency/valora-plugin-api';

export class MyMemoryProvider implements MemoryProvider {
	private readonly entries: Map<string, MemoryEntry> = new Map();
	private nextId = 1;

	constructor(_config: Record<string, unknown>) {
		// Read your plugin-namespaced config here. Validate it with your own
		// zod schema. The host hands you the raw config bag and trusts you
		// to enforce the shape.
	}

	async create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry> {
		const id = `mine-${this.nextId++}`;
		const now = new Date().toISOString();
		const entry: MemoryEntry = {
			accessCount: 0,
			agentRole: options.agentRole,
			category,
			confidence: options.confidence,
			content: options.content,
			createdAt: now,
			halfLifeDays: options.halfLifeDays ?? 7,
			id,
			isError: options.isError ?? false,
			lastAccessedAt: now,
			relatedPaths: options.relatedPaths ?? [],
			sessionId: options.sessionId,
			source: options.source,
			tags: options.tags,
			updatedAt: now
		};
		this.entries.set(id, entry);
		return entry;
	}

	async get(_category: MemoryCategory, id: string): Promise<MemoryQueryResult | null> {
		const entry = this.entries.get(id);
		return entry === undefined ? null : { entry, strength: 1 };
	}

	async update(_category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		const existing = this.entries.get(id);
		if (existing === undefined) return false;
		this.entries.set(id, { ...existing, ...patch });
		return true;
	}

	async delete(_category: MemoryCategory, id: string): Promise<boolean> {
		return this.entries.delete(id);
	}

	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		return [...this.entries.values()]
			.filter((entry) => options.category === undefined || entry.category === options.category)
			.map((entry) => ({ entry, strength: 1 }));
	}

	async findByPaths(paths: string[]): Promise<MemoryQueryResult[]> {
		return [...this.entries.values()]
			.filter((entry) => paths.some((p) => entry.relatedPaths.includes(p)))
			.map((entry) => ({ entry, strength: 1 }));
	}

	async invalidateByPaths(_paths: string[]): Promise<number> {
		return 0;
	}

	async markStaleByPaths(_paths: string[]): Promise<number> {
		return 0;
	}

	async prune(_threshold?: number): Promise<number> {
		return 0;
	}

	async purge(criteria: PurgeCriteria): Promise<PurgeResult> {
		const wouldDelete = this.entries.size;
		if (!criteria.dryRun) {
			this.entries.clear();
		}
		return {
			dryRun: criteria.dryRun ?? false,
			totalDeleted: criteria.dryRun ? 0 : wouldDelete,
			totalWouldDelete: wouldDelete
		};
	}

	async flush(): Promise<void> {
		// Persist any buffered state here. The host calls flush() on SIGTERM
		// and after consolidation runs.
	}

	async info(): Promise<MemoryProviderInfo> {
		return {
			capabilities: [],
			counts: { decisions: 0, episodic: this.entries.size, semantic: 0 },
			edgeCount: 0,
			embeddingCoverage: 0,
			label: 'My Memory Backend',
			name: 'my-memory'
		};
	}

	async verify(): Promise<MemoryVerifyReport> {
		return {
			counts: { decisions: 0, episodic: this.entries.size, semantic: 0 },
			issues: [],
			ok: true
		};
	}

	// Optional capabilities — implement only if your backend supports them.
	// If you omit them, Valora's CLI surfaces a "not supported" message
	// when the user invokes the corresponding command (e.g. `valora consolidate`).

	async consolidate(_options?: ConsolidationOptions): Promise<ConsolidationResult> {
		return { durationMs: 0, gitInvalidated: 0, merged: 0, promoted: 0, pruned: 0, staleMarked: 0 };
	}
}
```

## Registering with the host

In your plugin's entry point (the one declared as `codeEntrypoint` in `valora-plugin.json`):

```ts
import type { MemoryProviderDescriptor, PluginAPI } from '@windagency/valora-plugin-api';

import { MyMemoryProvider } from './provider';

const DESCRIPTOR: MemoryProviderDescriptor = {
	capabilities: ['consolidation'], // declare what you implement
	description: 'In-memory ephemeral backend for short-lived sessions',
	label: 'My Memory Backend'
};

export function register(api: PluginAPI): void {
	api.memory.register('my-memory', MyMemoryProvider, DESCRIPTOR);
}
```

The manifest must declare the `code` contribution and the `code-exec` permission:

```json
{
	"name": "my-memory-plugin",
	"version": "1.0.0",
	"valoraVersion": ">=2.7.0",
	"contributes": ["code"],
	"permissions": ["code-exec"],
	"codeEntrypoint": "dist/index.js"
}
```

If you also persist state to disk, declare `fs-read` and `fs-write`.

## Activation by the user

After your plugin is installed, the user activates your backend in their config:

```yaml
memory:
  enabled: true
  provider: my-memory # the key you registered

plugins:
  my-memory: # your config namespace, validated by your own schema
    # …whatever your plugin documents
```

The host's `memory.*` block now accepts only `{ enabled, provider }` — every backend-specific knob lives under `plugins.<your-name>.*`. The previous `memory.backend` and vault-only keys are rejected with a `LegacyMemoryConfigError` at startup (see the [2026-05 migration note](../migrations/2026-05-memory-plugin.md)).

## Conflicts and overrides

If another plugin (including the bundled vault) has already registered the same name, the registry throws `MemoryProviderConflictError`. To deliberately shadow another plugin's provider, declare the override in your manifest:

```json
{
	"overrides": ["vault"]
}
```

The override flag silences the conflict at registration time. The user still has to set `memory.provider: '<your-name>'` to activate it.

## Optional capabilities and graceful degradation

Three methods on `MemoryProvider` are optional:

| Method                      | Surfaced via                 | Behaviour when omitted                        |
| --------------------------- | ---------------------------- | --------------------------------------------- |
| `consolidate?()`            | `valora consolidate`         | Command reports "consolidation not supported" |
| `reembed?()`                | `valora memory reembed`      | Command reports "reembed not supported"       |
| `extractFromAgentOutput?()` | Post-session extraction hook | The host's extraction pass becomes a no-op    |

Declare what you support via the `capabilities` array on your `MemoryProviderDescriptor` (`'consolidation' | 'embeddings' | 'extraction' | 'graph-edges' | 'reembed'`). The CLI uses these to decide whether to offer the relevant subcommands.

## Testing

The host ships an architecture test (`__tests__/architecture/memory-plugin.arch.test.ts`) that asserts no core code reaches into the bundled vault outside a documented allowlist. That same boundary protects your plugin: code outside `packages/valora-plugin-memory-vault/` cannot accidentally end up depending on vault internals, so when a user swaps in your backend they get exactly the contract surface and nothing more.

For your own integration test, copy the pattern from `__tests__/integration/memory/registry-swap.test.ts`:

```ts
import { getMemoryRegistry, resetMemoryRegistry } from 'memory/registry';

import { MyMemoryProvider } from '../../src/provider';

beforeEach(() => {
	resetMemoryRegistry();
	const registry = getMemoryRegistry();
	registry.registerProvider('my-memory', MyMemoryProvider, { owner: 'test' });
	registry.setActive('my-memory', {
		/* your config */
	});
});

it('routes through my provider', async () => {
	const provider = getMemoryRegistry().getActive();
	const created = await provider.create('episodic', {
		/* … */
	});
	expect(created.id).toMatch(/^mine-/);
});
```

## References

- `packages/valora-plugin-api/src/memory.types.ts` — full type definitions.
- `packages/valora-plugin-memory-vault/` — the bundled reference implementation.
- `documentation/adr/016-memory-as-plugin.md` — design rationale and contract.
- `documentation/migrations/2026-05-memory-plugin.md` — the config hard-break users may encounter.
- `documentation/developer-guide/writing-plugins.md` — general plugin authoring guide.
