---
updated: 2026-05-11
---

# ADR-016: Memory as a Replaceable Plugin

> **Decision**: The memory subsystem is decoupled from the host. Core defines a `MemoryProvider` contract and a registry; the previous vault implementation moves into `@windagency/valora-plugin-memory-vault` and registers itself as `'vault'` at boot. Users can replace the backend by installing an alternative memory plugin and setting `memory.provider: '<name>'`.

## Status

Accepted

> Implementation landed in Valora 2.7.0. The `MemoryProvider` interface lives in `@windagency/valora-plugin-api`; the registry in `src/memory/registry.ts`; the bundled vault implementation in `packages/valora-plugin-memory-vault/`. Architecture invariants are enforced by `__tests__/architecture/memory-plugin.arch.test.ts` and `__tests__/architecture/vault-memory.arch.test.ts`.

## Consequences

### Positive

- **Backend choice is a user decision.** Teams can ship a memory plugin that targets a different store (Postgres, SQLite, an external graph database, an in-memory cache for ephemeral workflows) without forking Valora. The host is unaware of vault internals after the migration.
- **The vault stays as the well-supported default.** The bundled `@windagency/valora-plugin-memory-vault` is built and loaded at startup like any other provider. Existing vault directories (`.valora/memory/`) are read with identical semantics to pre-2.7.0 — the on-disk format is unchanged.
- **A single contract, not a sprawling surface.** Every consumer (CLI, executor, MCP shutdown) calls `getMemoryRegistry().getActive().<method>()`. The arch test forbids host code from importing the bundled package outside a small, documented allowlist of bootstrap glue files.
- **Test isolation.** Tests can register an in-memory fixture provider (`InMemoryFixtureProvider` in `__tests__/integration/memory/registry-swap.test.ts`) and exercise CLI/executor paths without touching disk. This eliminates a class of slow, flaky integration tests that previously needed temp vault directories.
- **Clean configuration namespace.** Host-level `memory.*` carries only `{ enabled, provider }`. All vault tuning knobs (half-lives, embedding, recall, thresholds) live under `plugins.memory-vault.*` and are validated by the vault's own zod schema. A third-party memory plugin owns its own namespace symmetrically.
- **Hard break with a clear migration path.** Legacy `memory.backend` and tuning keys at the top level surface a `LegacyMemoryConfigError` at startup, pointing at `documentation/migrations/2026-05-memory-plugin.md`. No silent behavioural drift.

### Negative

- **Two bootstrap entry points for the bundled vault.** It is registered by the host's `src/memory/bootstrap.ts` (so it is the default `'vault'` provider without requiring `plugins.enabled` to list it) and it also exposes `register(api)` for the plugin loader path. The dual entry is intentional but adds one indirection: changes to how the vault is constructed must be made in both the bootstrap glue and the plugin manifest.
- **`pipeline.ts` and `stage-executor.ts` still reach into the bundled package.** `getMemoryExtraction()` and `parseVaultPluginConfig()` are used directly. Routing those through new `MemoryProvider.extractFromAgentOutput()` / a provider-level config-info method would be cleaner. These are documented as the two remaining allowlisted import sites and tracked as follow-up cleanup.
- **One active provider at a time.** No cross-plugin federation; a host cannot mount a "fast cache" and a "durable store" simultaneously and route between them. This is an explicit out-of-scope choice — federation belongs in a single provider plugin if needed.
- **Plugin authors must re-implement the full contract.** A `MemoryProvider` has 15+ methods including consolidation and verification. There is no abstract base class that supplies sensible defaults; alternative implementations either implement everything or face runtime errors. A documented skeleton mitigates this (see `documentation/plugin-development/memory-providers.md`).

### Neutral

- The `MemoryRetentionConfig` type stays in `@windagency/valora-plugin-api`. It is a shared retention contract any provider may use; we did not push it into the vault package even though only the vault currently consumes it. This keeps the option open for a future provider that wants the same shape.
- The legacy `from 'memory'` barrel (`src/memory/index.ts`) is preserved as a back-compat surface that forwards exports from the bundled package. Internal code has been migrated, but the barrel is kept to avoid breaking any user-facing tooling that depends on the old import path.

## Context

Prior to this ADR, the memory subsystem lived entirely under `src/memory/` and was instantiated directly by every consumer. ADR-013 (Memory Vault) describes the on-disk Markdown format and embedding-aware retrieval; ADR-011 (Biologically-Inspired Memory) describes the decay model that both backends share. Neither ADR established an extension point: replacing the vault required forking Valora.

The May-2026 audit (`__tests__/architecture/vault-memory.arch.test.ts` at the time) found:

- 2 `instanceof VaultStore` breaks inside `MemoryManager` itself, against `MemoryStorePort`.
- Concrete `VaultStore` / `MemoryManager` instantiations scattered across `stage-executor.ts`, `memory.command.ts`, `mcp/server.ts`, and `cli/commands/dynamic.ts`.
- A `MEMORY_CONFIG_SCHEMA` of 14 fields tightly coupled to the vault's specific knobs.

These coupled the host to the vault implementation. The migration plan (`/home/node/.claude/plans/analyse-the-findings-review-jazzy-sun.md`) addressed them in seven phases:

