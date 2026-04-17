# Plugins

> Extend Valora with additional agents, commands, hooks, prompts, and templates — packaged as self-contained plugin directories.

## What Plugins Can Contribute

| Contribution type | What it adds                                          | Example                                     |
| ----------------- | ----------------------------------------------------- | ------------------------------------------- |
| `agents`          | New AI personas loaded alongside built-in agents      | Rust specialist, Kubernetes SRE             |
| `commands`        | New CLI verbs (also exposed as MCP tools)             | `valora gain`, `valora lint-report`         |
| `hooks`           | PreToolUse / PostToolUse shell scripts                | RTK token-filter, custom linters            |
| `prompts`         | Reusable prompt stages for pipelines                  | Custom validators, context loaders          |
| `templates`       | PR, PRD, plan, and standards scaffolds                | Team PR template, house-style plan          |
| `mcps`            | Bundled external MCP server declarations              | Packaged Playwright config                  |
| `agent-context`   | Markdown fragments injected into agent system prompts | Tool-specific docs (e.g. RTK output shapes) |

## Installing a Plugin

Drop a plugin directory (containing `valora-plugin.json`) into any of the three discovery locations:

| Location             | Scope                          |
| -------------------- | ------------------------------ |
| `data/plugins/`      | Shipped with Valora (built-in) |
| `~/.valora/plugins/` | Personal — all projects        |
| `.valora/plugins/`   | Project-specific               |

```bash
# Install a plugin for this project only
cp -r my-plugin .valora/plugins/

# Install a plugin for all your projects
cp -r my-plugin ~/.valora/plugins/
```

Valora scans all three locations on every startup. No restart or rebuild required.

## Enabling and Disabling Plugins

List the plugins you want active in `.valora/config.json`:

```json
{
	"plugins": {
		"enabled": ["valora-plugin-rtk", "acme-react-agents"]
	}
}
```

Plugins not listed in `enabled` are discovered but not loaded. To disable a plugin, remove its name from the array.

## Startup Feedback

When Valora loads plugins it logs a summary to the console:

```
[plugins] Loaded 2 plugin(s): valora-plugin-rtk, acme-react-agents
[plugins] Skipped 1 plugin(s): old-plugin (not in plugins.enabled)
```

Any plugin that fails manifest validation is skipped with a warning, never a hard failure.

## Checking Plugin Status

```bash
valora doctor
```

The doctor command includes a **Plugins** section:

```
Plugins
  ✓ valora-plugin-rtk      0.1.0  hooks, agent-context
  ✓ acme-react-agents      1.2.0  agents, commands
  ✗ old-plugin             —      not enabled
```

---

<details>
<summary><strong>Discovery order, permission declarations, requires-binary, and troubleshooting</strong></summary>

## Discovery Order

Valora resolves contribution conflicts in this precedence order (later wins):

1. `data/plugins/` (built-in)
2. `~/.valora/plugins/` (global user)
3. `.valora/plugins/` (project)

A project-level plugin can therefore override any agent, command, or prompt shipped by a built-in plugin.

## Permission Declarations

A plugin that contributes hooks must declare the `shell-hooks` permission in its manifest. Valora reads this field at load time and will not register hooks from a plugin that lacks the declaration.

```json
{
	"name": "valora-plugin-rtk",
	"version": "0.1.0",
	"permissions": ["shell-hooks"],
	"contributes": ["hooks", "agent-context"]
}
```

Available permissions:

| Permission    | Required for          |
| ------------- | --------------------- |
| `shell-hooks` | `hooks` contributions |

Future permissions (`network`, `fs-write`, `mcp-connect`) are reserved for code-contribution types not yet released.

## `requiresBinary`

Plugins that wrap an external CLI tool can declare a binary requirement so Valora surfaces a friendly error when the tool is missing:

```json
{
	"requiresBinary": [{ "name": "rtk", "version": ">=0.5", "install": "brew install rtk" }]
}
```

Valora checks `$PATH` for the named binary at load time. If it is absent, the plugin is skipped and the `install` hint is shown:

```
[plugins] Skipping valora-plugin-rtk: binary "rtk" not found.
          Install: brew install rtk
```

## Troubleshooting

**Plugin not loading**

1. Confirm the plugin directory contains `valora-plugin.json`
2. Check the plugin name appears in `plugins.enabled` in `.valora/config.json`
3. Run `valora doctor` and inspect the Plugins section
4. Check `.valora/logs/latest.log` for manifest validation errors

**Hooks not running**

1. Confirm the manifest includes `"shell-hooks"` in `permissions`
2. Confirm the plugin contains a `hooks.json` file with valid hook entries
3. Run `valora doctor` and check the hooks listed for the plugin

**Agent not appearing**

1. Confirm the plugin's `agents/` directory contains a valid agent markdown file with YAML front matter
2. Confirm `contributes` in the manifest includes `"agents"`
3. Restart Valora if you added the plugin during an active session

</details>
