# Auto-update

> Valora checks for new versions automatically and shows a reminder when an update is available.

## How it works

After each command completes, Valora runs a background check against the npm registry (at most once per day). When a newer version is available, a banner is printed to your terminal:

```
┌─ Update available ─────────────────────────────────────┐
│  2.5.0  →  2.6.1                                       │
│  Run: valora update                                     │
│  Disable: set autoUpdate.mode=disabled in ~/.valora/   │
│  config.json                                           │
└────────────────────────────────────────────────────────┘
```

The check is **non-blocking** — it never delays your command. The banner appears after your command finishes.

The check is automatically suppressed in:
- CI environments (`CI=true`)
- Non-interactive (piped or redirected) sessions
- MCP mode (`AI_MCP_ENABLED=true`)

---

## `valora update`

Install the latest version of Valora.

```
valora update [options]
```

| Option | Description |
| --- | --- |
| `--check` | Check for an available update without installing |
| `--force` | Reinstall even if already on the latest version |

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

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `"reminder"` \| `"disabled"` \| `"auto"` | `"reminder"` | Controls when and how updates are surfaced |
| `frequencyDays` | integer (1–365) | `1` | Minimum days between background checks |

### Mode values

| Mode | Behaviour |
| --- | --- |
| `reminder` | Show a banner when an update is available; you run `valora update` manually. This is the default. |
| `disabled` | Suppress all background checks and banners. `valora update` still works. |
| `auto` | Reserved for future use. |

---

## Environment variables

| Variable | Effect |
| --- | --- |
| `VALORA_DISABLE_AUTO_UPDATE=1` | Disable update checks for this invocation only |
| `CI=true` | Update checks are automatically suppressed |

---

## Troubleshooting

### Valora does not detect my package manager

Valora inspects the path of the Node.js executable to infer which package manager owns the global install. It recognises the following path patterns:

| Manager | Path pattern |
| --- | --- |
| pnpm | `.local/share/pnpm` or `/pnpm/` |
| bun | `.bun/install/global` |
| yarn (classic) | `/yarn/global` or `.config/yarn/global` |
| npm | `/lib/node_modules` |

If none of these match, Valora prints all four install commands and lets you choose:

```
Could not detect package manager. Run one of:
  npm install -g @windagency/valora@latest
  pnpm add -g @windagency/valora@latest
  yarn global add @windagency/valora@latest
  bun install -g @windagency/valora@latest
```

### The update command fails

If `valora update` fails, the exact retry command is printed. You can also run any of the following manually:

```bash
npm install -g @windagency/valora@latest
pnpm add -g @windagency/valora@latest
yarn global add @windagency/valora@latest
bun install -g @windagency/valora@latest
```
