---
updated: 2026-05-07
---

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

The recommended way to install an official plugin is `valora plugin add`. For local or custom plugins, copy the directory into the appropriate scope location.

Plugins are discovered from four locations on every startup. Later locations take precedence over earlier ones for conflicting contributions (last wins):

| Location                    | Scope                          | Install method                                        |
| --------------------------- | ------------------------------ | ----------------------------------------------------- |
| `data/plugins/`             | Shipped with Valora (built-in) | n/a                                                   |
| `~/.valora/plugins/`        | Personal — all your projects   | `valora plugin add` or copy directory                 |
| `.valora/plugins/`          | This project only              | `valora plugin add --scope project` or copy directory |
| `node_modules/@windagency/` | This project — npm packages    | `pnpm add` / `npm install`                            |

After installing, add the plugin's short name to `plugins.enabled` in `.valora/config.json` to activate it. No restart required.

---

## `valora plugin add`

Download and install a plugin from the npm registry.

```
valora plugin add <name> [options]
```

| Option            | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `--scope <scope>` | Where to install: `user` (default), `project`, or `global` |

The command fetches the plugin tarball from npm and extracts it directly into the scope directory. It does not modify your project's `package.json` or `node_modules/`.

**After installing:** add the plugin's short name to `plugins.enabled` in `.valora/config.json`:

```json
{
	"plugins": {
		"enabled": ["valora-plugin-ollama"]
	}
}
```

### Scope values

| Scope              | Target directory                        | Typical use                                |
| ------------------ | --------------------------------------- | ------------------------------------------ |
| `user` _(default)_ | `~/.valora/plugins/`                    | Available in all your projects             |
| `project`          | `.valora/plugins/` (nearest `.valora/`) | This project only; committable to the repo |
| `global`           | `~/.valora/plugins/` (same as `user`)   | Alias for `user`                           |

### Examples

```bash
# Install a plugin for all your projects (default scope)
valora plugin add compression-universal

# Install using the full package name
valora plugin add @windagency/valora-plugin-ollama

# Install for this project only
valora plugin add rtk --scope project

# Install a plugin explicitly for your user account
valora plugin add engineering --scope user
```

## `valora plugin remove`

Remove an installed plugin from a scope directory.

```
valora plugin remove <name> [options]
```

| Option            | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `--scope <scope>` | Where to remove from: `user` (default), `project`, or `global` |

The plugin directory is deleted from disk. Remove the plugin's name from `plugins.enabled` in `.valora/config.json` as well to avoid a stale reference.

### Examples

```bash
# Remove from your personal plugins
valora plugin remove rtk

# Remove from this project only
valora plugin remove compression-universal --scope project
```

---

## `valora plugin update`

Update installed plugins to their latest versions. Valora checks the plugin registry and the npm registry for newer versions.

```
valora plugin update [name] [--check]
```

| Argument / Option | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `[name]`          | Update only the named plugin (e.g. `rtk`). Omit to update all. |
| `--check`         | List available plugin updates without installing.              |

Plugins installed via your project's package manager (`npm` scope from `node_modules`) are reported but not installed — update those via `npm install`, `pnpm add`, etc.

### Automatic plugin updates and consent

When `autoUpdate.mode=auto` is set in `~/.valora/config.json`, the postaction hook checks the registry for outdated plugins on every CLI run. The default is to **prompt before each install** so a compromised registry cannot silently change plugin code on your machine. The behaviour is controlled by `plugins.autoUpdate`:

```json
{
	"autoUpdate": { "mode": "auto" },
	"plugins": {
		"autoUpdate": "prompt"
	}
}
```

| `plugins.autoUpdate` | Behaviour                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt` (default)   | Confirm interactively before each install. Falls back to **check-only** when there is no TTY (CI / piped). The integrity check (sha256) result is shown in the prompt. |
| `check-only`         | Print a one-line notice listing plugins with available updates; never install. Use `valora plugin update` to apply.                                                    |
| `install`            | Legacy silent install. Not recommended; restored only for users who explicitly want it.                                                                                |

When prompted, you will see the plugin name, the version diff, and whether the tarball was sha256-verified against the registry:

```
Update valora-plugin-rtk 1.0.0 → 1.1.0 (verified by sha256)? [y/N]
```

A plugin without an integrity field shows `(no integrity check)` instead — it will install if you confirm, but consider it the same trust level as `pnpm add` of a fresh package.

### Examples

```bash
# See which plugins have updates
valora plugin update --check

