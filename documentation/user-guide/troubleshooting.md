# Troubleshooting Guide

Common issues and solutions when using VALORA.

## Quick Diagnostics

Run this command to check system health:

```bash
# Check installation
valora --version

# Check configuration
valora config validate

# Check logs
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

## Common Issues

### Installation & Setup

#### Node.js Version Mismatch

**Symptoms**:

- Error: "Unsupported Node version"
- Commands fail to execute

**Solution**:

```bash
# Check Node version
node --version  # Should be >= 20.0.0

# Install correct version
nvm install 20
nvm use 20

# Or use .nvmrc
nvm use
```

#### pnpm Not Found

**Symptoms**:

- Error: "pnpm: command not found"

**Solution**:

```bash
# Install pnpm globally
npm install -g pnpm

# Or via corepack (Node 16.13+)
corepack enable
corepack prepare pnpm@latest --activate
```

#### Dependencies Not Installing

**Symptoms**:

- Error during `pnpm install`
- Missing modules when running commands

**Solution**:

```bash
# Clean reinstall from the frozen lockfile
rm -rf node_modules
pnpm install

# If the lockfile is out of sync with package.json
# (e.g., after manually editing package.json):
pnpm install --config.frozen-lockfile=false

# If still failing, check network
ping registry.npmjs.org
```

> **Note**: The project enforces `frozen-lockfile=true` in `.npmrc`. Never delete `pnpm-lock.yaml` — it is the source of truth for reproducible installs. If you need to regenerate it, use `pnpm install --config.frozen-lockfile=false`.

#### Dependency Install Script Errors

**Symptoms**:

- A new dependency requires native compilation but fails silently
- Missing native bindings at runtime

**Solution**:

The project blocks all dependency install scripts via `ignore-scripts=true` in `.npmrc`. If a package legitimately needs to run build scripts (e.g., `sharp`, `esbuild`), add it to the allowlist in `package.json`:

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

### Configuration Issues

#### API Keys Not Working

**Symptoms**:

- Error: "API key not found"
- Error: "Invalid API key"

**Solution**:

```bash
# Check environment variable
echo $ANTHROPIC_API_KEY

# Set temporarily
export ANTHROPIC_API_KEY="sk-ant-..."

# Set permanently (add to ~/.bashrc or ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc

# Verify configuration
valora config validate
```

#### Configuration File Invalid

**Symptoms**:

- Error: "Invalid configuration"
- Commands fail immediately

**Solution**:

```bash
# Validate JSON syntax
jq '.' .valora/config.json

# Check for common errors
cat .valora/config.json | grep -E '(,\s*}|,\s*])'  # Trailing commas

# Reset to default
cp data/config.default.json .valora/config.json
```

### Execution Issues

#### Command Not Found

**Symptoms**:

- Error: "ai: command not found"

**Solution**:

```bash
# Check if CLI is built
ls dist/cli.js

# If not, build it
pnpm build

# Run directly
node dist/cli.js plan "test"

# Or add to PATH
export PATH="$PATH:$(pwd)/dist"
```

#### Command Hangs

**Symptoms**:

- Command starts but never completes
- No output or progress

**Solution**:

```bash
# Check logs
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log

# Check for timeout
# Increase timeout in .valora/config.json:
{
  "llm": {
    "providers": {
      "anthropic": {
        "timeout_ms": 600000  // 10 minutes
      }
    }
  }
}

# Kill and restart
pkill -f "valora "
valora plan "test"
```

#### Permission Denied

**Symptoms**:

- Error: "EACCES: permission denied"

**Solution**:

```bash
# Fix session directory permissions
chmod -R 755 .valora/sessions/
chmod -R 644 .valora/sessions/**/*.json

# Fix log directory permissions
chmod -R 755 .valora/logs/
chmod -R 644 .valora/logs/**/*.log

