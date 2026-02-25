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

## Installation

To install the toolkit, run the setup command or use the install script directly:

```bash
bash .ai/scripts/install-tools.sh --all    # Install all tools
bash .ai/scripts/install-tools.sh --check  # Verify installation
```