# Update all outdated plugins
valora plugin update

# Update a specific plugin
valora plugin update rtk
```

---

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

Three compression plugins ship as standalone packages under `packages/`. They register 17 tool strategies and serve as the reference implementation for the `code` contribution type:

| Package (source)                                 | Strategies covered                                              |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `packages/valora-plugin-compression-typescript/` | `tsc`, `eslint`, `jest`, `vitest`, `pnpm`, `npm`, `npx`, `yarn` |
| `packages/valora-plugin-compression-universal/`  | `git`, `grep`, `rg`, `docker`, `make`                           |
| `packages/valora-plugin-compression-python/`     | `python`, `pytest`                                              |

These are enabled by default and require no configuration. Each package has its own `package.json`, `tsconfig.json`, and `valora-plugin.json` manifest. Run `pnpm build:plugins` to (re)compile all three.

## Official Plugins

The following plugins are published as npm packages under `@windagency/`:

| Package                      | What it adds                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `valora-plugin-rtk`          | RTK (Rust Token Killer) hook — reduces LLM token consumption by 60–90% for known-noisy CLI tools |
| `valora-plugin-engineering`  | Engineering commands: `plan`, `implement`, `review-code`, …                                      |
| `valora-plugin-product`      | Product commands: `refine-specs`, `create-prd`, `fetch-task`, …                                  |
| `valora-plugin-implement`    | Implementation agents (TypeScript, backend, frontend, React)                                     |
| `valora-plugin-qa`           | QA agent and commands: `test`, `validate-coverage`, `pre-check`                                  |
| `valora-plugin-quality-gate` | Asserter agent and `assert` command                                                              |
| `valora-plugin-secops`       | SecOps agent for security and compliance tasks                                                   |
| `valora-plugin-platform`     | Platform-engineer agent for infrastructure tasks                                                 |
| `valora-plugin-design`       | UI/UX designer agent                                                                             |
| `valora-plugin-docs`         | Documentation generation commands                                                                |
| `valora-plugin-ollama`       | Self-managed Ollama LLM provider (code plugin)                                                   |
| `valora-plugin-openrouter`   | OpenRouter LLM provider (code plugin, requires API key)                                          |

```bash
# Ollama (local, no API key)
pnpm add @windagency/valora-plugin-ollama
# then add "valora-plugin-ollama" to plugins.enabled in .valora/config.json

# OpenRouter (cloud gateway, requires OPENROUTER_API_KEY)
pnpm add @windagency/valora-plugin-openrouter
# then add "valora-plugin-openrouter" to plugins.enabled in .valora/config.json
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

### `valora plugin list`

Show every plugin Valora has discovered, grouped by status:

```bash
valora plugin list
```

```
Plugins  (2 enabled, 1 disabled)

  ✓ valora-plugin-rtk           1.0.0  hooks, code      [project]
  ✓ valora-core-generators      2.5.0  agents, commands [built-in]
  ○ valora-plugin-qa            0.3.0  agents, commands [user]  not in plugins.enabled
```

| Marker | Meaning                                 |
| ------ | --------------------------------------- |
| `✓`    | Enabled and loaded                      |
| `○`    | Discovered but not in `plugins.enabled` |
| `✗`    | Invalid manifest — skipped              |

The `[location]` tag shows where the plugin was found: `built-in`, `user`, `project`, or `npm`.

### `valora doctor`

The doctor command includes a **Plugins** section (enabled plugins only):

```bash
valora doctor
```

```
Plugins
  ✓ valora-plugin-rtk      1.0.0  hooks, code
  ✓ acme-react-agents      1.2.0  agents, commands
  ✗ old-plugin             —      not enabled
```

### `valora plugin available`

Browse all plugins published in the `@windagency` registry:

```bash
valora plugin available
```

