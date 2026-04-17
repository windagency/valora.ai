# ADR-012: Plugin Architecture

> **Decision**: Valora adopts a resource-overlay plugin model: a plugin is a directory with a Zod-validated `valora-plugin.json` manifest that contributes agents, commands, hooks, prompts, templates, MCP bundles, and agent-context fragments. Hooks require an explicit `shell-hooks` permission declaration. No code-execution surface is introduced.

## Status

Accepted

## Context

Valora's README has advertised "plugin architecture for agents, commands, providers" since the initial release. In practice, no formal plugin model existed: there was no manifest format, no discovery mechanism, no enable/disable toggle, and no permission model. Extension was only possible by editing files in `data/` (shipped with the binary) or `.valora/` (project overrides).

The gap created two friction points:

1. **Sharable customisation** — teams could not package and distribute sets of agents, hooks, or command overrides as a versioned unit.
2. **Third-party tool integration** — tools like [RTK](https://github.com/rtk-ai/rtk) that integrate with AI coding assistants via `PreToolUse` hooks had no clean way to ship a Valora integration without patching `data/hooks.default.json` directly.

The supply chain hardening work (ADR-009) established a strong precedent against arbitrary dependency code execution (`onlyBuiltDependencies: []`, frozen lockfile). Any plugin model must remain consistent with that stance.

## Decision

Implement a resource-overlay plugin model with four components:

### 1. Manifest Schema (`src/plugins/plugin-manifest.schema.ts`)

All plugin-related Zod schemas live in the schema adapter file. The manifest is validated by `PLUGIN_MANIFEST_SCHEMA`:

```json
{
	"name": "valora-plugin-rtk",
	"version": "0.1.0",
	"description": "RTK token-filter integration",
	"engines": { "valora": ">=2.5.0" },
	"contributes": ["hooks", "agent-context"],
	"permissions": ["shell-hooks"],
	"requiresBinary": [{ "name": "rtk", "version": ">=0.5", "install": "brew install rtk" }]
}
```

Contribution types: `agents`, `commands`, `hooks`, `prompts`, `templates`, `mcps`, `agent-context`.

Permissions: `shell-hooks` (required to register hook contributions). Future permissions (`network`, `fs-write`, `mcp-connect`) are declared in the schema but gated on not-yet-built code surfaces.

### 2. Discovery (`src/plugins/plugin-discovery.service.ts`)

`PluginDiscoveryService.discoverPluginDirs()` is a synchronous scan of three roots:

| Root                 | Scope         |
| -------------------- | ------------- |
| `data/plugins/`      | Built-in      |
| `~/.valora/plugins/` | Global user   |
| `.valora/plugins/`   | Project-local |

Each root is scanned with `readdirSync`. Directories without `valora-plugin.json` are silently skipped. A path traversal guard (`path.resolve()` + `startsWith(resolvedRoot + path.sep)`) prevents symlink escape.

### 3. Loading (`src/plugins/plugin-loader.service.ts`)

`PluginLoaderService.loadAll(dirs, enabledNames)` filters discovered directories to those listed in `plugins.enabled`, validates each manifest with Zod, checks `requiresBinary` entries, and calls `resolveContribDirs` to return per-type resource directories. Hook directories are only resolved when `permissions` includes `shell-hooks`.

Hooks from plugins are validated by `PLUGIN_HOOKS_FILE_SCHEMA` (a wrapper schema that expects `{ "hooks": { ... } }`), then merged with the project hooks config by `HookExecutionService`.

### 4. Wiring (`src/di/container.ts`)

`initializePlugins(container)` is called synchronously after `createContainer()`. It feeds plugin resource directories into `AgentLoader`, `CommandLoader`, and `HookExecutionService` via their `registerPluginDir()` / `addPluginHooks()` methods. Plugin lifecycle events are emitted via `PipelineEmitter` (`PLUGIN_LOADED`, `PLUGIN_FAILED`).

### Resolution Precedence

Contribution conflicts are resolved in this order (later wins):

1. `data/plugins/` (built-in)
2. `~/.valora/plugins/` (global user)
3. `.valora/plugins/` (project-local)

This mirrors the existing `data/` → `~/.valora/` → `.valora/` override precedence for all other resource types.

## Consequences

### Positive

- **Zero new code-execution surface** — plugins are data only; no dynamic `import()` of plugin code. Consistent with ADR-009 supply chain hardening.
- **Composable integrations** — tools that already use shell hooks (RTK, pre-commit linters, custom formatters) can ship a Valora plugin with no Valora core changes.
- **Versioned, distributable customisation** — teams can package and share agent sets, command libraries, and hook bundles as directories or tarballs with a manifest.
- **Permission gating** — the `shell-hooks` permission creates an explicit contract; a misconfigured plugin that omits the permission simply won't have its hooks registered.
- **Graceful degradation** — manifest validation failures and missing binaries produce warnings, never hard failures.
- **Reuses existing extension points** — `AgentLoader`, `CommandLoader`, `HookExecutionService` already support multiple directories; the plugin system feeds into these without new loading logic.

### Negative

- **No code contributions** — LLM providers, custom presenters, and quality scorers cannot be shipped as plugins. These require Approach C from the exploration doc (dynamic `import()` with signing and capability gating), which is deferred.
- **No versioned resolution algorithm** — when two plugins contribute the same agent name, the last-wins precedence is simple but may surprise authors of built-in plugins.
- **`requiresBinary` version is informational** — the version range in `requiresBinary` is not currently enforced (only presence on `$PATH` is checked).

### Neutral

- **`plugins.enabled` allowlist** — plugins are opt-in, not opt-out. A newly installed plugin directory is inert until added to the list.
- **Synchronous discovery** — `discoverPluginDirs` is synchronous to avoid async complexity at startup. Suitable for the current number of plugin roots; reconsider if roots number in the hundreds.

## Alternatives Considered

### Alternative A: Resource-overlay only (no manifest)

Simply extend the existing `.valora/` override paths to support a `plugins/` subdirectory, treating each sub-directory as an anonymous overlay.

**Rejected because:** no manifest means no versioning, no `contributes` declaration, no `permissions` gating, and no `requiresBinary` support. The manifest is cheap and unlocks the entire contribution model.

### Alternative B: npm code plugins

Plugins are npm packages that export a `register(ctx: PluginContext)` function, loaded via dynamic `import()`.

**Rejected for this milestone because:** arbitrary code execution conflicts with `onlyBuiltDependencies: []` (ADR-009). Requires a signing + capability-gating story that would block shipping the feature for months. The resource-overlay model covers ~70% of realistic use cases without this risk.

### Alternative C: Hybrid (resource overlay + code contributions behind interface gate)

A plugin directory can optionally contain a `contributions/` subdirectory with TypeScript files that must implement specific registered interfaces (`LLMProvider`, `QualityScorer`, etc.). Dynamic `import()` is used only for these files, gated on manifest declarations and signing.

**Deferred, not rejected.** This is the target end state. It is deliberately out of scope for this milestone to avoid blocking the resource-overlay foundation on unresolved security questions. An ADR amendment or ADR-013 should cover code contributions once the security model is ready.

## References

- [ADR-008: PreToolUse CLI Enforcement](./008-pretooluse-cli-enforcement.md) — Hook execution model that plugins extend
- [ADR-009: Supply Chain Hardening](./009-supply-chain-hardening.md) — The stance against arbitrary dependency code execution
- [Plugin Architecture Exploration](../../.claude/plans/explore-the-possibility-of-whimsical-mochi.md) — Full trade-off analysis and RTK worked example
- [User Guide: Plugins](../user-guide/plugins.md)
- [Developer Guide: Writing Plugins](../developer-guide/writing-plugins.md)
