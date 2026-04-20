# ADR-012: Plugin Architecture

> **Decision**: Valora adopts a resource-overlay plugin model: a plugin is a directory with a Zod-validated `valora-plugin.json` manifest that contributes agents, commands, hooks, prompts, templates, MCP bundles, and agent-context fragments. Hooks require an explicit `shell-hooks` permission declaration. No code-execution surface is introduced.

## Status

Accepted

## Consequences

### Positive

- **Composable integrations** — tools that already use shell hooks (RTK, pre-commit linters, custom formatters) can ship a Valora plugin with no Valora core changes.
- **Versioned, distributable customisation** — teams can package and share agent sets, command libraries, and hook bundles as directories or tarballs with a manifest.
- **Permission gating** — the `shell-hooks` and `code-exec` permissions create explicit contracts; a misconfigured plugin that omits a permission simply won't have the corresponding surface registered.
- **Graceful degradation** — manifest validation failures, missing binaries, and code-module import errors produce warnings, never hard failures. A failing strategy falls back to uncompressed output rather than crashing the pipeline.
- **Reuses existing extension points** — `AgentLoader`, `CommandLoader`, `HookExecutionService` already support multiple directories; the plugin system feeds into these without new loading logic.
- **Code plugins implemented (Approach C, partial)** — As of April 2026, the `code` contribution type is active. Three built-in compression plugins (`valora-plugin-compression-universal`, `-typescript`, `-python`) register 17 tool strategies via `api.compression.registerStrategy()`. They are the reference implementation for the `PluginAPI` contract.
- **Horizon 1 migration complete** — As of April 2026, all embedded built-in resources have been packaged into 10 named plugins under `packages/` and `data/plugins/`: `valora-core-secops`, `valora-core-design`, `valora-core-platform`, `valora-core-generators`, `valora-core-product`, `valora-core-qa`, `valora-core-quality-gate`, `valora-core-docs`, `valora-core-engineering`, `valora-core-implement`. The directory `data/commands/` is now docs-only. `data/agents/` retains `registry.json` for dynamic agent selection at runtime.

### Negative

- **`code-exec` scope is limited** — `PluginAPI` currently exposes only `compression`, `logger`, `providers` (reserved), `config` (reserved), and `lifecycle` (reserved). LLM providers, custom presenters, and quality scorers require the `providers` surface to be activated, which is deferred pending the full signing and capability-gating story.
- **No versioned resolution algorithm** — when two plugins contribute the same agent name or compression strategy key, last-wins (data) or first-wins (code registry) precedence is simple but may surprise plugin authors.
- **`requiresBinary` version is informational** — the version range in `requiresBinary` is not currently enforced (only presence on `$PATH` is checked).
- **Code plugin constants must be inlined** — path aliases to Valora core (`config/*`, `executor/*`, etc.) are not resolvable in compiled plugin output. Plugins must inline any shared constants (e.g. `MAX_GREP_OUTPUT_LINES`).

### Neutral

- **`plugins.enabled` allowlist** — plugins are opt-in, not opt-out. A newly installed plugin directory is inert until added to the list.
- **Synchronous discovery** — `discoverPluginDirs` is synchronous to avoid async complexity at startup. Suitable for the current number of plugin roots; reconsider if roots number in the hundreds.

<details>
<summary><strong>Context</strong></summary>

Valora's README has advertised "plugin architecture for agents, commands, providers" since the initial release. In practice, no formal plugin model existed: there was no manifest format, no discovery mechanism, no enable/disable toggle, and no permission model. Extension was only possible by editing files in `data/` (shipped with the binary) or `.valora/` (project overrides).

The gap created two friction points:

