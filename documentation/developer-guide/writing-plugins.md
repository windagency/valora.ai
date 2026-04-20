# Writing Plugins

> Package agents, commands, hooks, prompts, templates, MCP bundles, and code modules as a self-contained Valora plugin.

## Minimal Plugin Layout

```
my-plugin/
├── valora-plugin.json    # Required — Zod-validated manifest
├── agents/               # Optional — agent markdown files
├── commands/             # Optional — command markdown files
├── hooks/                # Optional — shell scripts
├── hooks.json            # Optional — hook registration (requires shell-hooks permission)
├── prompts/              # Optional — prompt markdown files
├── templates/            # Optional — template markdown files
├── mcps.json             # Optional — external MCP server declarations
├── agent-context/        # Optional — markdown fragments injected into system prompts
└── dist/index.js         # Optional — compiled code module (requires code-exec permission)
```

## `valora-plugin.json` Template

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"description": "What this plugin does",
	"engines": { "valora": ">=2.5.0" },
	"contributes": ["agents", "commands"],
	"permissions": []
}
```

## Contribution Types

| Type            | Directory / File                | Format                         | Permission needed |
| --------------- | ------------------------------- | ------------------------------ | ----------------- |
| `agents`        | `agents/`                       | Markdown + YAML front matter   | —                 |
| `commands`      | `commands/`                     | Markdown + YAML front matter   | —                 |
| `hooks`         | `hooks/` + `hooks.json`         | Shell scripts + JSON config    | `shell-hooks`     |
| `prompts`       | `prompts/`                      | Markdown + YAML front matter   | —                 |
| `templates`     | `templates/`                    | Markdown files                 | —                 |
| `mcps`          | `mcps.json`                     | External MCP server JSON       | —                 |
| `agent-context` | `agent-context/`                | Plain markdown fragments       | —                 |
| `code`          | Compiled JS at `codeEntrypoint` | ES module exporting `register` | `code-exec`       |

## Code Plugins

Code plugins contribute a compiled JavaScript module that Valora dynamically imports. They are the mechanism for registering **compression strategies**, and the intended path for future LLM providers and custom presenters once the security model is finalised.

### Manifest

```json
{
	"name": "my-compression-plugin",
	"version": "1.0.0",
	"description": "Cargo build output compression for Valora",
	"engines": { "valora": ">=2.5.0" },
	"contributes": ["code"],
	"permissions": ["code-exec"],
	"codeEntrypoint": "dist/index.js"
}
```

### `register()` contract

The entry point must export a named `register` function. The function receives a `PluginAPI` object and returns `void` (synchronous) or `Promise<void>` (for plugins that need async initialisation).

```typescript
// src/index.ts
import type { PluginAPI } from 'plugins/plugin-api.types';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('cargo', (output, _command) => {
		return output
			.split('\n')
			.filter((l) => !l.startsWith('   Compiling'))
			.join('\n');
	});

	api.logger.info('cargo compression strategy registered');
}
```

### `PluginAPI` surface

| Namespace     | Method                        | Description                                                                                                                                      |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compression` | `registerStrategy(tool, fn)`  | Register an output compression strategy for an executable name. First registration wins; subsequent calls for the same key are silently ignored. |
| `logger`      | `debug / info / warn / error` | Structured logger scoped to the plugin name.                                                                                                     |
| `providers`   | `register(name, class)`       | _(Reserved — not yet active)_ Register an LLM provider.                                                                                          |
| `config`      | `extend(schema)`              | _(Reserved — not yet active)_ Extend Valora's config schema.                                                                                     |
| `lifecycle`   | `onActivate / onDeactivate`   | _(Reserved — not yet active)_ Plugin lifecycle hooks.                                                                                            |

`CompressionStrategy` signature: `(output: string, command: string) => string`

- `output` — raw terminal output (ANSI already stripped)
- `command` — full command string including flags (e.g. `cargo build --release`)
- Return the compressed string. Throwing is safe — core catches errors and falls back to the uncompressed output.

### Building and layout

Code plugins compile TypeScript to a single `dist/index.js` ES module. The `tsconfig.json` must set `"module": "ESNext"` and `"moduleResolution": "bundler"`. Path aliases to Valora core (`executor/*`, `config/*`, etc.) are **not resolvable at runtime** inside `dist/` — inline any constants you need.

Reference layout (`src/plugins-src/valora-plugin-compression-universal/`):

```
src/plugins-src/valora-plugin-compression-universal/
├── index.ts          # register() entry point — only calls api.compression.registerStrategy
└── strategies.ts     # Pure filter functions, no core imports
```

Compiled output lands in `data/plugins/valora-plugin-compression-universal/` via `tsconfig.plugins.json`.

---

## Shell Hooks

Plugins that run shell hooks must declare `"shell-hooks"` in `permissions` and provide a `hooks.json` in the plugin root.

