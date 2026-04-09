# Operations Guide

Deployment, monitoring, and operational procedures for Valora.

## Quick Reference

| Task                      | Command                              |
| ------------------------- | ------------------------------------ |
| Verify installation       | `valora --version`                   |
| Initialise project config | `valora init`                        |
| Validate configuration    | `valora config validate`             |
| Test LLM connectivity     | `valora test llm`                    |
| Show resource locations   | `valora doctor`                      |
| List sessions             | `valora session list`                |
| Resume a session          | `valora session resume <session-id>` |
| Clean up old sessions     | `valora session cleanup --days 30`   |
| Generate metrics report   | `valora doctor`                      |

## Key Health Checks

```bash
# Full system health check
node --version || exit 1
valora config validate || exit 1
timeout 10 valora test llm || exit 1
df -h . | awk 'NR==2 {if ($5 > 90) exit 1}'

# Disk usage at a glance
du -sh .valora/sessions/ .valora/logs/

# Recent errors
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log | grep ERROR
```

## Contents

1. [Deployment](#deployment)
2. [Monitoring](#monitoring)
3. [Performance Tuning](#performance-tuning)
4. [Backup and Recovery](#backup-and-recovery)
5. [Security](#security)
6. [Maintenance](#maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Automated Reporting](./automated-reporting.md)

---

## Deployment

### Prerequisites

**System Requirements**:

- Node.js `>=18.0.0`
- 2 GB RAM minimum
- 5 GB disk space

**Environment**:

- devcontainer (recommended) or local setup
- Git for version control
- Optional: GitHub CLI for automation

### Installation

**Global install (recommended)**:

```bash
pnpm add -g @windagency/valora          # pnpm
yarn global add @windagency/valora      # yarn
npm install -g @windagency/valora       # npm

valora --version
```

**Development environment**:

```bash
git clone <repository-url>
cd valora
pnpm install
pnpm build
pnpm dev --version
```

### Configuration

**Required environment variables**:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Optional variables**:

```bash
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
export ENCRYPTION_KEY="<32-byte-key>"
export NODE_ENV="production"
export LOG_LEVEL="info"
```

**Initialise project config**:

```bash
valora init
# then edit .valora/config.json as needed
```

<details>
<summary><strong>Deployment Configuration Details</strong></summary>

### Containerised Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN npm install -g @windagency/valora

ENV NODE_ENV=production

CMD ["valora", "--version"]
```

### CI/CD Integration

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

      - name: Install Valora
        run: npm install -g @windagency/valora

      - name: Verify
        run: valora --version

      - name: Deploy
        run: ./deploy.sh
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

</details>

---

## Monitoring

### Log Files

- **Location**: `.valora/logs/` (project) or `~/.valora/logs/` (global)
- **Format**: `ai-YYYY-MM-DD.log`
- **Rotation**: Daily, max 100 MB

**View logs**:

```bash
# Follow live
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log

# Last 100 entries
tail -100 .valora/logs/ai-$(date +%Y-%m-%d).log

# Search for errors
rg -i error .valora/logs/
```

### System Metrics

```bash
# Session count
ls -1 .valora/sessions/ | wc -l

# Disk usage
du -sh .valora/sessions/ .valora/logs/

# Memory usage
ps aux | grep "node.*valora" | awk '{print $4"%"}'
```

<details>
<summary><strong>Monitoring Internals</strong></summary>

### Log Level Configuration

```json
{
	"logging": {
		"level": "info",
		"file_enabled": true,
		"daily_file_max_size_mb": 100
	}
}
```

Valid levels: `debug` | `info` | `warn` | `error`

### Continuous Monitoring Script

```bash
#!/bin/bash
# monitor.sh

while true; do
  ./health-check.sh

  COUNT=$(ls -1 .valora/sessions/ | wc -l)
  echo "Sessions: $COUNT"

  ERRORS=$(rg -c ERROR .valora/logs/ai-$(date +%Y-%m-%d).log || echo 0)
  echo "Errors today: $ERRORS"

  sleep 300
done
```

### Error Alerting

```bash
# Stream errors to Slack (or any webhook)
tail -f .valora/logs/ai-$(date +%Y-%m-%d).log \
  | grep --line-buffered ERROR \
  | while read line; do
      curl -X POST -H 'Content-Type: application/json' \
        -d "{\"text\":\"Error: $line\"}" \
        "$SLACK_WEBHOOK_URL"
    done
```

</details>

---

## Performance Tuning

### Core Configuration

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

### Cleanup Commands

```bash
# Clear old sessions (>30 days)
valora session cleanup --days 30

# Clear cache
rm -rf .valora/cache/

# Clear old logs (>30 days)
find .valora/logs/ -name "*.log" -mtime +30 -delete
```

<details>
<summary><strong>Memory and Storage Internals</strong></summary>

### Memory Limit

```bash
node --max-old-space-size=2048 $(which valora)
```

### Continuous Memory Monitor

```bash
while true; do
  ps aux | grep "node.*valora" | awk '{print $6/1024 " MB"}'
  sleep 60
done
```

### Session Storage Optimisation

```bash
# Compress old sessions
find .valora/sessions -name "*.json" -exec gzip {} \;
```

</details>

---

## Backup and Recovery

### What to Back Up

| Path                  | Contents                 |
| --------------------- | ------------------------ |
| `.valora/sessions/`   | Session data             |
| `.valora/config.json` | Project configuration    |
| `.valora/agents/`     | Custom agent overrides   |
| `.valora/commands/`   | Custom command overrides |
| `.valora/logs/`       | Application logs         |

### Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups/valora/$DATE"
mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_DIR/sessions.tar.gz" .valora/sessions/
cp .valora/config.json "$BACKUP_DIR/"
tar -czf "$BACKUP_DIR/overrides.tar.gz" .valora/agents/ .valora/commands/ .valora/templates/ 2>/dev/null
find .valora/logs/ -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

echo "Backup completed: $BACKUP_DIR"
```

**Automate with cron**:

```bash
# Daily at 02:00
0 2 * * * /path/to/backup.sh >> /var/log/valora-backup.log 2>&1
```

### Recovery

```bash
# Restore sessions
tar -xzf backups/sessions.tar.gz
find .valora/sessions -name "*.json" -exec jq '.' {} \; > /dev/null  # verify integrity

# Restore configuration
cp backups/config.json .valora/config.json
valora config validate

# Resume an interrupted workflow
valora session list
valora session resume <session-id>
```

---

## Security

### API Key Management

- Store keys in environment variables, never in version control
- Use separate keys per environment
- Rotate regularly

```bash
# Rotate Anthropic key
export ANTHROPIC_API_KEY="sk-ant-new..."
valora config set llm.providers.anthropic.api_key_env ANTHROPIC_API_KEY
valora test llm
```

### Session Encryption

```json
{
	"session": {
		"encryption": true,
		"encryption_key_env": "ENCRYPTION_KEY"
	}
}
```

```bash
# Generate a 32-byte key
openssl rand -hex 32
```

### File Permissions

```bash
chmod 700 .valora/sessions/
chmod 600 .valora/config.json
chmod 700 .valora/logs/
```

---

## Maintenance

### Schedule

| Frequency | Task                                                      |
| --------- | --------------------------------------------------------- |
| Daily     | Check error logs, verify API connectivity                 |
| Weekly    | Review metrics, clean up old sessions, back up data       |
| Monthly   | Update dependencies, review configuration, security audit |

### Maintenance Script

```bash
#!/bin/bash
# maintenance.sh

valora session cleanup --days 30
find .valora/logs/ -name "*.log" -mtime +90 -delete
valora doctor
pnpm outdated
```

### Dependency Updates

```bash
pnpm outdated
pnpm update
pnpm test
pnpm build
```

---

## Troubleshooting

### High Disk Usage

```bash
du -sh .valora/* | sort -h
valora session cleanup --days 30
find .valora/logs -name "*.log" -mtime +30 -delete
```

### Performance Degradation

```bash
top -bn1 | grep "node"
pkill -f "valora "
rm -rf .valora/cache/
```

### API Rate Limiting

```bash
# Switch to a different provider
valora plan --provider openai "task"
```

---

## Related Documentation

- [User Guide: Configuration](../user-guide/configuration.md)
- [User Guide: Troubleshooting](../user-guide/troubleshooting.md)
- [Architecture: System Architecture](../architecture/system-architecture.md)
- [Automated Reporting](./automated-reporting.md)

---

_For production deployment assistance, consult the operations team._
