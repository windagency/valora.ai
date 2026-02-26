# ADR-008: PreToolUse Hook Enforcement for Modern CLI Toolkit

## Status

Accepted

## Context

VALORA's [Modern CLI Toolkit](../developer-guide/modern-cli-toolkit/README.md) defines modern replacements for legacy CLI commands (`rg` over `grep`, `fd` over `find`, `eza` over `ls`, etc.). These rules exist to reduce token consumption, improve output quality, and enforce project conventions.

However, the rules were only documented — not enforced. AI agents and developers could still invoke legacy commands via `run_terminal_cmd`, leading to:

1. **Wasted tokens** from verbose legacy output (e.g., `grep -r` vs `rg`)
2. **Inconsistent tooling** across sessions and contributors
3. **Safety risks** from unchecked `git push` operations
4. **Convention drift** when package managers other than the project standard are used

The recently added PreToolUse/PostToolUse hook mechanism (see `HookExecutionService`) allows intercepting tool calls before execution — the ideal integration point for automated enforcement.

## Decision

Implement a **PreToolUse hook** (`enforce-modern-cli.sh`) that intercepts `run_terminal_cmd` calls and blocks commands using legacy CLI tools. The hook:

### 1. Intercepts via Config-Driven Hook Registration

Registered in `.ai/hooks.json` under `hooks.PreToolUse` with a regex matcher targeting `^run_terminal_cmd$`. This file is separate from `.ai/config.json` so that `valora config setup` does not overwrite hook configuration.

### 2. Applies Hardcoded Rules for Universal Patterns

| Legacy Pattern | Modern Replacement | Behaviour |
|---|---|---|
| `grep` / `egrep` / `fgrep` | `rg` | Block as primary command |
| `find` | `fd` | Block as primary command |
| `cat *.json` | `jq` | Block cat on JSON files |
| `cat *.yaml` / `*.yml` | `yq` | Block cat on YAML files |
| `ls` | `eza` | Block as primary command |
| `tree` | `eza --tree` | Block as primary command |
| `git push` | (blocked) | Requires human approval |

### 3. Supports Configurable Rules

The package manager rule is configurable via `.ai/hooks.json` under `enforcement.package_manager`:

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

Projects can change the blocked/replacement package manager or disable the rule entirely.

### 4. Avoids False Positives

- Only checks the **first command** in each segment (before any `|` pipe), so `rg foo | grep -v bar` is allowed
- Splits compound commands on `&&`, `||`, `;` and checks each segment independently
- Skips segments starting with `echo`, `printf`, `export`, or variable assignments
- Strips leading `sudo` before matching

### 5. Fails Open

If `jq` is missing or the script errors, the hook system allows the tool call to proceed (built-in behaviour of `HookExecutionService`). Timeout is set to 5 seconds; typical execution is <100ms.

## Consequences

### Positive

- **Automated enforcement** of modern CLI toolkit rules — no manual review needed
- **Immediate feedback** with deny messages that include the modern alternative and documentation link
- **Safety gate** for `git push` — prevents accidental pushes without human approval
- **Configurable** package manager enforcement per project
- **Zero changes to VALORA core** — uses the existing hook mechanism with config + shell script only
- **Fail-open design** — if the hook fails, commands proceed normally

### Negative

- **Shell script dependency** — requires `jq` and `bash` in the environment (both standard in dev containers)
- **Limited to primary commands** — subshells like `$(find ...)` are not caught (acceptable v1 limitation)
- **Maintenance overhead** — new rules require script changes (hardcoded rules) or config changes (configurable rules)

### Neutral

- **5-second timeout** is generous for a script that completes in <100ms
- **Regex-based detection** is simple but sufficient for command-level patterns
- **Pipe filtering is allowed** — this is intentional, as `grep` after a pipe is often legitimate

## Alternatives Considered

### Alternative 1: TypeScript-Based Hook in the Executor

Implement enforcement directly in `tool-execution.service.ts` alongside existing `read_file` checks.

**Rejected because:**
- Requires modifying VALORA core code
- Harder for projects to customise rules
- Tighter coupling between enforcement and execution

### Alternative 2: Lint-Staged / Pre-Commit Style Enforcement

Run checks only at commit time.

**Rejected because:**
- Doesn't prevent legacy commands during development
- Feedback comes too late in the workflow
- Doesn't address `git push` safety

### Alternative 3: Shell Alias Overrides

Override `grep`, `find`, etc. with shell aliases pointing to modern tools.

**Rejected because:**
- Aliases don't work reliably in non-interactive shells
- Changes system-wide behaviour, not just VALORA context
- No deny/feedback mechanism — silently changes behaviour

## Implementation Details

### New Files

- `.ai/hooks/enforce-modern-cli.sh` — PreToolUse hook script
- `.ai/hooks/tests/enforce-modern-cli.test.sh` — Automated test suite (43 test cases)

### Modified Files

- `.ai/hooks.json` — Added `hooks` and `enforcement` keys (dedicated hooks configuration, not overwritten by `config setup`)

### Test Coverage

| Category | Count | Examples |
|---|---|---|
| Deny cases | 22 | `grep`, `find`, `cat *.json`, `npm install`, `ls`, `git push`, `sudo grep` |
| Allow cases | 19 | `rg`, `fd`, `jq`, `pnpm`, `eza`, pipe filters, `echo`, `git status`, `npx` |
| Output format | 2 | JSON structure validation |

## References

- [Modern CLI Toolkit](../developer-guide/modern-cli-toolkit/README.md)
- [rg and fd Reference](../developer-guide/modern-cli-toolkit/rg-fd.md)
- [jq and yq Reference](../developer-guide/modern-cli-toolkit/jq-yq.md)
- [fzf, eza, zoxide Reference](../developer-guide/modern-cli-toolkit/fzf-eza-zoxide.md)
- [ADR-004: Pipeline Execution Model](./004-pipeline-execution-model.md)
