# Auto-update

> Valora checks for new versions automatically and shows a reminder when an update is available — for both the core CLI and your installed plugins.

When a newer version is available, a banner is printed to your terminal after your command finishes:

```
┌─ Update available ─────────────────────────────────────┐
│  2.5.0  →  2.6.1                                       │
│  Run: valora update                                     │
│                                                        │
│  Plugins:                                              │
│    valora-plugin-rtk  1.0.0  →  1.1.0                  │
│  Run: valora plugin update                             │
│  Disable: set autoUpdate.mode=disabled in ~/.valora/   │
│  config.json                                           │
└────────────────────────────────────────────────────────┘
```

Run `valora update` to install the new core version. Run `valora plugin update` to update your plugins. The checks never delay your command.

<details>
<summary><strong>How the background check works</strong></summary>

After each command completes, Valora runs a background check against the npm registry (at most once per day) for both the core CLI and your installed plugins. The check is **non-blocking** — the banner appears after your command finishes, not before.

The check is automatically suppressed in:

- CI environments (`CI=true`)
- Non-interactive (piped or redirected) sessions
- MCP mode (`AI_MCP_ENABLED=true`)

</details>

---

## `valora update`

Install the latest version of Valora.

```
valora update [options]
```

| Option    | Description                                      |
| --------- | ------------------------------------------------ |
| `--check` | Check for an available update without installing |
| `--force` | Reinstall even if already on the latest version  |

**On success:** the new version is installed and vendored tools (jq, ripgrep, fzf, lazygit) are refreshed automatically by the package manager's postinstall hook.

**On failure:** the exact install command is printed so you can run it yourself.

### Examples

```bash
# Check whether an update is available
valora update --check

# Install the latest version
valora update

# Reinstall the current version (e.g. to repair vendored tools)
valora update --force
```

---

## Configuration

Add an `autoUpdate` block to `~/.valora/config.json` to change the default behaviour:

```json
{
	"autoUpdate": {
		"mode": "reminder",
		"frequencyDays": 1
	}
}
```

| Key             | Type                                     | Default      | Description                                |
| --------------- | ---------------------------------------- | ------------ | ------------------------------------------ |
| `mode`          | `"reminder"` \| `"disabled"` \| `"auto"` | `"reminder"` | Controls when and how updates are surfaced |
| `frequencyDays` | integer (1–365)                          | `1`          | Minimum days between background checks     |

### Mode values

| Mode       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reminder` | Show a banner when an update is available; you run `valora update` manually. This is the default.                                                                                                                                                                                                                                                                                                                |
| `disabled` | Suppress all background checks and banners. `valora update` still works.                                                                                                                                                                                                                                                                                                                                         |
| `auto`     | After each command, silently install the latest version in the background. Prints one line to stderr before installing (`Updating Valora to v…`) and a confirmation on success. On failure, nothing is printed — run `valora update` to retry. Plugin updates follow the same mode. Plugins installed via your project's package manager (`npm`-scope) are exempt from auto-install and instead show a reminder. |

---

## Plugin updates

Plugin update checks run alongside the core check and use the same `autoUpdate` configuration.

**Version lookup order:**

1. The `data/plugins/registry.json` catalogue (fetched from GitHub) is checked first.
2. If a plugin is not listed in the catalogue, the npm registry is queried directly.

**Scopes checked:** `user` (`~/.valora/plugins/`), `project` (`.valora/plugins/`), `global` (`/usr/local/share/valora/plugins/`), and `npm` (`node_modules/@windagency/valora-plugin-*`). Built-in plugins ship with the core package and are never updated separately.

**npm-scope plugins** are managed by your project's package manager. Valora will report that an update is available but will not install it — update those plugins via `npm install`, `pnpm add`, etc.

### `valora plugin update`

```
valora plugin update [name] [--check]
```

| Argument / Option | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `[name]`          | Update only the named plugin (e.g. `rtk`). Omit to update all. |
| `--check`         | List available plugin updates without installing.              |

**Examples:**

```bash
# See which plugins have updates
valora plugin update --check

# Update all outdated plugins
valora plugin update

# Update a specific plugin
valora plugin update rtk
```

---

## Environment variables

| Variable                       | Effect                                         |
| ------------------------------ | ---------------------------------------------- |
| `VALORA_DISABLE_AUTO_UPDATE=1` | Disable update checks for this invocation only |
| `CI=true`                      | Update checks are automatically suppressed     |

---

## Troubleshooting

### The update command fails

If `valora update` fails, the exact retry command is printed. You can also run any of the following manually:

```bash
npm install -g @windagency/valora@latest
pnpm add -g @windagency/valora@latest
yarn global add @windagency/valora@latest
bun install -g @windagency/valora@latest
```

<details>
<summary><strong>Valora does not detect my package manager</strong></summary>

Valora inspects the path of the Node.js executable to infer which package manager owns the global install. It recognises the following path patterns:

| Manager        | Path pattern                            |
| -------------- | --------------------------------------- |
| pnpm           | `.local/share/pnpm` or `/pnpm/`         |
| bun            | `.bun/install/global`                   |
| yarn (classic) | `/yarn/global` or `.config/yarn/global` |
| npm            | `/lib/node_modules`                     |

If none of these match, Valora prints all four install commands and lets you choose:

```
Could not detect package manager. Run one of:
  npm install -g @windagency/valora@latest
  pnpm add -g @windagency/valora@latest
  yarn global add @windagency/valora@latest
  bun install -g @windagency/valora@latest
```

</details>
