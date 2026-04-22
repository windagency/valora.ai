#!/usr/bin/env bash
# rtk-rewrite.sh — PreToolUse hook for run_terminal_cmd
# Prepends "rtk" to filterable commands when RTK is installed.
# Exit 0 with no output = pass through unchanged.
# Exit 0 with JSON on stdout = rewrite tool input.
set -euo pipefail

if ! command -v rtk &>/dev/null; then
	exit 0
fi

INPUT=$(cat)

# Guard against malformed JSON — fail-open rather than producing a noisy hook error.
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

if [[ -z "$COMMAND" ]]; then
	exit 0
fi

# Already prefixed — avoid double-wrapping.
if echo "$COMMAND" | grep -qE '^rtk[[:space:]]'; then
	exit 0
fi

# Skip sudo-prefixed commands — rtk's handling of sudo as a first argument is
# undefined. Pass through unchanged; the command runs without token filtering.
if echo "$COMMAND" | grep -qE '^sudo[[:space:]]'; then
	exit 0
fi

FIRST_TOKEN=$(echo "$COMMAND" | awk '{print $1}')

RTK_TOOLS="git cargo npm docker kubectl make python pip yarn bun pnpm npx bunx tsc eslint vitest jest"

for tool in $RTK_TOOLS; do
	if [[ "$FIRST_TOKEN" == "$tool" ]]; then
		jq -n --arg cmd "rtk $COMMAND" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{"command":$cmd}}}'
		exit 0
	fi
done

exit 0
