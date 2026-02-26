#!/usr/bin/env bash
# enforce-modern-cli.sh — PreToolUse hook for run_terminal_cmd
# Blocks legacy CLI commands and suggests modern replacements.
# Exit 0 = allow, Exit 2 = deny (with JSON on stdout)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_FILE="$SCRIPT_DIR/../hooks.json"
CONFIG_FILE="$SCRIPT_DIR/../config.json"

# Read hook JSON from stdin and extract the command
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Load configurable package manager rule
PKG_ENABLED=true
PKG_BLOCKED="npm"
PKG_REPLACEMENT="pnpm"

if [[ -f "$HOOKS_FILE" ]]; then
  PKG_ENABLED=$(jq -r '.enforcement.package_manager.enabled // true' "$HOOKS_FILE" 2>/dev/null || echo "true")
  PKG_BLOCKED=$(jq -r '.enforcement.package_manager.blocked // "npm"' "$HOOKS_FILE" 2>/dev/null || echo "npm")
  PKG_REPLACEMENT=$(jq -r '.enforcement.package_manager.replacement // "pnpm"' "$HOOKS_FILE" 2>/dev/null || echo "pnpm")
elif [[ -f "$CONFIG_FILE" ]]; then
  PKG_ENABLED=$(jq -r '.enforcement.package_manager.enabled // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
  PKG_BLOCKED=$(jq -r '.enforcement.package_manager.blocked // "npm"' "$CONFIG_FILE" 2>/dev/null || echo "npm")
  PKG_REPLACEMENT=$(jq -r '.enforcement.package_manager.replacement // "pnpm"' "$CONFIG_FILE" 2>/dev/null || echo "pnpm")
fi

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": $reason
    }
  }'
  exit 2
}

check_segment() {
  local segment="$1"

  # Trim leading whitespace
  segment="$(echo "$segment" | sed 's/^[[:space:]]*//')"

  # Skip empty segments
  [[ -z "$segment" ]] && return 0

  # Extract the first command (before any pipe)
  local first_cmd
  first_cmd="$(echo "$segment" | sed 's/|.*//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')"

  # Skip echo/printf/export/variable-assignment segments
  if echo "$first_cmd" | grep -qE '^(echo|printf|export)\s'; then
    return 0
  fi
  # Variable assignment: FOO=bar or FOO="bar"
  if echo "$first_cmd" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*='; then
    return 0
  fi

  # Strip leading sudo
  first_cmd="$(echo "$first_cmd" | sed 's/^sudo[[:space:]]\+//')"

  # --- Hardcoded rules ---

  # grep/egrep/fgrep
  if echo "$first_cmd" | grep -qE '^(grep|egrep|fgrep)(\s|$)'; then
    deny "Use 'rg' (ripgrep) instead of grep/egrep/fgrep. See .ai/documentation/developer-guide/modern-cli-toolkit/rg-fd.md"
  fi

  # find
  if echo "$first_cmd" | grep -qE '^find(\s|$)'; then
    deny "Use 'fd' instead of 'find'. See .ai/documentation/developer-guide/modern-cli-toolkit/rg-fd.md"
  fi

  # cat with .json/.yaml/.yml files
  if echo "$first_cmd" | grep -qE '^cat\s.*\.(json|ya?ml)(\s|$)'; then
    if echo "$first_cmd" | grep -qE '\.(json)(\s|$)'; then
      deny "Use 'jq' instead of 'cat' for JSON files. See .ai/documentation/developer-guide/modern-cli-toolkit/jq-yq.md"
    else
      deny "Use 'yq' instead of 'cat' for YAML files. See .ai/documentation/developer-guide/modern-cli-toolkit/jq-yq.md"
    fi
  fi

  # ls
  if echo "$first_cmd" | grep -qE '^ls(\s|$)'; then
    deny "Use 'eza' instead of 'ls'. See .ai/documentation/developer-guide/modern-cli-toolkit/fzf-eza-zoxide.md"
  fi

  # tree
  if echo "$first_cmd" | grep -qE '^tree(\s|$)'; then
    deny "Use 'eza --tree' instead of 'tree'. See .ai/documentation/developer-guide/modern-cli-toolkit/fzf-eza-zoxide.md"
  fi

  # git push
  if echo "$first_cmd" | grep -qE '^git\s+push(\s|$)'; then
    deny "git push is blocked — requires human approval for safety."
  fi

  # --- Configurable package manager rule ---
  if [[ "$PKG_ENABLED" == "true" && -n "$PKG_BLOCKED" ]]; then
    if echo "$first_cmd" | grep -qE "^${PKG_BLOCKED}(\s|$)"; then
      deny "Use '${PKG_REPLACEMENT}' instead of '${PKG_BLOCKED}'. Project convention."
    fi
  fi

  return 0
}

# Split command on &&, ||, ; into segments and check each
# Use a simple approach: replace delimiters with newlines, iterate
echo "$COMMAND" | sed 's/&&/\n/g; s/||/\n/g; s/;/\n/g' | while IFS= read -r segment; do
  check_segment "$segment"
done

exit 0
