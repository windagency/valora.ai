# Metrics Quick Start

Get workflow metrics running in 5 minutes.

## Step 1: Verify dependencies

```bash
node --version          # must be >= 20
pnpm --version
ls node_modules/.bin/tsx
```

If `tsx` is missing:

```bash
pnpm install
```

## Step 2: Verify scripts

```bash
ls -la scripts/metrics scripts/dashboard scripts/generate-weekly-report.sh
./scripts/metrics 30d | jq '.'
```

Expected output includes `"totalWorkflows": 0` if no sessions exist yet.

## Step 3: Generate your first report

```bash
./scripts/generate-weekly-report.sh 30d
cat .valora/METRICS_REPORT.md
```

## Step 4: Check GitHub Actions (optional)

Automated reports run every Monday at 09:00 UTC. To verify the workflow is configured:

```bash
gh workflow view "Weekly Metrics Dashboard"
gh run list --workflow="Weekly Metrics Dashboard"
```

To trigger manually:

```bash
gh workflow run "Weekly Metrics Dashboard" --field period=30d --field create_issue=true
gh run watch
```

---

## Common tasks

### View latest metrics

```bash
./scripts/generate-weekly-report.sh 30d
```

### Check adoption against targets

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

### Compare two periods

```bash
./scripts/metrics 7d > metrics-7d.json
./scripts/metrics 30d > metrics-30d.json
jq -s '{
  weekly_workflows: .[0].totalWorkflows,
  monthly_workflows: .[1].totalWorkflows,
  weekly_time_saved: (.[0].totalTimeSaved / 60 | floor),
  monthly_time_saved: (.[1].totalTimeSaved / 60 | floor)
}' metrics-7d.json metrics-30d.json
```

### Export as CSV

```bash
./scripts/metrics 30d | jq -r '
  [
    "Metric,Value",
    "Total Workflows,\(.totalWorkflows)",
    "Template Usage %,\(.templateUsage.rate)",
    "Early Exit %,\(.earlyExit.rate)",
    "Time Saved (hours),\(.totalTimeSaved / 60)"
  ] | .[]
' > metrics.csv
```

### View historical reports (GitHub Issues)

```bash
gh issue list --label metrics,weekly-report
gh issue view <issue-number>
```

---

## Troubleshooting

### "No such file or directory: scripts/metrics"

Recreate the wrapper scripts:

```bash
cat > scripts/metrics << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/extract-metrics.ts" "$@"
EOF
chmod +x scripts/metrics

cat > scripts/dashboard << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/generate-dashboard.ts" "$@"
EOF
chmod +x scripts/dashboard
```

### "Report shows 0 workflows"

```bash
find .valora/sessions -name "*.json" -type f
cat .valora/sessions/*/session.json | jq '.commands[0].optimization_metrics'
```

If no sessions exist, run at least one complete workflow (`plan` → `review-plan` → `implement` → `assert`), then re-generate.

### "Permission denied when executing scripts"

```bash
chmod +x scripts/metrics scripts/dashboard scripts/generate-weekly-report.sh
```

### "Workflow not running on schedule"

```bash
gh workflow view "Weekly Metrics Dashboard"
gh run list --workflow="Weekly Metrics Dashboard"
gh workflow run "Weekly Metrics Dashboard"
```

Confirm Actions are enabled: Settings → Actions → General → "Allow all actions and reusable workflows".

---

For the full metrics reference — optimisation details, schema, and advanced configuration — see the [Metrics guide](./metrics.md).
