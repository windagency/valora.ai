# Metrics System Quick Start

Get up and running with automated workflow metrics in 5 minutes.

## ✅ Verification Checklist

### 1. Check Dependencies

```bash
# Verify Node.js version (should be >=20)
node --version

# Verify pnpm is installed
pnpm --version

# Verify dependencies are installed
ls node_modules/.bin/tsx
```

**If missing**:

```bash
pnpm install
```

### 2. Check Scripts

```bash
# Verify wrapper scripts exist and are executable
ls -la scripts/metrics scripts/dashboard scripts/generate-weekly-report.sh

# Test extraction script
./scripts/metrics 30d | jq '.'

# Test dashboard generation
./scripts/metrics 30d | ./scripts/dashboard
```

**Expected output**:

```plaintext
✓ Dashboard generated: .valora/METRICS_REPORT.md
✓ Period: 30d
✓ Workflows: 0
✓ Time saved: 0.0 hours
```

### 3. Check GitHub Actions

```bash
# Verify workflow file exists
cat .github/workflows/metrics-dashboard.yml

# Check workflow status (requires gh CLI)
gh workflow view "Weekly Metrics Dashboard"
```

## 🚀 Quick Start Guides

### For Users: View Metrics

**Weekly Automated Reports** (No setup needed):

1. Wait for Monday 9am UTC
2. Check GitHub Issues for new report
3. Review metrics and recommendations

**Manual Report Generation**:

```bash
# Generate current metrics
./scripts/generate-weekly-report.sh 30d

# View report
cat .valora/METRICS_REPORT.md
```

### For Developers: Testing Metrics

**Create Test Session**:

```bash
# Create test workflow directory
mkdir -p .valora/sessions/test-workflow-001

# Create test session with metrics
cat > .valora/sessions/test-workflow-001/session.json << 'EOF'
{
  "session_id": "test-workflow-001",
  "created_at": "2026-02-02T10:00:00.000Z",
  "updated_at": "2026-02-02T10:30:00.000Z",
  "status": "completed",
  "commands": [
    {
      "command": "plan",
      "args": [],
      "flags": {},
      "timestamp": "2026-02-02T10:00:00.000Z",
      "duration_ms": 240000,
      "success": true,
      "outputs": {},
      "optimization_metrics": {
        "template_used": "PATTERN_REST_API",
        "planning_mode": "template",
        "complexity_score": 4.2,
        "pattern_detected": "REST_API",
        "pattern_confidence": 0.85,
        "time_saved_minutes": 8.5
      },
      "tokens_used": 12500
    },
    {
      "command": "review-plan",
      "args": [],
      "flags": {},
      "timestamp": "2026-02-02T10:04:00.000Z",
      "duration_ms": 180000,
      "success": true,
      "outputs": {},
      "optimization_metrics": {
        "early_exit_triggered": true,
        "initial_confidence": 9.2,
        "time_saved_minutes": 12.0
      },
      "quality_metrics": {
        "plan_approved": true,
        "review_score": 92,
        "iterations": 1
      },
      "tokens_used": 8200
    },
    {
      "command": "implement",
      "args": [],
      "flags": {},
      "timestamp": "2026-02-02T10:07:00.000Z",
      "duration_ms": 900000,
      "success": true,
      "outputs": {},
      "quality_metrics": {
        "lint_errors_realtime": 5,
        "auto_fixes_applied": 4,
        "files_generated": 2
      },
      "tokens_used": 25000
    }
  ],
  "context": {}
}
EOF

# Generate metrics
./scripts/metrics 30d | jq '.templateUsage, .earlyExit'

# Expected output shows:
# - Template usage: 1 (100%)
# - Early exit triggered: 1 (100%)
```

**Verify Metrics**:

```bash
# Check metrics extraction
./scripts/metrics 30d | jq '{
  workflows: .totalWorkflows,
  templates: .templateUsage.total,
  earlyExit: .earlyExit.triggered,
  linting: .realTimeLinting.implementations
}'

# Expected: workflows=1, templates=1, earlyExit=1, linting=1
```

**Generate Dashboard**:

```bash
# Create full report
./scripts/generate-weekly-report.sh 30d

# View key sections
head -80 .valora/METRICS_REPORT.md
```

**Cleanup Test Data**:

```bash
# Remove test session
rm -rf .valora/sessions/test-workflow-001
```

### For Admins: Setup Automation

**Enable GitHub Actions**:

1. Go to repository Settings → Actions → General
2. Ensure "Allow all actions and reusable workflows" is selected
3. Verify "Read and write permissions" under Workflow permissions

**Test Workflow Manually**:

