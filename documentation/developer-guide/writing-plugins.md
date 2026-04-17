# Writing Plugins

> Package agents, commands, hooks, prompts, templates, and MCP bundles as a self-contained Valora plugin.

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
└── agent-context/        # Optional — markdown fragments injected into system prompts
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

| Type            | Directory / File        | Format                       | Permission needed |
| --------------- | ----------------------- | ---------------------------- | ----------------- |
| `agents`        | `agents/`               | Markdown + YAML front matter | —                 |
| `commands`      | `commands/`             | Markdown + YAML front matter | —                 |
| `hooks`         | `hooks/` + `hooks.json` | Shell scripts + JSON config  | `shell-hooks`     |
| `prompts`       | `prompts/`              | Markdown + YAML front matter | —                 |
| `templates`     | `templates/`            | Markdown files               | —                 |
| `mcps`          | `mcps.json`             | External MCP server JSON     | —                 |
| `agent-context` | `agent-context/`        | Plain markdown fragments     | —                 |

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

| Field            | Type       | Required | Description                                                |
| ---------------- | ---------- | -------- | ---------------------------------------------------------- |
| `name`           | `string`   | Yes      | Unique plugin identifier (kebab-case recommended)          |
| `version`        | `string`   | Yes      | SemVer: `MAJOR.MINOR.PATCH`                                |
| `description`    | `string`   | No       | Human-readable description                                 |
| `engines.valora` | `string`   | No       | SemVer range declaring minimum Valora compatibility        |
| `contributes`    | `string[]` | Yes      | List of contribution types (see table above)               |
| `permissions`    | `string[]` | No       | Required permissions; must include `shell-hooks` for hooks |
| `requiresBinary` | `object[]` | No       | External binaries the plugin depends on                    |

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
6. Plugin resource directories are fed into `AgentLoader`, `CommandLoader`, and `HookExecutionService` via `registerPluginDir()` / `addPluginHooks()`.

Arch-unit rule: the `plugins` module may only import from `['plugins', 'types', 'config', 'utils', 'output']`. It must not import executor or service modules.

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
