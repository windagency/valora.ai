# `valora-defaults`

A built-in Valora plugin that is always active. It contributes two things:

1. **A `PreToolUse` hook** that enforces modern CLI tooling and blocks accidental `git push` without human approval.
2. **A pre-wired MCP server catalogue** with 15 commonly used servers.

Plugin authors do not call into this plugin. This document explains what it enforces and how to work with it.

---

## CLI enforcement hook

When the host runs a terminal command, `enforce-modern-cli.sh` intercepts it and checks each segment against a blocklist. Commands that match are denied with an explanation.

### Blocked commands

| Blocked                    | Use instead                                |
| -------------------------- | ------------------------------------------ |
| `grep`, `egrep`, `fgrep`   | `rg` (ripgrep)                             |
| `find`                     | `fd`                                       |
| `cat *.json`               | `jq`                                       |
| `cat *.yaml` / `cat *.yml` | `yq`                                       |
| `ls`                       | `eza`                                      |
| `tree`                     | `eza --tree`                               |
| `git push`                 | Requires explicit human approval           |
| `npm` (configurable)       | `pnpm` (default replacement, configurable) |

Segments that are shell builtins (`echo`, `printf`, `export`) or variable assignments (`FOO=bar`) are skipped. A `sudo` prefix is stripped before matching.

### Package manager rule

The `npm` → `pnpm` rule is configurable. If your plugin ships a `hooks.json` with an `enforcement.package_manager` block, it takes precedence:

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "^run_terminal_cmd$",
				"hooks": [
					{
						"type": "command",
						"command": "...",
						"enforcement": {
							"package_manager": {
								"enabled": false
							}
						}
					}
				]
			}
		]
	}
}
```

Fields:

| Field         | Type    | Default  | Description                                       |
| ------------- | ------- | -------- | ------------------------------------------------- |
| `enabled`     | boolean | `true`   | Set to `false` to disable the rule entirely       |
| `blocked`     | string  | `"npm"`  | Command name to block                             |
| `replacement` | string  | `"pnpm"` | Suggested replacement shown in the denial message |

---

## MCP server catalogue

`mcps.json` registers 15 pre-configured MCP servers. Users are prompted for approval before any server is used (`requires_approval: true` on all entries). High-risk servers prompt on every use (`remember_approval: "always_ask"`).

### Available servers

| ID                | Package                               | Risk   |
| ----------------- | ------------------------------------- | ------ |
| `playwright`      | `@playwright/mcp@latest`              | medium |
| `figma`           | `@anthropic/mcp-figma`                | low    |
| `github`          | `@modelcontextprotocol/server-github` | medium |
| `chrome-devtools` | `chrome-devtools-mcp`                 | medium |
| `context7`        | `@upstash/context7-mcp`               | low    |
| `serena`          | `@oraios/serena-mcp`                  | medium |
| `terraform`       | `@hashicorp/terraform-mcp-server`     | high   |
| `mongodb`         | `@mongodb-js/mongodb-mcp-server`      | medium |
| `elastic`         | `@elastic/mcp-server`                 | medium |
| `browserstack`    | `@browserstack/mcp-server`            | medium |
| `deep-research`   | `@octagonai/deep-research-mcp`        | low    |
| `firebase`        | `firebase-tools mcp`                  | high   |
| `gcloud`          | `@googleapis/gcloud-mcp`              | high   |
| `grafana`         | `@grafana/mcp-grafana`                | low    |
| `storybook`       | `@storybook/addon-mcp`                | low    |

High-risk servers (`terraform`, `firebase`, `gcloud`) additionally carry a `tool_blocklist` for their most destructive operations and have `remember_approval: "always_ask"` so they re-prompt on every use.

---

## Manifest

```json
{
	"name": "valora-defaults",
	"version": "1.0.0",
	"contributes": ["hooks", "mcps"],
	"permissions": ["shell-hooks", "mcp-connect"],
	"engines": { "valora": ">=0.1.0" }
}
```

Both the `contributes` entry and its paired permission are required. The loader silently drops hooks without `shell-hooks` and MCPs without `mcp-connect`.