```bash
# Trigger workflow via GitHub CLI
gh workflow run "Weekly Metrics Dashboard" \
  --field period=30d \
  --field create_issue=true

# Monitor workflow
gh run watch

# View results
gh run view --log
```

**Setup Local Cron** (Optional):

```bash
# Edit crontab
crontab -e

# Add weekly report (every Monday at 9am)
0 9 * * 1 cd /path/to/valora && ./scripts/generate-weekly-report.sh 30d >> /tmp/metrics.log 2>&1

# Verify cron job
crontab -l
```

## 🎯 Common Tasks

### Task 1: View Latest Metrics

```bash
./scripts/generate-weekly-report.sh 30d
```

### Task 2: Check Optimization Targets

```bash
./scripts/metrics 30d | jq '{
  template_usage: (.templateUsage.rate | floor),
  template_target: 40,
  early_exit_rate: (.earlyExit.rate | floor),
  early_exit_target: 30,
  express_rate: (.expressPlanning.rate | floor),
  express_target: 15
}'
```

### Task 3: Compare Periods

```bash
# Last 7 days
./scripts/metrics 7d > metrics-7d.json

# Last 30 days
./scripts/metrics 30d > metrics-30d.json

# Compare
jq -s '{
  weekly_workflows: .[0].totalWorkflows,
  monthly_workflows: .[1].totalWorkflows,
  weekly_time_saved: (.[0].totalTimeSaved / 60 | floor),
  monthly_time_saved: (.[1].totalTimeSaved / 60 | floor)
}' metrics-7d.json metrics-30d.json
```

### Task 4: Export for Analysis

```bash
# Export as CSV
./scripts/metrics 30d | jq -r '
  [
    "Metric,Value",
    "Total Workflows,\(.totalWorkflows)",
    "Template Usage %,\(.templateUsage.rate)",
    "Early Exit %,\(.earlyExit.rate)",
    "Time Saved (hours),\(.totalTimeSaved / 60)"
  ] | .[]
' > metrics.csv

# View
cat metrics.csv
```

### Task 5: Create GitHub Issue

```bash
# Requires gh CLI
./scripts/generate-weekly-report.sh 30d --issue
```

### Task 6: View Historical Reports

```bash
# List all metrics reports (issues)
gh issue list --label metrics,weekly-report

# View specific report
gh issue view <issue-number>

# Download workflow artifacts
gh run list --workflow="Weekly Metrics Dashboard"
gh run download <run-id> --name metrics-report-30d
```

## 🔍 Troubleshooting

### Problem: "No such file or directory: scripts/metrics"

**Solution**:

```bash
# Recreate wrapper scripts
cat > scripts/metrics << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/extract-metrics.ts" "$@"
EOF

chmod +x scripts/metrics

# Same for dashboard
cat > scripts/dashboard << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/generate-dashboard.ts" "$@"
EOF

chmod +x scripts/dashboard
```

### Problem: "Report shows 0 workflows"

**Causes**:

1. No session logs exist yet
2. Session logs are outside date range
3. Session logs missing metrics fields

**Solution**:

```bash
# Check if sessions exist
find .valora/sessions -name "*.json" -type f

# Check session contents
cat .valora/sessions/*/session.json | jq '.commands[0].optimization_metrics'

# Create test session (see above)
```

### Problem: "Workflow not running on schedule"

**Solution**:

```bash
# Verify workflow file
gh workflow view "Weekly Metrics Dashboard"

# Check recent runs
gh run list --workflow="Weekly Metrics Dashboard"

# Manual trigger
gh workflow run "Weekly Metrics Dashboard"
```

### Problem: "Permission denied when executing scripts"

**Solution**:

```bash
# Make scripts executable
chmod +x scripts/metrics
chmod +x scripts/dashboard
chmod +x scripts/generate-weekly-report.sh
```

## 📚 Next Steps

1. ✅ **Verify Setup** - Run through verification checklist above
2. 📊 **Generate First Report** - Run `generate-weekly-report.sh`
3. 🔄 **Use Workflows** - Execute `/plan`, `/review-plan`, `/implement` commands
4. 📈 **Review Metrics** - Check weekly reports for optimization insights
5. 🎯 **Optimize** - Act on recommendations to improve efficiency

## 📖 Documentation

- **Full Guide**: `documentation/operations/automated-reporting.md`
- **Scripts Documentation**: `scripts/README.md`
- **Metrics Dashboard**: `documentation/architecture/metrics-dashboard.md`
- **Workflow Config**: `.github/workflows/metrics-dashboard.yml`

---

**Need Help?** Check the troubleshooting section in `scripts/README.md`