```
Available plugins  (14 total, @windagency registry)

  ✓ valora-plugin-rtk           1.0.0  RTK integration…          installed
  ○ valora-plugin-engineering   1.0.0  Engineering workflow commands
  ○ valora-plugin-qa            0.3.0  QA agent and commands

Install with: valora plugin add <name>
```

Plugins already installed on disk are marked `✓`. Use `valora plugin add <name>` to add any listed plugin.

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
	"version": "1.0.0",
	"permissions": ["shell-hooks", "code-exec", "fs-write", "network"],
	"contributes": ["hooks", "code"]
}
```

Available permissions:

| Permission    | Status        | Effect                                                                                                                                                          |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell-hooks` | Enforced      | Required to register `hooks` contributions. A plugin that contributes `hooks` without this permission has its hooks silently dropped (with a warn).             |
| `code-exec`   | Enforced      | Required to dynamically import the plugin's `codeEntrypoint` and run `register()`. Also required for `validators` contributions.                                |
| `mcp-connect` | Enforced      | Required to register external MCP servers from `mcps` contributions. A plugin that contributes `mcps` without this permission has its servers silently dropped. |
| `fs-read`     | Informational | Documentation-only; the runtime does not gate file-system reads. The host logs a warn at load when this is declared.                                            |
| `fs-write`    | Informational | Documentation-only; the runtime does not gate file-system writes. The host logs a warn at load when this is declared.                                           |
| `network`     | Informational | Documentation-only; the runtime does not gate outbound connections. The host logs a warn at load when this is declared.                                         |

**Why some permissions are informational.** Code plugins run in the host process with full Node capability — there is no in-process sandbox today. The `fs-*` and `network` tokens are reserved for a future capability-gating story documented in [ADR-014: Plugin Capability Gating](../adr/014-plugin-capability-gating.md). Until that lands, treat plugin code as you would any other npm dependency: only install plugins from sources you trust.

### Hardening with the Node Permission Model (optional)

Security-sensitive teams can raise the floor today by launching Valora under [Node 20+'s permission model](https://nodejs.org/api/permissions.html). This is process-wide (not per-plugin) but materially reduces the impact of a compromised plugin:

```bash
# Allow only the directories Valora actually needs to read and write
node --permission \
     --allow-fs-read=$HOME/.valora \
     --allow-fs-read=$(pwd)/.valora \
     --allow-fs-write=$HOME/.valora \
     --allow-fs-write=$(pwd)/.valora \
     "$(which valora)" "$@"
```

Wrap this in a shell script your team aliases as `valora`. With these flags, a malicious plugin's `fs.writeFileSync('/etc/cron.d/evil', ...)` is blocked by the Node runtime regardless of what the plugin's manifest claims. Network access can be similarly restricted via `--allow-net=...`. Audit `valora doctor` for plugins that declare informational permissions (`fs-write`, `network`) before enabling them — those manifests describe what the plugin _intends_ to do, not what the runtime currently permits.

## `requiresBinary`

Plugins that wrap an external CLI tool can declare a binary requirement so Valora surfaces a friendly error when the tool is missing — and optionally offer to run an install command on the user's behalf:

```json
{
	"requiresBinary": [
		{
			"name": "obsidian",
			"installCommand": "brew install --cask obsidian",
			"install": "https://obsidian.md/download"
		}
	]
}
```

Valora checks `$PATH` (or `checkCommand`) at install time. If the binary is absent and `installCommand` is set, you are **always** prompted before the command runs:

```
The plugin requires 'obsidian'. The install command is:
  brew install --cask obsidian

Run this command to install 'obsidian'? [y/N]
```

The legacy `autoInstall: true` flag in the manifest is now informational only — it does not bypass the prompt. This closes the privilege-escalation surface where an updated plugin manifest could silently run an arbitrary shell command on first install.

## Troubleshooting

**`valora plugin add` fails**

1. Confirm you have network access and that npm can reach the registry (`npm ping`)
2. Check the package name is correct: `@windagency/valora-plugin-<name>`
3. For `--scope project`, confirm you are inside a directory that has (or is a child of) a `.valora/` folder
4. Run manually to see the full npm error: `npm pack @windagency/valora-plugin-<name>`

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
