# Modern CLI Toolkit Reference

Reference documentation for modern CLI tools that replace legacy commands with token-efficient alternatives.

## Reference Files

| File | Tools Covered | Use When |
|------|---------------|----------|
| [rg-fd.md](./rg-fd.md) | ripgrep (`rg`), `fd` | Searching file contents or finding files by name/extension |
| [jq-yq.md](./jq-yq.md) | `jq`, `yq` | Parsing JSON, YAML, TOML, or XML configuration files |
| [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) | `fzf`, `eza`, `zoxide` | Fuzzy finding, directory listing, or smart navigation |
| [lazygit.md](./lazygit.md) | `lazygit` | Complex multi-step Git workflows |

## Quick Mapping

| Legacy Command | Modern Replacement | Reference |
|----------------|-------------------|-----------|
| `grep -r` | `rg` | [rg-fd.md](./rg-fd.md) |
| `find` | `fd` | [rg-fd.md](./rg-fd.md) |
| `cat file.json` + parse | `jq` | [jq-yq.md](./jq-yq.md) |
| `cat file.yaml` + parse | `yq` | [jq-yq.md](./jq-yq.md) |
| `ls -la` / `tree` | `eza` | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| `cd` + navigation | `zoxide` | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| manual search | `fzf` | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| multi-step `git` | `lazygit` | [lazygit.md](./lazygit.md) |

## Automatic Enforcement

These rules are **automatically enforced** via a PreToolUse hook. When a `run_terminal_cmd` call uses a legacy command, it is blocked with a deny message that suggests the modern alternative.

### What Gets Blocked

| Legacy Command | Blocked Pattern | Suggestion |
|---|---|---|
| `grep` / `egrep` / `fgrep` | Any form as primary command | Use `rg` |
| `find` | Any form as primary command | Use `fd` |
| `cat *.json` | `cat` on `.json` files | Use `jq` |
| `cat *.yaml` / `*.yml` | `cat` on YAML files | Use `yq` |
| `ls` | Any form as primary command | Use `eza` |
| `tree` | Any form as primary command | Use `eza --tree` |
| `npm` | Any subcommand (configurable) | Use `pnpm` |
| `git push` | All variants | Requires human approval |

### What is Allowed

- Legacy commands **after a pipe** are allowed (e.g., `rg foo | grep -v bar`)
- Commands inside `echo`, `printf`, `export`, or variable assignments are skipped
- `npx` is not blocked (only `npm`)
- All `git` commands except `push` are allowed

### Configuration

The package manager rule is configurable in `.ai/hooks.json`:

```json
{
  "enforcement": {
    "package_manager": {
      "enabled": true,
      "blocked": "npm",
      "replacement": "pnpm"
    }
  }
}
```

Set `"enabled": false` to disable the package manager check, or change `"blocked"` / `"replacement"` to match your project convention. This file is separate from `.ai/config.json` so that `valora config setup` does not overwrite hook configuration.

For full details, see [ADR-008: PreToolUse CLI Enforcement](../../adr/008-pretooluse-cli-enforcement.md).

## Installation

To install the toolkit, run the setup command or use the install script directly:

```bash
bash .ai/scripts/install-tools.sh --all    # Install all tools
bash .ai/scripts/install-tools.sh --check  # Verify installation
```