1. **Sharable customisation** — teams could not package and distribute sets of agents, hooks, or command overrides as a versioned unit.
2. **Third-party tool integration** — tools like [RTK](https://github.com/rtk-ai/rtk) that integrate with AI coding assistants via `PreToolUse` hooks had no clean way to ship a Valora integration without patching `data/hooks.default.json` directly.

The supply chain hardening work (ADR-009) established a strong precedent against arbitrary dependency code execution (`onlyBuiltDependencies: []`, frozen lockfile). Any plugin model must remain consistent with that stance.

</details>

## Decision

Implement a resource-overlay plugin model with four components:

### 1. Manifest Schema (`src/plugins/plugin-manifest.schema.ts`)

All plugin-related Zod schemas live in the schema adapter file. The manifest is validated by `PLUGIN_MANIFEST_SCHEMA`:

```json
{
	"name": "valora-plugin-rtk",
	"version": "0.1.0",
	"description": "RTK token-filter integration",
	"homepage": "https://github.com/example/valora-plugin-rtk",
	"engines": { "valora": ">=2.5.0" },
	"contributes": ["hooks", "agent-context"],
	"permissions": ["shell-hooks"],
	"requires": ["valora-defaults"],
	"requiresBinary": [{ "name": "rtk", "version": ">=0.5", "install": "brew install rtk" }],
	"overrides": []
}
```

Contribution types: `agents`, `commands`, `hooks`, `prompts`, `templates`, `mcps`, `agent-context`, `code`.

Permissions: `shell-hooks` (required to register hook contributions); `code-exec` (required for `code` contributions). Future permissions (`network`, `fs-write`, `mcp-connect`, `fs-read`) are declared in the schema but gated on not-yet-built code surfaces.

`requires`: array of plugin names that must be loaded before this plugin. If a required plugin is absent or not enabled, this plugin is skipped with a warning.

`overrides`: informational list of built-in resource names this plugin supersedes. Valora logs a notice on load. Last-wins precedence applies regardless.

### 2. Discovery (`src/plugins/plugin-discovery.service.ts`)

`PluginDiscoveryService.discoverPluginDirs()` is a synchronous scan of three roots:

| Root                                       | Scope                  |
| ------------------------------------------ | ---------------------- |
| `data/plugins/`                            | Built-in               |
| `~/.valora/plugins/`                       | Global user            |
| `.valora/plugins/`                         | Project-local          |
| `node_modules/@windagency/valora-plugin-*` | npm-installed packages |

The three filesystem roots are scanned with `readdirSync`. The npm root scans `node_modules/@windagency/` for directories whose names start with `valora-plugin-`. Directories without `valora-plugin.json` are silently skipped. A path traversal guard (`path.resolve()` + `startsWith(resolvedRoot + path.sep)`) prevents symlink escape from filesystem roots.

### 3. Loading (`src/plugins/plugin-loader.service.ts`)

`PluginLoaderService.loadAll(dirs, enabledNames)` filters discovered directories to those listed in `plugins.enabled`, validates each manifest with Zod, checks `requiresBinary` entries, and calls `resolveContribDirs` to return per-type resource directories. Hook directories are only resolved when `permissions` includes `shell-hooks`.

Hooks from plugins are validated by `PLUGIN_HOOKS_FILE_SCHEMA` (a wrapper schema that expects `{ "hooks": { ... } }`), then merged with the project hooks config by `HookExecutionService`.

### 4. Wiring (`src/di/container.ts`)

`initializePlugins(container)` is called synchronously after `createContainer()`. It feeds plugin resource directories into `AgentLoader`, `CommandLoader`, `PromptLoader`, and `HookExecutionService` via their `registerPluginDir()` / `registerPluginPromptsDir()` / `registerPluginHooks()` methods.

### Resolution Precedence

Contribution conflicts are resolved in this order (later wins):

1. `data/plugins/` (built-in)
2. `~/.valora/plugins/` (global user)
3. `.valora/plugins/` (project-local)

This mirrors the existing `data/` → `~/.valora/` → `.valora/` override precedence for all other resource types.

<details>
<summary><strong>Alternatives considered</strong></summary>

### Alternative A: Resource-overlay only (no manifest)

Simply extend the existing `.valora/` override paths to support a `plugins/` subdirectory, treating each sub-directory as an anonymous overlay.

**Rejected because:** no manifest means no versioning, no `contributes` declaration, no `permissions` gating, and no `requiresBinary` support. The manifest is cheap and unlocks the entire contribution model.

### Alternative B: npm code plugins

Plugins are npm packages that export a `register(ctx: PluginContext)` function, loaded via dynamic `import()`.

**Rejected for this milestone because:** arbitrary code execution conflicts with `onlyBuiltDependencies: []` (ADR-009). Requires a signing + capability-gating story that would block shipping the feature for months. The resource-overlay model covers ~70% of realistic use cases without this risk.

### Alternative C: Hybrid (resource overlay + code contributions behind interface gate)

A plugin directory can optionally contain a compiled module at `codeEntrypoint` that must implement the `register(api: PluginAPI)` contract. Dynamic `import()` is used only for this file, gated on `contributes: ["code"]` and `permissions: ["code-exec"]` manifest declarations.

**Partially implemented.** The `code` contribution type and `PluginAPI` are active as of April 2026. The `compression` namespace is the first production surface. The `providers`, `config`, and `lifecycle` namespaces are declared but gated pending the signing and capability-gating story (ADR-013). The three built-in compression plugins (`valora-plugin-compression-universal`, `-typescript`, `-python`) are the reference implementation.

</details>

## References

- [ADR-008: PreToolUse CLI Enforcement](./008-pretooluse-cli-enforcement.md) — Hook execution model that plugins extend
- [ADR-009: Supply Chain Hardening](./009-supply-chain-hardening.md) — The stance against arbitrary dependency code execution
- [Plugin Architecture Exploration](../../.claude/plans/explore-the-possibility-of-whimsical-mochi.md) — Full trade-off analysis and RTK worked example
- [User Guide: Plugins](../user-guide/plugins.md)
- [Developer Guide: Writing Plugins](../developer-guide/writing-plugins.md)
