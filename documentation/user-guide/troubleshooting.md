# Troubleshooting Guide

Common issues and solutions when using VALORA.

## Quick diagnostics

```bash
valora --version
valora config validate
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

## Common problems — quick reference

| Problem                     | Likely cause                | Fix                                                                              |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| "Unsupported Node version"  | Node < 20                   | `nvm install 20 && nvm use 20`                                                   |
| "pnpm: command not found"   | pnpm not installed          | `npm install -g pnpm`                                                            |
| "API key not found"         | `ANTHROPIC_API_KEY` not set | `export ANTHROPIC_API_KEY="sk-ant-..."`                                          |
| "Invalid configuration"     | Malformed JSON              | `jq '.' .valora/config.json`                                                     |
| "valora: command not found" | CLI not built               | `pnpm build`                                                                     |
| Command hangs               | Timeout too short           | Raise `timeout_ms` in config                                                     |
| "EACCES: permission denied" | Wrong file permissions      | `chmod -R 755 .valora/sessions/`                                                 |
| "Rate limit exceeded"       | API quota hit               | Wait 60s or switch provider                                                      |
| "Model not found"           | Wrong model name            | `valora config list-models`                                                      |
| "Request timeout"           | Slow or complex task        | Raise `timeout_ms` to 900000                                                     |
| Tool loop warning           | Too few tool iterations     | Raise `max_tool_iterations` in pipeline YAML                                     |
| Stage hard-stopped          | Too many tool failures      | See [Stage hard-stopped](#stage-hard-stopped-n-tool-failures-exceeded-threshold) |
| Dashboard shows 0 workflows | No session data             | Run a workflow, then re-generate                                                 |

---

## 1. Installation and setup

### Node.js version mismatch

**Symptom**: "Unsupported Node version" or commands fail to execute.

```bash
node --version   # must be >= 20.0.0
nvm install 20
nvm use 20
```

**Verify**: `node --version` returns `v20.x.x` or higher.

### pnpm not found

**Symptom**: "pnpm: command not found"

```bash
npm install -g pnpm
# or via corepack (Node 16.13+):
corepack enable && corepack prepare pnpm@latest --activate
```

**Verify**: `pnpm --version` returns a version number.

### Dependencies not installing

**Symptom**: Errors during `pnpm install`, or missing modules at runtime.

```bash
rm -rf node_modules
pnpm install
```

If the lockfile is out of sync with `package.json` (e.g., after manually editing it):

```bash
pnpm install --config.frozen-lockfile=false
```

**Verify**: `ls node_modules/.bin/tsx` returns a path.

<details>
<summary><strong>Why the frozen lockfile matters</strong></summary>

The project enforces `frozen-lockfile=true` in `.npmrc`. Never delete `pnpm-lock.yaml` — it is the source of truth for reproducible installs. Use `--config.frozen-lockfile=false` only when intentionally regenerating it.

If a new dependency requires native compilation but fails silently (missing native bindings at runtime), the project blocks all install scripts via `ignore-scripts=true`. Add the package to the allowlist:

```json
{
	"pnpm": {
		"onlyBuiltDependencies": ["sharp"]
	}
}
```

Then reinstall:

```bash
pnpm install --config.frozen-lockfile=false
```

</details>

---

## 2. Configuration issues

### API keys not working

**Symptom**: "API key not found" or "Invalid API key"

```bash
echo $ANTHROPIC_API_KEY       # check it is set
export ANTHROPIC_API_KEY="sk-ant-..."
valora config validate        # verify
```

For a permanent fix, add the export to `~/.bashrc` or `~/.zshrc`.

### Configuration file invalid

**Symptom**: "Invalid configuration" or commands fail immediately.

```bash
jq '.' .valora/config.json          # will error on invalid JSON
```

To reset to defaults:

```bash
cp data/config.default.json .valora/config.json
```

---

## 3. Execution issues

### Command not found

**Symptom**: "valora: command not found"

```bash
ls dist/cli.js   # check if CLI is built
pnpm build       # build if missing
node dist/cli.js plan "test"   # run directly to verify
```

### Command hangs

**Symptom**: Command starts but never completes; no output.

```bash
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

Increase the timeout in `.valora/config.json`:

```json
{
	"llm": {
		"providers": {
			"anthropic": {
				"timeout_ms": 600000
			}
		}
	}
}
```

To kill a hung command:

```bash
pkill -f "valora "
```

### Permission denied

**Symptom**: "EACCES: permission denied"

```bash
chmod -R 755 .valora/sessions/
chmod -R 644 .valora/sessions/**/*.json
chmod -R 755 .valora/logs/
chmod -R 644 .valora/logs/**/*.log
chmod +x scripts/*
```

---

## 4. Pipeline stage issues

### Tool loop exceeded maximum iterations

**Symptom**:

```
⚠ Tool loop exceeded maximum iterations (stage: test.code.implement-tests)
⚠ Requesting final structured output (tool loop exhausted)
```