The `hooks.json` structure mirrors `.valora/hooks.json`:

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "^run_terminal_cmd$",
				"hooks": [
					{
						"type": "command",
						"command": "bash hooks/my-hook.sh",
						"timeout": 5000
					}
				]
			}
		]
	}
}
```

Hook scripts receive the tool call JSON on stdin and respond by:

- Exiting `0` to allow
- Outputting a JSON object with `hookSpecificOutput.permissionDecision` and `permissionDecisionReason`, then exiting `2` to block

---

<details>
<summary><strong>Full manifest schema, per-type examples, architecture notes, and local testing</strong></summary>

## Full Manifest Schema

Validated by `PLUGIN_MANIFEST_SCHEMA` in `src/plugins/plugin-manifest.schema.ts`.

| Field            | Type       | Required | Description                                                            |
| ---------------- | ---------- | -------- | ---------------------------------------------------------------------- |
| `name`           | `string`   | Yes      | Unique plugin identifier (kebab-case recommended)                      |
| `version`        | `string`   | Yes      | SemVer: `MAJOR.MINOR.PATCH`                                            |
| `description`    | `string`   | No       | Human-readable description                                             |
| `homepage`       | `string`   | No       | URL to the plugin's homepage or repository                             |
| `engines.valora` | `string`   | No       | SemVer range declaring minimum Valora compatibility                    |
| `contributes`    | `string[]` | No       | List of contribution types (see table above)                           |
| `permissions`    | `string[]` | No       | Required permissions; must include `shell-hooks` for hooks             |
| `requires`       | `string[]` | No       | Plugin names that must be loaded before this one                       |
| `requiresBinary` | `object[]` | No       | External binaries the plugin depends on                                |
| `overrides`      | `string[]` | No       | Built-in resource names this plugin supersedes (informational)         |
| `codeEntrypoint` | `string`   | No       | Relative path to compiled JS entry point (required for `code` plugins) |

`requiresBinary` entries:

| Sub-field | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `name`    | `string` | Binary name checked on `$PATH`                       |
| `version` | `string` | SemVer range (informational, not enforced by Valora) |
| `install` | `string` | Install hint shown when binary is missing            |

## Per-Type Examples

### Agent

`agents/rust-engineer.md`:

```markdown
---
name: rust-engineer
role: 'Rust Systems Engineer'
expertise:
  - 'Rust ownership model and lifetimes'
  - 'async/await with Tokio'
  - 'WebAssembly compilation targets'
llm_model: claude-sonnet-4.6
---

You are a senior Rust systems engineer specialising in...
```

### Command

`commands/audit-deps.md`:

```markdown
---
name: audit-deps
description: Run dependency security audit
agent: secops-engineer
model: claude-haiku-4.5
prompts:
  pipeline:
    - stage: audit
      prompt: security.audit-dependencies
      required: true
---

# Audit Dependencies

Runs a full dependency security audit...
```

### Agent-Context Fragment

`agent-context/RTK.md`:

```markdown
# RTK Output Shapes

When `rtk` is active, terminal output from `git status`, `git diff`, and `cargo build`
is filtered to remove noise. Expect condensed diffs and truncated build logs.
Do not hallucinate lines that are missing — they were filtered by RTK intentionally.
```

Fragments in `agent-context/` are concatenated into the agent's system prompt after the built-in context section. They are injected for all agents loaded in a session.

## Discovery and Loading Architecture

1. `PluginDiscoveryService` (`src/plugins/plugin-discovery.service.ts`) scans the three root locations synchronously at startup.
2. Directories lacking a `valora-plugin.json` file are silently skipped.
3. A path traversal guard (`path.resolve()` + `startsWith(root + sep)`) ensures symlinks cannot escape the plugin root.
4. `PluginLoaderService` (`src/plugins/plugin-loader.service.ts`) validates each manifest with `PLUGIN_MANIFEST_SCHEMA` (Zod, in `src/plugins/plugin-manifest.schema.ts`).
5. `initializePlugins()` in `src/di/container.ts` wires loaded plugins into the DI container after `createContainer()`.
6. Plugin resource directories are fed into `AgentLoader`, `CommandLoader`, `PromptLoader`, and `HookExecutionService` via `registerPluginDir()` / `registerPluginPromptsDir()` / `registerPluginHooks()`.

Arch-unit rule: the `plugins` module may only import from `['plugins', 'types', 'config', 'utils', 'output']`. It must not import executor or service modules.

## Distributing a Plugin

Three distribution methods are supported:

| Method                | How to install                            | Discovery            |
| --------------------- | ----------------------------------------- | -------------------- |
| Directory copy        | `cp -r my-plugin .valora/plugins/`        | Filesystem scan      |
| Global directory copy | `cp -r my-plugin ~/.valora/plugins/`      | Filesystem scan      |
| npm package           | `pnpm add @windagency/valora-plugin-name` | `node_modules/` scan |

To publish as an npm package, set `name` in `package.json` to `@windagency/valora-plugin-<name>` and include `valora-plugin.json` in the published files. Valora automatically discovers any `@windagency/valora-plugin-*` package that exists in `node_modules/` and contains a valid manifest.

## Testing a Plugin Locally

```bash
# Project-scoped (affects only this repo)
mkdir -p .valora/plugins
cp -r /path/to/my-plugin .valora/plugins/

# Add to plugins.enabled in .valora/config.json
# Then run:
valora doctor

# Or exercise a contributed command:
valora audit-deps
```

For integration tests that exercise plugin loading, use a temp directory and Testcontainers per the project testing standards. Mock-based integration tests are forbidden (see `CLAUDE.md`).

## Arch-Unit Tests

Every new module boundary must be validated. Add rules to `arch-unit-ts.json`:

```json
{
	"rule": "plugins module only imports from allowed modules",
	"from": { "module": "plugins" },
	"to": { "modules": ["plugins", "types", "config", "utils", "output"] },
	"severity": "error"
}
```

Run: `npm run test:arch`

</details>
