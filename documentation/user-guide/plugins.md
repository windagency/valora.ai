# Plugins

> Extend Valora with additional agents, commands, hooks, prompts, templates, and compression strategies — packaged as self-contained plugin directories.

## What Plugins Can Contribute

| Contribution type | What it adds                                          | Example                                      |
| ----------------- | ----------------------------------------------------- | -------------------------------------------- |
| `agents`          | New AI personas loaded alongside built-in agents      | Rust specialist, Kubernetes SRE              |
| `commands`        | New CLI verbs (also exposed as MCP tools)             | `valora gain`, `valora lint-report`          |
| `hooks`           | PreToolUse / PostToolUse shell scripts                | RTK token-filter, custom linters             |
| `prompts`         | Reusable prompt stages for pipelines                  | Custom validators, context loaders           |
| `templates`       | PR, PRD, plan, and standards scaffolds                | Team PR template, house-style plan           |
| `mcps`            | Bundled external MCP server declarations              | Packaged Playwright config                   |
| `agent-context`   | Markdown fragments injected into agent system prompts | Tool-specific docs (e.g. RTK output shapes)  |
| `code`            | TypeScript modules registered via `PluginAPI`         | Custom compression strategies, LLM providers |

## Installing a Plugin

Plugins are discovered from four locations on every startup. Later locations take precedence over earlier ones for conflicting contributions (last wins):

| Location                    | Scope                          | Install method    |
| --------------------------- | ------------------------------ | ----------------- |
| `data/plugins/`             | Shipped with Valora (built-in) | n/a               |
| `~/.valora/plugins/`        | Personal — all your projects   | copy directory    |
| `.valora/plugins/`          | This project only              | copy directory    |
| `node_modules/@windagency/` | This project — npm packages    | npm / pnpm / yarn |

```bash
# Install a plugin for this project only
cp -r my-plugin .valora/plugins/

# Install a plugin for all your projects
cp -r my-plugin ~/.valora/plugins/

# Install an official plugin via npm (auto-discovered, no copy needed)
pnpm add @windagency/valora-plugin-ollama
```

Any npm package under `@windagency/` whose name starts with `valora-plugin-` and contains a valid `valora-plugin.json` is discovered automatically from `node_modules/`. You still need to add its name to `plugins.enabled` to activate it.

No restart or rebuild required after adding a plugin.

## Code Plugins

Code plugins contribute a compiled JavaScript module (`dist/index.js`) that Valora dynamically imports and passes a `PluginAPI` object to. Use them to register **compression strategies**, future LLM providers, and other runtime extensions.

```json
{
	"name": "my-compression-plugin",
	"version": "1.0.0",
	"contributes": ["code"],
	"permissions": ["code-exec"],
	"codeEntrypoint": "dist/index.js"
}
```

The module must export a `register(api)` function:

```javascript
// dist/index.js (compiled output)
export function register(api) {
	api.compression.registerStrategy('cargo', (output, _command) => {
		return output
			.split('\n')
			.filter((l) => !l.startsWith('   Compiling'))
			.join('\n');
	});
}
```

Three built-in compression plugins ship under `data/plugins/` and register 17 tool strategies. They are the reference implementation for the `code` contribution type:

| Plugin                                 | Strategies covered                                              |
| -------------------------------------- | --------------------------------------------------------------- |
| `valora-plugin-compression-typescript` | `tsc`, `eslint`, `jest`, `vitest`, `pnpm`, `npm`, `npx`, `yarn` |
| `valora-plugin-compression-universal`  | `git`, `grep`, `rg`, `docker`, `make`                           |
| `valora-plugin-compression-python`     | `python`, `pytest`                                              |

These are enabled by default and require no configuration.

## Official Plugins

The following plugins are published as npm packages under `@windagency/`:

| Package                      | What it adds                                                    |
| ---------------------------- | --------------------------------------------------------------- |
| `valora-plugin-engineering`  | Engineering commands: `plan`, `implement`, `review-code`, …     |
| `valora-plugin-product`      | Product commands: `refine-specs`, `create-prd`, `fetch-task`, … |
| `valora-plugin-implement`    | Implementation agents (TypeScript, backend, frontend, React)    |
| `valora-plugin-qa`           | QA agent and commands: `test`, `validate-coverage`, `pre-check` |
| `valora-plugin-quality-gate` | Asserter agent and `assert` command                             |
| `valora-plugin-secops`       | SecOps agent for security and compliance tasks                  |
| `valora-plugin-platform`     | Platform-engineer agent for infrastructure tasks                |
| `valora-plugin-design`       | UI/UX designer agent                                            |
| `valora-plugin-docs`         | Documentation generation commands                               |
| `valora-plugin-ollama`       | Self-managed Ollama LLM provider (code plugin)                  |

```bash
pnpm add @windagency/valora-plugin-ollama
# then add "valora-plugin-ollama" to plugins.enabled in .valora/config.json
```

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
4. `node_modules/@windagency/valora-plugin-*` (npm packages, project-scoped)

A project-level plugin can therefore override any agent, command, or prompt shipped by a built-in plugin.

## Plugin Dependencies (`requires`)

If your plugin depends on another plugin being loaded first, declare it in the manifest:

```json
{
	"name": "my-advanced-plugin",
	"version": "1.0.0",
	"requires": ["valora-plugin-ollama"],
	"contributes": ["commands"]
}
```

Valora loads `requires` entries before the declaring plugin. If a required plugin is not found or not enabled, the dependent plugin is skipped with a warning.

## `overrides`

To explicitly signal that a plugin supersedes a named built-in resource (agent, command, prompt), declare it:

```json
{
	"overrides": ["gather-knowledge"]
}
```

This is informational — Valora logs a notice rather than silently shadowing. The last-wins resolution still applies regardless of whether `overrides` is declared.

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

| Permission    | Required for                              |
| ------------- | ----------------------------------------- |
| `shell-hooks` | `hooks` contributions                     |
| `code-exec`   | `code` contributions (TypeScript modules) |

Future permissions (`network`, `fs-write`, `mcp-connect`) are reserved for additional code-contribution surfaces not yet released.

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
