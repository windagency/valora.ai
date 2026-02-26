#!/usr/bin/env bash
# Test suite for enforce-modern-cli.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../enforce-modern-cli.sh"

PASS=0
FAIL=0

# Helper: run the hook with a given command string, return exit code
run_hook() {
  local cmd="$1"
  echo "{\"tool_input\":{\"command\":\"$cmd\"}}" | bash "$HOOK" > /dev/null 2>&1
  return $?
}

# Helper: run the hook and capture stdout
run_hook_output() {
  local cmd="$1"
  echo "{\"tool_input\":{\"command\":\"$cmd\"}}" | bash "$HOOK" 2>/dev/null
}

expect_deny() {
  local cmd="$1"
  local label="${2:-$cmd}"
  run_hook "$cmd"
  local rc=$?
  if [[ $rc -eq 2 ]]; then
    echo "  PASS (deny): $label"
    ((PASS++))
  else
    echo "  FAIL (deny): $label — expected exit 2, got $rc"
    ((FAIL++))
  fi
}

expect_allow() {
  local cmd="$1"
  local label="${2:-$cmd}"
  run_hook "$cmd"
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "  PASS (allow): $label"
    ((PASS++))
  else
    echo "  FAIL (allow): $label — expected exit 0, got $rc"
    ((FAIL++))
  fi
}

echo "=== enforce-modern-cli.sh tests ==="
echo ""

echo "--- DENY cases ---"
expect_deny "grep pattern" "grep pattern"
expect_deny "grep -r pattern ." "grep -r"
expect_deny "grep -rn pattern ." "grep -rn"
expect_deny "egrep pattern" "egrep"
expect_deny "fgrep pattern" "fgrep"
expect_deny "find . -name '*.ts'" "find"
expect_deny "cat package.json" "cat .json"
expect_deny "cat config.yaml" "cat .yaml"
expect_deny "cat config.yml" "cat .yml"
expect_deny "npm install" "npm install"
expect_deny "npm run build" "npm run build"
expect_deny "ls" "ls (bare)"
expect_deny "ls -la" "ls -la"
expect_deny "tree" "tree (bare)"
expect_deny "tree src/" "tree src/"
expect_deny "git push" "git push (bare)"
expect_deny "git push origin main" "git push origin main"
expect_deny "git push --force" "git push --force"
expect_deny "cd src && grep pattern ." "chained: cd src && grep"
expect_deny "sudo find /etc -name '*.conf'" "sudo find"
expect_deny "sudo grep -r foo /var" "sudo grep"
expect_deny "cat data.json | jq .name" "cat .json piped to jq"

echo ""
echo "--- ALLOW cases ---"
expect_allow "rg pattern" "rg"
expect_allow "fd -e ts" "fd"
expect_allow "jq .name package.json" "jq"
expect_allow "pnpm install" "pnpm"
expect_allow "eza -la" "eza"
expect_allow "eza --tree" "eza --tree"
expect_allow "cat README.md" "cat non-structured file"
expect_allow "rg foo | grep -v bar" "grep as pipe filter"
expect_allow "echo grep pattern" "echo grep"
expect_allow "printf 'find something'" "printf find"
expect_allow "export GREP_OPTIONS=foo" "export GREP"
expect_allow "MY_VAR=grep" "variable assignment"
expect_allow "git status" "git status"
expect_allow "git commit -m 'test'" "git commit"
expect_allow "git pull" "git pull"
expect_allow "git log --oneline" "git log"
expect_allow "npx something" "npx (not npm)"
expect_allow "docker exec ls /app" "docker exec ls"
expect_allow "" "empty command"

echo ""
echo "--- Output format ---"
OUTPUT=$(run_hook_output "grep pattern")
if echo "$OUTPUT" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null 2>&1; then
  echo "  PASS: deny output has hookSpecificOutput.permissionDecision=deny"
  ((PASS++))
else
  echo "  FAIL: deny output missing hookSpecificOutput.permissionDecision=deny"
  echo "  Got: $OUTPUT"
  ((FAIL++))
fi

if echo "$OUTPUT" | jq -e '.hookSpecificOutput.permissionDecisionReason' > /dev/null 2>&1; then
  echo "  PASS: deny output contains permissionDecisionReason field"
  ((PASS++))
else
  echo "  FAIL: deny output missing permissionDecisionReason field"
  ((FAIL++))
fi

if echo "$OUTPUT" | jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' > /dev/null 2>&1; then
  echo "  PASS: deny output has hookEventName=PreToolUse"
  ((PASS++))
else
  echo "  FAIL: deny output missing hookEventName=PreToolUse"
  ((FAIL++))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
