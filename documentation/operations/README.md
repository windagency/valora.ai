# Operations Guide

Deployment, monitoring, and operational procedures for VALORA.

## Overview

This guide covers:

- Deployment strategies
- Monitoring and observability
- Performance tuning
- Backup and recovery
- Security operations
- Maintenance procedures
- Automated reporting

## Contents

1. [Deployment](#deployment)
2. [Monitoring](#monitoring)
3. [Performance Tuning](#performance-tuning)
4. [Backup and Recovery](#backup-and-recovery)
5. [Security](#security)
6. [Maintenance](#maintenance)
7. [Automated Reporting](./automated-reporting.md) - Weekly metrics automation

## Deployment

### Prerequisites

**System Requirements**:

- Node.js >= 18.0.0
- 2GB RAM minimum
- 5GB disk space

**Environment**:

- devcontainer (recommended) or local setup
- Git for version control
- Optional: GitHub CLI for automation

### Installation

**Global Install (Recommended)**:

```bash
# Install globally
pnpm add -g @windagency/valora          # pnpm
yarn global add @windagency/valora      # yarn
npm install -g @windagency/valora       # npm

# Verify
valora --version
```

**Development Environment**:

```bash
# Clone repository
git clone <repository-url>
cd valora

# Install dependencies
pnpm install

# Build
pnpm build

# Run in dev mode
pnpm dev --version
```

### Configuration

**Environment Variables**:

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
export ENCRYPTION_KEY="<32-byte-key>"

# System
export NODE_ENV="production"
export LOG_LEVEL="info"
```

**Configuration File**:

```bash
# Initialise project config
valora init

# Edit for environment
vim .valora/config.json
```

### Deployment Strategies

#### Local Development

```bash
# Development mode with hot reload
pnpm dev

# Run commands
valora plan "test"
```

#### Containerized Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install VALORA
RUN npm install -g @windagency/valora

# Set environment
ENV NODE_ENV=production

# Run
CMD ["valora", "--version"]
```

#### CI/CD Integration

```yaml
# .github/workflows/deploy.yml
name: Deploy Orchestrator

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install VALORA
        run: npm install -g @windagency/valora

      - name: Verify
        run: valora --version

      - name: Deploy
        run: |
          # Deploy to environment
          ./deploy.sh
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Monitoring

### Logging

**Log Files**:

- Location: `.valora/logs/` (project) or `~/.valora/logs/` (global)
- Format: `ai-YYYY-MM-DD.log`
- Rotation: Daily, max 100MB

**Log Levels**:

```json
{
	"logging": {
		"level": "info", // debug | info | warn | error
		"file_enabled": true,
		"daily_file_max_size_mb": 100
	}
}
```

**View Logs**:

```bash
# Follow logs
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log

# Search logs
grep -i error .valora/logs/ai-*.log

# Last 100 entries
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log
```

### Metrics

**Workflow Metrics**:

```bash
# Generate report
valora doctor  # Shows installation info and resource locations
```

**System Metrics**:

```bash
# Session count
ls -1 .valora/sessions/ | wc -l

# Disk usage
du -sh .valora/sessions/ .valora/logs/

# Memory usage
ps aux | grep "node.*valora" | awk '{print $4"%"}'
```

### Health Checks

**System Health**:

```bash
#!/bin/bash
# health-check.sh

# Check Node.js
node --version || exit 1

# Check configuration
valora config validate || exit 1

# Check API connectivity
timeout 10 valora test llm || exit 1

# Check disk space
df -h . | awk 'NR==2 {if ($5 > 90) exit 1}'

echo "Health check passed"
```

**Monitoring Script**:

```bash
#!/bin/bash
# monitor.sh

while true; do
  # Check system health
  ./health-check.sh

  # Check session count
  COUNT=$(ls -1 .valora/sessions/ | wc -l)
  echo "Sessions: $COUNT"

  # Check log errors
  ERRORS=$(grep -c ERROR .valora/logs/ai-$(date +%Y-%m-%d).log || echo 0)
  echo "Errors today: $ERRORS"

  sleep 300  # Check every 5 minutes
done
```

### Alerting

**Error Alerts**:

```bash
# Alert on errors
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log | grep --line-buffered ERROR | while read line; do
  # Send alert (email, Slack, etc.)
  curl -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"Error: $line\"}" \
    $SLACK_WEBHOOK_URL
done
```

## Performance Tuning

### Optimization Configuration

```json
{
	"execution": {
		"enable_parallel_execution": true,
		"max_concurrent_stages": 4
	},
	"pipeline": {
		"cache_strategy": "stage",
		"cache_ttl_seconds": 3600
	},
	"session": {
		"auto_save_interval_ms": 5000
	}
}
```

### Memory Management

**Limits**:

```bash
# Set memory limit
node --max-old-space-size=2048 $(which valora)

# Monitor memory
while true; do
  ps aux | grep "node.*valora" | awk '{print $6/1024 " MB"}'
  sleep 60
done
```

**Cleanup**:

```bash
# Clear old sessions
valora session cleanup --days 30

# Clear cache
rm -rf .valora/cache/

# Clear old logs
find .valora/logs/ -name "*.log" -mtime +30 -delete
```

### Database Optimization

**Session Storage**:

```bash
# Optimize session files
find .valora/sessions -name "*.json" -exec gzip {} \;

# Index for faster lookup
sqlite3 sessions.db "CREATE INDEX idx_timestamp ON sessions(timestamp);"
```

## Backup and Recovery

### Backup Strategy

**What to Backup**:

- Session data (`.valora/sessions/`)
- Configuration (`.valora/config.json`)
- Custom overrides (`.valora/agents/`, `.valora/commands/`, etc.)
- Logs (`.valora/logs/`)

**Backup Script**:

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups/valora/$DATE"

mkdir -p "$BACKUP_DIR"

# Backup sessions
tar -czf "$BACKUP_DIR/sessions.tar.gz" .valora/sessions/

# Backup configuration
cp .valora/config.json "$BACKUP_DIR/"

# Backup custom overrides
tar -czf "$BACKUP_DIR/overrides.tar.gz" .valora/agents/ .valora/commands/ .valora/templates/ 2>/dev/null

# Backup logs (last 7 days)
find .valora/logs/ -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

echo "Backup completed: $BACKUP_DIR"
```

**Automated Backups**:

```bash
# Daily backup cron job
0 2 * * * /path/to/backup.sh >> /var/log/ai-backup.log 2>&1
```

### Recovery Procedures

**Restore Sessions**:

```bash
# Extract backup
tar -xzf backups/sessions.tar.gz

# Verify integrity
find .valora/sessions -name "*.json" -exec jq '.' {} \; > /dev/null
```

**Restore Configuration**:

```bash
# Restore config
cp backups/config.json .valora/config.json

# Validate
valora config validate
```

### Disaster Recovery

**Recovery Steps**:

1. **Restore from backup**
2. **Verify configuration**
3. **Test API connectivity**
4. **Resume interrupted workflows**

```bash
# Resume last session
valora --resume plan "continue"

# Or list sessions and resume
valora session list
valora session resume <session-id>
```

## Security

### API Key Management

**Best Practices**:

- Store in environment variables
- Rotate regularly
- Use separate keys per environment
- Never commit to version control

**Key Rotation**:

```bash
# Generate new key
NEW_KEY="sk-ant-new..."

# Update environment
export ANTHROPIC_API_KEY="$NEW_KEY"

# Update configuration
valora config set llm.providers.anthropic.api_key_env ANTHROPIC_API_KEY

# Verify
valora test llm
```

### Encryption

**Session Encryption**:

```json
{
	"session": {
		"encryption": true,
		"encryption_key_env": "ENCRYPTION_KEY"
	}
}
```

**Generate Encryption Key**:

```bash
# Generate 32-byte key
openssl rand -hex 32

# Set environment variable
export ENCRYPTION_KEY="<generated-key>"
```

### Access Control

**File Permissions**:

```bash
# Restrict session directory
chmod 700 .valora/sessions/
chmod 600 .valora/sessions/**/*.json

# Restrict config file
chmod 600 .valora/config.json

# Restrict logs
chmod 700 .valora/logs/
chmod 600 .valora/logs/*.log
```

### Security Auditing

**Audit Script**:

```bash
#!/bin/bash
# security-audit.sh

echo "Security Audit Report"
echo "===================="

# Check permissions
echo "Checking permissions..."
find .valora/ -perm /o+r -ls

# Check for exposed API keys
echo "Checking for exposed keys..."
grep -r "sk-ant-\|sk-\|key" .valora/ --exclude-dir=node_modules

# Check encryption
echo "Checking encryption..."
jq '.session.encryption' .valora/config.json

echo "Audit complete"
```

## Maintenance

### Regular Maintenance

**Daily**:

- Check error logs
- Monitor disk usage
- Verify API connectivity

**Weekly**:

- Review metrics report
- Clean up old sessions
- Backup critical data

**Monthly**:

- Update dependencies
- Review configuration
- Security audit

### Maintenance Script

```bash
#!/bin/bash
# maintenance.sh

echo "Running maintenance..."

# Clean up old sessions (>30 days)
valora session cleanup --days 30

# Clean up old logs (>90 days)
find .valora/logs/ -name "*.log" -mtime +90 -delete

# Generate metrics report
valora doctor

# Check for updates
pnpm outdated

echo "Maintenance complete"
```

### Dependency Updates

```bash
# Check for updates
pnpm outdated

# Update dependencies
pnpm update

# Test after update
pnpm test

# Build
pnpm build
```

### Database Maintenance

**Session Cleanup**:

```bash
# Remove failed sessions
find .valora/sessions -name "*.json" \
  -exec jq -e '.status == "failed"' {} \; \
  -delete

# Compact session files
find .valora/sessions -name "*.json" \
  -exec jq -c '.' {} \; > /tmp/compact.json
```

## Troubleshooting

### Common Operations Issues

**High Disk Usage**:

```bash
# Find large directories
du -sh .valora/* | sort -h

# Clean up
valora session cleanup --days 30
find .valora/logs -name "*.log" -mtime +30 -delete
```

**Performance Degradation**:

```bash
# Check system resources
top -bn1 | grep "node"

# Restart process
pkill -f "valora "

# Clear cache
rm -rf .valora/cache/
```

**API Rate Limiting**:

```bash
# Check rate limit status
curl -H "x-api-key: $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/rate_limits

# Use different provider
valora plan --provider openai "task"
```

## Related Documentation

- [User Guide: Configuration](../user-guide/configuration.md)
- [User Guide: Troubleshooting](../user-guide/troubleshooting.md)
- [Architecture: System Architecture](../architecture/system-architecture.md)

---

_For production deployment assistance, consult the operations team._