**Cause**: The stage needed more than 20 tool calls (the default limit). Common in stages that write many files.

**Fix**: Raise `max_tool_iterations` in the command's pipeline YAML:

```yaml
pipeline:
  - stage: test
    prompt: code.implement-tests
    required: true
    max_tool_iterations: 40
```

**Verify**: Check `StageOutput.metadata.executionQuality.verifiedModifiedFiles` — if it matches expected outputs, the forced final output was accurate and the higher limit will prevent the warning in future runs.

### Stage hard-stopped: N tool failures exceeded threshold

**Symptom**:

```
✗ Stage hard-stopped: 7 tool failures exceeded the threshold of 5
  (stage: documentation.documentation.update-inline-docs)
✗ Pipeline execution failed — Required stage failed
```

**Cause**: The stage accumulated too many tool results starting with `"Error:"`. Caused by a tight iteration limit forcing rapid tool calls, or genuine tool failures (bad paths, network errors).

> "File too large", "No matches found", and "File not found" do **not** count as failures. Only results starting with `"Error:"` count.

**Fix A** — Raise the failure threshold (if the stage navigates many large files):

```yaml
- stage: documentation
  prompt: documentation.update-inline-docs
  required: true
  max_tool_failures: 10
```

**Fix B** — Raise the iteration limit (if failures accumulate because the LLM is rushing):

```yaml
- stage: documentation
  prompt: documentation.update-inline-docs
  required: true
  max_tool_iterations: 30
```

**Fix C** — Make the stage optional (if failures should not block the pipeline):

```yaml
- stage: documentation
  prompt: documentation.update-inline-docs
  required: false
```

**Fix D** — Set a tolerant failure policy (for exploratory or read-only stages):

```yaml
- stage: review
  prompt: code.validate-prerequisites
  required: true
  failure_policy: tolerant
```

<details>
<summary><strong>Failure policy details and root-cause diagnosis</strong></summary>

`failure_policy` controls which failures count:

- `strict` — all failures count (default for `code`/`test` stages)
- `tolerant` — only `write`, `search_replace`, and `delete_file` failures count (default for `context`/`review`/`plan` stages)
- `lenient` — never hard-stops

To diagnose root cause, inspect the `tool:execution:failed` events in the session log:

```bash
jq '.commands[-1].stages[] | select(.metadata.executionQuality.hardStopped == true)' \
  .valora/sessions/<session-id>/session.json
```

See [Pipeline Resilience](../operations/pipeline-resilience.md) for a full troubleshooting walkthrough.

</details>

---

## 5. Session issues

### Sessions not saving

**Symptom**: Session data lost between runs; empty session files.

```bash
jq '.session.auto_save' .valora/config.json   # should be true
df -h .valora/sessions/                        # check disk space
ls -la .valora/sessions/                       # check permissions
echo $ENCRYPTION_KEY                           # if encrypted
```

### Session corrupted

**Symptom**: "Invalid session data" or cannot resume session.

```bash
jq '.' .valora/sessions/<session-id>/session.json
jq '.' .valora/sessions/<session-id>/session.snapshot.json
```

If both are corrupted, start a new session:

```bash
valora --new-session plan "test"
```

> Do not delete sessions that contain errors — they hold diagnostic context useful for debugging.

### Old sessions not cleaned up

**Symptom**: `.valora/sessions/` directory is very large.

```bash
valora session cleanup --days 30
```

Or enable automatic cleanup in `.valora/config.json`:

```json
{
	"session": {
		"cleanup_days": 30,
		"cleanup_enabled": true
	}
}
```

---

## 6. Exploration issues

### Exploration fails safety checks

**Symptom**: "Insufficient memory: X.XGB available, Y.YGB required"

```bash
valora explore parallel "task" --skip-safety    # for constrained environments
valora explore parallel "task" --branches 2     # reduce branch count
```

<details>
<summary><strong>Why this happens in devcontainers</strong></summary>

The safety validator requires 1GB of available memory per branch. In environments where the OS reports low free memory (e.g., devcontainers), the check can fail even when Docker enforces per-container limits via cgroups. Use `--skip-safety` to bypass the OS-level check.

</details>

### Exploration cleanup fails

**Symptom**: "Exploration exp-XXX not found" during cleanup; branches not deleted.

```bash
valora explore cleanup exp-XXX          # re-run — now handles missing state gracefully
valora explore cleanup --all            # or clean up all explorations

# Manual branch cleanup
git branch --list "exploration/*" | xargs -r git branch -D
```

<details>
<summary><strong>Root cause</strong></summary>

If a previous cleanup removed the exploration state but failed to delete branches (e.g., due to a `refs/heads/` prefix issue), re-running cleanup detects the missing state and falls back to pattern-based branch cleanup.

</details>

### Exploration worktrees show as timed out

**Symptom**: Worktree status shows `timed_out` (⏱) instead of `completed`.

