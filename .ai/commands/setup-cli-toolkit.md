---
name: setup-cli-toolkit
description: Install and verify the modern CLI toolkit (rg, fd, jq, yq, fzf, eza, zoxide, lazygit)
experimental: true
argument-hint: "'[--all | --check | tool1 tool2 ...]'"
allowed-tools:
  - run_terminal_cmd
  - read_file
model: claude-haiku-4.5
agent: platform-engineer
---

# Setup CLI Toolkit

## Role

Use the `platform-engineer` agent profile.

## Goal

Install and verify the modern CLI toolkit on the current system. The toolkit provides token-efficient replacements for legacy CLI commands.

## Success Criteria

- All requested tools are installed and available on PATH
- `--check` confirms each tool with its version
- No errors during installation

## Rules

1. Use the bundled install script at `.ai/scripts/install-tools.sh`
2. The script is idempotent -- safe to run repeatedly
3. Do not modify the install script
4. Report any installation failures clearly

## Process

### Stage 1: Install Tools

Run the install script with the provided arguments. If no arguments are given, install all tools.

```bash
# Install all tools
bash .ai/scripts/install-tools.sh --all

# Or install specific tools
bash .ai/scripts/install-tools.sh jq yq rg fd fzf lazygit zoxide eza
```

### Stage 2: Verify Installation

Run the check command to confirm all tools are available:

```bash
bash .ai/scripts/install-tools.sh --check
```

### Stage 3: Report Results

Report the installation status for each tool:
- Tool name
- Installed version
- Any errors encountered

## Error Handling

- If a tool fails to install, report the error and continue with remaining tools
- If the install script itself fails, check that `curl` or `wget` is available
- If `~/.local/bin` is not on PATH, add it:
  ```bash
  export PATH="$HOME/.local/bin:$PATH"
  ```