# Fix script permissions
chmod +x scripts/*
```

### Session Issues

#### Sessions Not Saving

**Symptoms**:

- Session data lost between runs
- Empty session files

**Solution**:

```bash
# Check auto-save enabled
jq '.session.auto_save' .valora/config.json  # Should be true

# Check disk space
df -h .valora/sessions/

# Check permissions
ls -la .valora/sessions/

# Verify encryption key
# If encrypted, check ENCRYPTION_KEY environment variable
echo $ENCRYPTION_KEY
```

#### Session Corrupted

**Symptoms**:

- Error: "Invalid session data"
- Cannot resume session

**Solution**:

```bash
# Validate session JSON
jq '.' .valora/sessions/<session-id>/session.json

# Try snapshot
jq '.' .valora/sessions/<session-id>/session.snapshot.json

# If corrupted, start new session
valora --new-session plan "test"
```

#### Old Sessions Not Cleaned Up

**Symptoms**:

- `.valora/sessions/` directory very large
- Many old session files

**Solution**:

```bash
# Enable cleanup
# In .valora/config.json:
{
  "session": {
    "cleanup_days": 30,
    "cleanup_enabled": true
  }
}

# Manual cleanup
find .valora/sessions -name "*.json" -mtime +30 -delete

# Or use cleanup command
valora session cleanup --days 30
```

### Exploration Issues

#### Exploration Fails Safety Checks

**Symptoms**:

- Error: "Insufficient memory: X.XGB available, Y.YGB required"

**Solution**:

```bash
# Skip safety checks (for constrained environments)
valora explore parallel "task" --skip-safety

# Or reduce branch count
valora explore parallel "task" --branches 2
```

The safety validator requires 1GB of available memory per branch. In environments where the OS reports low free memory (e.g., devcontainers), use `--skip-safety` to bypass the check. Docker enforces per-container memory limits via cgroups independently.

#### Exploration Cleanup Fails

**Symptoms**:

- Error: "Exploration exp-XXX not found" during cleanup
- Branches not deleted: "Branch refs/heads/exploration/... does not exist"

**Solution**:

```bash
# Re-run cleanup — it now handles missing state gracefully
valora explore cleanup exp-XXX

# Or clean up all explorations
valora explore cleanup --all

# Manual cleanup of leftover branches
git branch --list "exploration/*" | xargs -r git branch -D
```

If a previous cleanup removed the exploration state but failed to delete branches (e.g., due to the `refs/heads/` prefix issue), re-running cleanup will detect the missing state and fall back to pattern-based branch cleanup.

#### Exploration Worktrees Show as Timed Out

**Symptoms**:

- Worktree status shows `timed_out` (⏱) instead of `completed`
- Exploration finishes but some branches didn't complete in time

**Solution**:

```bash
# Check which worktrees timed out
valora explore status exp-XXX

# Increase the timeout for future explorations
valora explore parallel "task" --timeout 120

# Timed-out worktrees cannot be merged — retry with a longer timeout
# or fewer branches to give each more time
valora explore parallel "task" --timeout 120 --branches 2
```

Worktrees that exceed the `--timeout` duration are marked as `timed_out` and cannot be merged. They score slightly above `failed` in comparisons (5/40 vs 0/40 for the status component) since partial progress may have been made. To resolve, either increase the timeout or simplify the task.

### LLM Provider Issues

#### Rate Limiting

**Symptoms**:

- Error: "Rate limit exceeded"
- Error: "429 Too Many Requests"

**Solution**:

```bash
# Wait and retry
sleep 60
valora plan "test"

# Use different provider
valora plan --provider openai "test"

# Configure retry policy
# In .valora/config.json:
{
  "pipeline": {
    "retry": {
      "max_attempts": 5,
      "backoff_ms": 2000
    }
  }
}
```

#### Model Not Available

**Symptoms**:

- Error: "Model not found"
- Error: "Model access denied"

**Solution**:

```bash
# Check model name spelling
valora config list-models

# Use alternative model
valora plan --model claude-sonnet-3.5 "test"

# Check API access
curl -H "x-api-key: $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/models
```

#### Timeout Errors

**Symptoms**:

- Error: "Request timeout"
- Long-running commands fail

**Solution**:

```bash
# Increase timeout
# In .valora/config.json:
{
  "llm": {
    "providers": {
      "anthropic": {
        "timeout_ms": 900000  // 15 minutes
      }
    }
  }
}

# Use faster model for simple tasks
valora plan --model claude-haiku "simple task"
```

### Metrics Issues

#### No Metrics Data

**Symptoms**:

- Dashboard shows 0 workflows
- Empty metrics report

**Solution**:

```bash
# Check sessions exist
find .valora/sessions -name "*.json" -type f

# Check session format
jq '.commands[0].optimization_metrics' \
  .valora/sessions/<id>/session.json

# Verify date range
./scripts/metrics 7d | jq '.totalWorkflows'

# Create test session (see Quick Start)
```

#### Metrics Extraction Fails

**Symptoms**:

- Error when running metrics script
- Invalid JSON output

**Solution**:

```bash
# Check tsx installed
ls node_modules/.bin/tsx

# Install if missing
pnpm install

# Check session files valid
for f in .valora/sessions/*/*.json; do
  jq '.' "$f" || echo "Invalid: $f"