```bash
valora explore status exp-XXX
valora explore parallel "task" --timeout 120
valora explore parallel "task" --timeout 120 --branches 2
```

<details>
<summary><strong>Scoring note</strong></summary>

Timed-out worktrees cannot be merged. They score slightly above `failed` in comparisons (5/40 vs 0/40 for the status component) since partial progress may have been made.

</details>

---

## 7. LLM provider issues

### Rate limiting

**Symptom**: "Rate limit exceeded" or "429 Too Many Requests"

```bash
# Wait and retry
valora plan "test"

# Use different provider
valora plan --provider openai "test"
```

Configure retry policy in `.valora/config.json`:

```json
{
	"pipeline": {
		"retry": {
			"max_attempts": 5,
			"backoff_ms": 2000
		}
	}
}
```

### Model not available

**Symptom**: "Model not found" or "Model access denied"

```bash
valora config list-models
valora plan --model claude-sonnet-3.5 "test"

# Verify API access
curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/models
```

### Timeout errors

**Symptom**: "Request timeout" on long-running commands.

Increase the timeout in `.valora/config.json`:

```json
{
	"llm": {
		"providers": {
			"anthropic": {
				"timeout_ms": 900000
			}
		}
	}
}
```

For simple tasks, use a faster model:

```bash
valora plan --model claude-haiku "simple task"
```

---

## 8. Metrics issues

### No metrics data

**Symptom**: Dashboard shows 0 workflows.

```bash
find .valora/sessions -name "*.json" -type f
jq '.commands[0].optimization_metrics' .valora/sessions/<id>/session.json
./scripts/metrics 7d | jq '.totalWorkflows'
```

If no sessions exist, run a complete workflow then re-generate the report.

### Metrics extraction fails

**Symptom**: Error when running metrics script; invalid JSON output.

```bash
ls node_modules/.bin/tsx     # check tsx is installed
pnpm install                 # install if missing

# Validate session files
for f in .valora/sessions/*/*.json; do
  jq '.' "$f" || echo "Invalid: $f"
done

DEBUG=* ./scripts/metrics 30d
```

### Dashboard not generating

**Symptom**: Metrics extract OK but dashboard fails; empty `METRICS_REPORT.md`.

```bash
./scripts/metrics 30d > /tmp/metrics.json
jq '.' /tmp/metrics.json
./scripts/dashboard < /tmp/metrics.json
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

---

## 9. Performance issues

### Slow command execution

Enable parallel execution in `.valora/config.json`:

```json
{
	"execution": {
		"enable_parallel_execution": true,
		"max_concurrent_stages": 4
	}
}
```

Other options:

```bash
valora plan --model claude-haiku "simple task"   # faster model
valora session cleanup --days 7                  # reduce context size
```

Enable stage caching:

```json
{
	"pipeline": {
		"cache_strategy": "stage",
		"cache_ttl_seconds": 3600
	}
}
```

### High memory usage

```bash
ps aux | grep "valora "
rm -rf .valora/sessions/*/cache/
node --max-old-space-size=2048 dist/cli.js plan "test"
```

Reduce concurrent stages in `.valora/config.json`:

```json
{
	"execution": {
		"max_concurrent_stages": 2
	}
}
```

---

## 10. GitHub Actions issues

### Workflow not running

```bash
gh workflow view "Weekly Metrics Dashboard"
gh run list --workflow="Weekly Metrics Dashboard"
gh workflow run "Weekly Metrics Dashboard"
```

Check that Actions are enabled: Settings → Actions → General → "Allow all actions".

### Workflow fails

```bash
gh run view <run-id> --log
```

Common causes: missing dependencies, API keys not configured in Secrets, incorrect permissions in workflow file, or invalid YAML syntax.

---

## Debugging tools

### Enable debug logging

Add to `.valora/config.json`:

```json
{
	"logging": {
		"level": "debug",
		"verbose": true
	}
}
```

### Capture full debug output

```bash
DEBUG=* valora plan "test" 2>&1 | tee debug.log
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log
jq '.' .valora/sessions/<session-id>/session.json | less
```

### Test components individually

```bash
valora test llm               # test LLM connection
valora session list           # test session management
./scripts/metrics 7d | jq '.'  # test metrics extraction
valora config validate        # test configuration
```

### System status check

```bash
node --version
pnpm --version
df -h .valora/
ls -la .valora/sessions/ .valora/logs/
env | grep -E '(ANTHROPIC|OPENAI|GOOGLE)'
```

---

## Reporting an issue

Include the following when filing a bug report:

```bash
# System info
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "OS: $(uname -a)"

# Sanitised config (remove API keys)
jq 'del(.llm.providers[].api_key_env)' .valora/config.json

# Recent logs
tail -50 .valora/logs/ai-$(date +%Y-%m-%d).log
```

Also include the full error message and steps to reproduce.

---

See also: [Configuration](./configuration.md) · [Commands Reference](./commands.md) · [Developer Guide](../developer-guide/README.md)