1. **Contract & registry, zero behaviour change.** Introduce `MemoryProvider` in plugin-api; add `MemoryProviderRegistry`; wire `api.memory.register()` into the plugin API factory.
2. **Stabilise the port boundary.** Remove the `instanceof VaultStore` breaks; widen `MemoryStorePort.appendEntry` to accept optional `links?: Edge[]`; replace direct logger/registry imports inside the manager with constructor injection.
3. **Route consumers through the registry.** Replace every direct construction with `getMemoryRegistry().getActive()`.
4. **Physically move the implementation** into `packages/valora-plugin-memory-vault/`, extract shared utilities into `valora-runtime`, and remove host-aliased imports from the bundled package.
5. **Hard-break the configuration.** Slim `MEMORY_CONFIG_SCHEMA` to `{ enabled, provider }`; move vault knobs to `plugins.memory-vault.*`; add a guard that surfaces a friendly error for legacy keys.
6. **Encode the boundary in tests.** Add a registry-swap integration test and an architecture test that enforces the small allowlist of bootstrap glue files.
7. **Document the change.** This ADR plus migration note, user-guide refresh, and a plugin-author skeleton.

The system was kept green at every phase boundary — the strangler-fig migration meant the branch was shippable at each cut.

## The contract

The `MemoryProvider` interface is the entire memory surface from the host's perspective:

```ts
// packages/valora-plugin-api/src/memory.types.ts
export interface MemoryProvider {
	// CRUD
	create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry>;
	get(category: MemoryCategory, id: string, strengthen?: boolean): Promise<MemoryQueryResult | null>;
	update(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean>;
	delete(category: MemoryCategory, id: string): Promise<boolean>;

	// Retrieval
	query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]>;
	findByPaths(paths: string[]): Promise<MemoryQueryResult[]>;

	// Path-driven invalidation
	invalidateByPaths(paths: string[]): Promise<number>;
	markStaleByPaths(paths: string[]): Promise<number>;

	// Maintenance
	prune(threshold?: number): Promise<number>;
	purge(criteria: PurgeCriteria): Promise<PurgeResult>;
	flush(): Promise<void>;
	info(): Promise<MemoryProviderInfo>;
	verify(): Promise<MemoryVerifyReport>;

	// Optional capabilities
	consolidate?(options?: ConsolidationOptions): Promise<ConsolidationResult>;
	reembed?(options: ReembedOptions): Promise<ReembedReport>;
	extractFromAgentOutput?(output: string, ctx: ExtractionContext): Promise<MemoryEntry[]>;
}
```

A plugin registers a provider via the existing `PluginAPI`:

```ts
export function register(api: PluginAPI): void {
	api.memory.register('my-memory', MyMemoryProvider, {
		capabilities: ['embeddings'],
		label: 'My Memory Backend'
	});
}
```

The user activates it by setting `memory.provider: 'my-memory'`. The plugin owns its config namespace under `plugins['my-memory']`.

## Alternatives considered

### A: Keep the vault, expose only an opaque toggle

Add a `memory.enabled` switch and rely on plugins to wrap the vault. **Rejected** because it does not address the underlying coupling — every consumer still imports `VaultStore` and the schema still carries vault knobs. Replacing the backend would still require forking core.

### B: Provide a thin facade that the vault implements

Introduce `MemoryProvider` but keep the vault under `src/memory/`. **Rejected** because the physical separation matters: as long as the implementation lives under `src/`, accidental imports proliferate. The architecture test only works if the bundled vault genuinely lives behind a package boundary.

### C: Federation layer (multi-provider routing)

A "memory router" that fans out to multiple registered providers. **Rejected** as out-of-scope for the first version; if a user needs federated semantics they can ship a single plugin that delegates internally. Adding routing to core would commit us to ranking/conflict semantics that nobody has asked for.

## Out of scope

- Migrating embedder selection to a separate plugin namespace. The bundled vault still picks any registered LLM provider that implements `embed?()`; a separate `api.embedder.register()` is a future ADR if needed.
- Multiple simultaneous memory providers.
- Cross-plugin memory federation.
- Per-stage memory routing (e.g. "use durable for decisions, cache for episodic").

## References

- `packages/valora-plugin-api/src/memory.types.ts` — the contract.
- `src/memory/registry.ts` — the indirection layer.
- `packages/valora-plugin-memory-vault/` — the bundled default.
- `documentation/migrations/2026-05-memory-plugin.md` — user-facing config migration.
- `documentation/plugin-development/memory-providers.md` — author guide.
- `__tests__/integration/memory/registry-swap.test.ts` — proof of swap.
- `__tests__/architecture/memory-plugin.arch.test.ts` — boundary enforcement.
- [ADR-011: Biologically-Inspired Agent Memory System](./011-biologically-inspired-memory.md) — describes the decay model the bundled vault implements.
- [ADR-012: Plugin Architecture](./012-plugin-architecture.md) — describes the wider plugin model `memory` slots into.
- [ADR-013: Memory Vault](./013-vault-and-embeddings.md) — describes the bundled vault's on-disk format and embedding design.