done

# Run with debug
DEBUG=* ./scripts/metrics 30d
```

#### Dashboard Not Generating

**Symptoms**:

- Metrics extract OK but dashboard fails
- Empty METRICS_REPORT.md

**Solution**:

```bash
# Test metrics extraction
./scripts/metrics 30d > /tmp/metrics.json

# Validate metrics JSON
jq '.' /tmp/metrics.json

# Generate dashboard manually
./scripts/dashboard < /tmp/metrics.json

# Check for errors
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

### Performance Issues

#### Slow Command Execution

**Symptoms**:

- Commands take too long
- Frequent timeouts

**Solutions**:

1. **Enable parallel execution**:

```json
{
	"execution": {
		"enable_parallel_execution": true,
		"max_concurrent_stages": 4
	}
}
```

1. **Use faster models**:

```bash
valora plan --model claude-haiku "simple task"
```

1. **Reduce context size**:

```bash
# Clear old sessions
valora session cleanup --days 7
```

1. **Enable stage caching**:

```json
{
	"pipeline": {
		"cache_strategy": "stage",
		"cache_ttl_seconds": 3600
	}
}
```

#### High Memory Usage

**Symptoms**:

- Process uses too much RAM
- System becomes slow

**Solutions**:

```bash
# Check memory usage
ps aux | grep "valora "

# Reduce concurrent stages
# In .valora/config.json:
{
  "execution": {
    "max_concurrent_stages": 2
  }
}

# Clear session cache
rm -rf .valora/sessions/*/cache/

# Restart with memory limit
node --max-old-space-size=2048 dist/cli.js plan "test"
```

### GitHub Actions Issues

#### Workflow Not Running

**Symptoms**:

- Scheduled workflow doesn't execute
- Manual trigger doesn't work

**Solution**:

```bash
# Check workflow file
gh workflow view "Weekly Metrics Dashboard"

# Check recent runs
gh run list --workflow="Weekly Metrics Dashboard"

# Manual trigger
gh workflow run "Weekly Metrics Dashboard"

# Check Actions enabled
# Go to Settings → Actions → General
# Ensure "Allow all actions" is selected
```

#### Workflow Fails

**Symptoms**:

- Workflow runs but fails
- Error in workflow logs

**Solution**:

```bash
# View workflow logs
gh run view <run-id> --log

# Common fixes:
# 1. Check dependencies installed
# 2. Verify API keys in Secrets
# 3. Check permissions in workflow file
# 4. Validate YAML syntax
```

## Debugging Tips

### Enable Debug Logging

```json
{
	"logging": {
		"level": "debug",
		"verbose": true
	}
}
```

### Check System Status

```bash
# Node version
node --version

# pnpm version
pnpm --version

# Disk space
df -h .valora/

# Permissions
ls -la .valora/sessions/ .valora/logs/

# Environment variables
env | grep -E '(ANTHROPIC|OPENAI|GOOGLE)'
```

### Capture Debug Output

```bash
# Run with debug output
DEBUG=* valora plan "test" 2>&1 | tee debug.log

# Check logs
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log

# Analyze session
jq '.' .valora/sessions/<session-id>/session.json | less
```

### Test Components Individually

```bash
# Test LLM connection
valora test llm

# Test session management
valora session list

# Test metrics extraction
./scripts/metrics 7d | jq '.'

# Test configuration
valora config validate
```

## Getting Additional Help

### Check Documentation

- [User Guide](./README.md)
- [Configuration](./configuration.md)
- [Commands Reference](./commands.md)
- [Architecture Documentation](../architecture/README.md)

### Check Logs

```bash
# Today's logs
cat .valora/logs/ai-$(date +%Y-%m-%d).log

# Last 100 lines
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log

# Follow logs in real-time
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log
```

### Report Issues

When reporting issues, include:

1. **System information**:

```bash
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "OS: $(uname -a)"
```

1. **Error message**:

```bash
# Copy full error output
```

1. **Configuration** (sanitized):

```bash
# Remove API keys first
jq 'del(.llm.providers[].api_key_env)' .valora/config.json
```

1. **Relevant logs**:

```bash
# Last 50 lines
tail -50 .valora/logs/ai-$(date +%Y-%m-%d).log
```

1. **Steps to reproduce**

---

_For development-related issues, see the [Developer Guide](../developer-guide/README.md)._
