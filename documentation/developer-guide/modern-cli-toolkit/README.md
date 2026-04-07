# Modern CLI Toolkit Reference

Reference documentation for modern CLI tools that replace legacy commands with token-efficient alternatives. These rules are **automatically enforced** via a PreToolUse hook — legacy commands in `run_terminal_cmd` calls are blocked with a deny message.

## Quick Reference

| Tool           | Purpose                                                     | Install                                        |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `rg` (ripgrep) | Search file contents — replaces `grep -r`                   | `brew install ripgrep` / `apt install ripgrep` |
| `fd`           | Find files by name/pattern — replaces `find`                | `brew install fd` / `apt install fd-find`      |
| `jq`           | Query and transform JSON — replaces `cat *.json`            | `brew install jq` / `apt install jq`           |
| `yq`           | Query and transform YAML/TOML/XML — replaces `cat *.yaml`   | `brew install yq` / `snap install yq`          |
| `fzf`          | Fuzzy finder for filtering candidate lists                  | `brew install fzf` / `apt install fzf`         |
| `eza`          | Directory listing with tree view — replaces `ls` and `tree` | `brew install eza` / `cargo install eza`       |
| `zoxide`       | Smart `cd` with frequency tracking                          | `brew install zoxide` / `cargo install zoxide` |
| `lazygit`      | Terminal UI for complex Git workflows                       | `brew install lazygit` / `go install lazygit`  |

Or install everything at once:

```bash
bash scripts/install-tools.sh --all    # Install all tools
bash scripts/install-tools.sh --check  # Verify installation
```

## Legacy → Modern Mapping

| Legacy Command          | Modern Replacement | Reference                                |
| ----------------------- | ------------------ | ---------------------------------------- |
| `grep -r`               | `rg`               | [rg-fd.md](./rg-fd.md)                   |
| `find`                  | `fd`               | [rg-fd.md](./rg-fd.md)                   |
| `cat file.json` + parse | `jq`               | [jq-yq.md](./jq-yq.md)                   |
| `cat file.yaml` + parse | `yq`               | [jq-yq.md](./jq-yq.md)                   |
| `ls -la` / `tree`       | `eza`              | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| `cd` + navigation       | `zoxide`           | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| manual search           | `fzf`              | [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) |
| multi-step `git`        | `lazygit`          | [lazygit.md](./lazygit.md)               |

## Reference Files

| File                                     | Tools Covered          | Use When                                                   |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| [rg-fd.md](./rg-fd.md)                   | ripgrep (`rg`), `fd`   | Searching file contents or finding files by name/extension |
| [jq-yq.md](./jq-yq.md)                   | `jq`, `yq`             | Parsing JSON, YAML, TOML, or XML configuration files       |
| [fzf-eza-zoxide.md](./fzf-eza-zoxide.md) | `fzf`, `eza`, `zoxide` | Fuzzy finding, directory listing, or smart navigation      |
| [lazygit.md](./lazygit.md)               | `lazygit`              | Complex multi-step Git workflows                           |

## Automatic Enforcement

The PreToolUse hook intercepts `run_terminal_cmd` calls and blocks legacy commands.

### What Gets Blocked

| Legacy Command             | Blocked Pattern               | Suggestion              |
| -------------------------- | ----------------------------- | ----------------------- |
| `grep` / `egrep` / `fgrep` | Any form as primary command   | Use `rg`                |
| `find`                     | Any form as primary command   | Use `fd`                |
| `cat *.json`               | `cat` on `.json` files        | Use `jq`                |
| `cat *.yaml` / `*.yml`     | `cat` on YAML files           | Use `yq`                |
| `ls`                       | Any form as primary command   | Use `eza`               |
| `tree`                     | Any form as primary command   | Use `eza --tree`        |
| `npm`                      | Any subcommand (configurable) | Use `pnpm`              |
| `git push`                 | All variants                  | Requires human approval |

### What Is Allowed

- Legacy commands **after a pipe** are allowed (e.g., `rg foo | grep -v bar`)
- Commands inside `echo`, `printf`, `export`, or variable assignments are skipped
- `npx` is not blocked (only `npm`)
- All `git` commands except `push` are allowed

### Configuring the Package Manager Rule

The package manager rule can be adjusted in `.valora/hooks.json`:

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

Set `"enabled": false` to disable the check, or change `"blocked"` / `"replacement"` to match your project convention. This file is separate from `.valora/config.json` so that `valora config setup` does not overwrite hook configuration.

For full details, see [ADR-008: PreToolUse CLI Enforcement](../../adr/008-pretooluse-cli-enforcement.md).
