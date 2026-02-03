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
tail -f .ai/logs/ai-$(date +%Y-%m-%d).log
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
# Clean install
cd .ai/.bin
rm -rf node_modules pnpm-lock.yaml
pnpm install --frozen-lockfile

# If still failing, check network
ping registry.npmjs.org

# Use alternative registry
pnpm config set registry https://registry.npmmirror.com
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
jq '.' .ai/config.json

# Check for common errors
cat .ai/config.json | grep -E '(,\s*}|,\s*])'  # Trailing commas

# Reset to default
cp .ai/config.example.json .ai/config.json
```

### Execution Issues

#### Command Not Found

**Symptoms**:

- Error: "ai: command not found"

**Solution**:

```bash
# Check if CLI is built
ls .ai/.bin/dist/cli.js

# If not, build it
cd .ai/.bin
pnpm build

# Run directly
node .ai/.bin/dist/cli.js plan "test"

# Or add to PATH
export PATH="$PATH:$(pwd)/.ai/.bin/dist"
```

#### Command Hangs

**Symptoms**:

- Command starts but never completes
- No output or progress

**Solution**:

```bash
# Check logs
tail -f .ai/logs/ai-$(date +%Y-%m-%d).log

# Check for timeout
# Increase timeout in .ai/config.json:
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
chmod -R 755 .ai/sessions/
chmod -R 644 .ai/sessions/**/*.json

# Fix log directory permissions
chmod -R 755 .ai/logs/
chmod -R 644 .ai/logs/**/*.log

# Fix script permissions
chmod +x .ai/scripts/*
```

### Session Issues

#### Sessions Not Saving

**Symptoms**:

- Session data lost between runs
- Empty session files

**Solution**:

```bash
# Check auto-save enabled
jq '.session.auto_save' .ai/config.json  # Should be true

# Check disk space
df -h .ai/sessions/

# Check permissions
ls -la .ai/sessions/

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
jq '.' .ai/sessions/<session-id>/session.json

# Try snapshot
jq '.' .ai/sessions/<session-id>/session.snapshot.json

# If corrupted, start new session
valora --new-session plan "test"
```

#### Old Sessions Not Cleaned Up

**Symptoms**:

- `.ai/sessions/` directory very large
- Many old session files

**Solution**:

```bash
# Enable cleanup
# In .ai/config.json:
{
  "session": {
    "cleanup_days": 30,
    "cleanup_enabled": true
  }
}

# Manual cleanup
find .ai/sessions -name "*.json" -mtime +30 -delete

# Or use cleanup command
valora session cleanup --days 30
```

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
# In .ai/config.json:
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
# In .ai/config.json:
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
find .ai/sessions -name "*.json" -type f

# Check session format
jq '.commands[0].optimization_metrics' \
  .ai/sessions/<id>/session.json

# Verify date range
./.ai/scripts/metrics 7d | jq '.totalWorkflows'

# Create test session (see Quick Start)
```

#### Metrics Extraction Fails

**Symptoms**:

- Error when running metrics script
- Invalid JSON output

**Solution**:

```bash
# Check tsx installed
ls .ai/.bin/node_modules/.bin/tsx

# Install if missing
cd .ai/.bin && pnpm install

# Check session files valid
for f in .ai/sessions/*/*.json; do
  jq '.' "$f" || echo "Invalid: $f"
done

# Run with debug
DEBUG=* ./.ai/scripts/metrics 30d
```

#### Dashboard Not Generating

**Symptoms**:

- Metrics extract OK but dashboard fails
- Empty METRICS_REPORT.md

**Solution**:

```bash
# Test metrics extraction
./.ai/scripts/metrics 30d > /tmp/metrics.json

# Validate metrics JSON
jq '.' /tmp/metrics.json

# Generate dashboard manually
./.ai/scripts/dashboard < /tmp/metrics.json

# Check for errors
tail -f .ai/logs/ai-$(date +%Y-%m-%d).log
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
# In .ai/config.json:
{
  "execution": {
    "max_concurrent_stages": 2
  }
}

# Clear session cache
rm -rf .ai/sessions/*/cache/

# Restart with memory limit
node --max-old-space-size=2048 .ai/.bin/dist/cli.js plan "test"
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
df -h .ai/

# Permissions
ls -la .ai/sessions/ .ai/logs/

# Environment variables
env | grep -E '(ANTHROPIC|OPENAI|GOOGLE)'
```

### Capture Debug Output

```bash
# Run with debug output
DEBUG=* valora plan "test" 2>&1 | tee debug.log

# Check logs
tail -100 .ai/logs/ai-$(date +%Y-%m-%d).log

# Analyze session
jq '.' .ai/sessions/<session-id>/session.json | less
```

### Test Components Individually

```bash
# Test LLM connection
valora test llm

# Test session management
valora session list

# Test metrics extraction
./.ai/scripts/metrics 7d | jq '.'

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
cat .ai/logs/ai-$(date +%Y-%m-%d).log

# Last 100 lines
tail -100 .ai/logs/ai-$(date +%Y-%m-%d).log

# Follow logs in real-time
tail -f .ai/logs/ai-$(date +%Y-%m-%d).log
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
jq 'del(.llm.providers[].api_key_env)' .ai/config.json
```

1. **Relevant logs**:

```bash
# Last 50 lines
tail -50 .ai/logs/ai-$(date +%Y-%m-%d).log
```

1. **Steps to reproduce**

---

*For development-related issues, see the [Developer Guide](../developer-guide/README.md).*
