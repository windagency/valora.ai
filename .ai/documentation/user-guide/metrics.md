# Workflow Metrics and Optimization

VALORA includes a comprehensive metrics collection and reporting system that tracks workflow optimizations and provides data-driven insights into development efficiency.

## Overview

The metrics system automatically collects data about workflow optimizations, including:

- **Template Usage** - Time saved by using pattern templates
- **Early Exit Reviews** - Skipped review iterations for high-confidence plans
- **Express Planning** - Simplified planning for trivial tasks
- **Real-Time Linting** - Errors caught during implementation vs assertion
- **Decision Criteria** - Reduced review iterations through clear criteria
- **Technical Defaults** - Reduced clarification questions

## Quick Start

### View Current Metrics

```bash
# Generate report for last 30 days
./.ai/scripts/generate-weekly-report.sh 30d

# View the report
cat .ai/METRICS_REPORT.md
```

### Understanding the Dashboard

The metrics dashboard shows:

1. **Executive Summary** - Overall workflow performance
2. **Optimization Adoption** - Usage rates of each optimization
3. **Optimization Performance** - Time savings by optimization type
4. **Phase Breakdown** - Time spent in each workflow phase
5. **Quality Metrics** - Code/test/review quality scores
6. **Recommendations** - Actionable improvements

## Optimization Types

### 1. Plan Templates

**What it is**: Pre-built implementation plans for common patterns (REST API, React components, database migrations).

**How it helps**:

- Reduces planning time from 13-15 min to 4-6 min
- Ensures consistency across similar implementations
- Includes best practices by default

**Example**:

```bash
# Use template for REST API
valora plan "Add users API" --pattern=rest-api
```

**Metrics**:

- Usage rate (target: 40%)
- Average time saved: 8-10 minutes
- Total time saved: Cumulative across all workflows

### 2. Early Exit Reviews

**What it is**: Skip additional review iterations when initial confidence is high (≥8.5/10).

**How it helps**:

- Saves 10-15 minutes per high-quality plan
- Reduces unnecessary back-and-forth
- Maintains quality through clear thresholds

**Triggers when**:

- Overall confidence ≥ 8.5
- No critical blockers
- All dimension scores ≥ 7.0

**Metrics**:

- Trigger rate (target: 30%)
- Confidence distribution
- Average time saved: 10-15 minutes

### 3. Express Planning

**What it is**: Simplified 2-3 minute planning for trivial tasks (complexity < 3).

**How it helps**:

- Saves 10-12 minutes on simple tasks
- Reduces overhead for minor changes
- Maintains plan structure for documentation

**Example trivial tasks**:

- Update a constant value
- Fix a typo
- Add a simple helper function

**Metrics**:

- Usage rate (target: 15%)
- Average complexity: < 3/10
- Average time saved: 10-12 minutes

### 4. Parallel Validation

**What it is**: Run plan validation checks concurrently instead of sequentially.

**How it helps**:

- Reduces validation time from 16-18 min to 4-6 min
- Faster feedback on plan quality
- Maintains thorough validation

**Checks run in parallel**:

- Technical feasibility
- Risk coverage
- Step quality
- Test strategy

**Metrics**:

- Reviews using parallel validation
- Average time: 4-6 min (vs 16-18 min sequential)
- Average time saved: 12-15 minutes

### 5. Real-Time Linting

**What it is**: Run ESLint during code generation instead of only in assert phase.

**How it helps**:

- Catches errors earlier
- Enables auto-fixes during implementation
- Reduces assert phase failures

**Workflow**:

```plaintext
Implement → Real-time ESLint → Auto-fix → Continue
```

**Metrics**:

- Errors found real-time vs assert phase
- Auto-fix rate
- Average time saved: 3-5 minutes

### 6. Decision Criteria

**What it is**: Explicit thresholds for go/no-go decisions in reviews.

**How it helps**:

- Reduces subjective uncertainty
- Fewer review iterations
- Clearer improvement paths

**Criteria examples**:

- Dependency count: <5 good, 5-10 acceptable, >15 escalate
- Risk count by complexity: Simple (2-4), Moderate (5-8), Complex (9-15)

**Metrics**:

- Average iterations: target reduction to ~1.5
- Single-iteration rate
- Average time saved: 5-8 minutes

### 7. Technical Defaults

**What it is**: Pre-defined technology choices to reduce clarification questions.

**How it helps**:

- Eliminates "which tool?" questions
- Ensures consistency
- Speeds up onboarding

**Examples**:

- Package manager: pnpm (never npm/yarn)
- Testing: Vitest (unit), Playwright (E2E)
- Linting: ESLint + Prettier

**Metrics**:

- Clarification reduction: target 60%
- Average questions: reduced from 8.2 to ~3
- Average time saved: 12-15 minutes

## Viewing Metrics

### Automated Weekly Reports

**Every Monday at 9am UTC**, GitHub Actions automatically:

1. Extracts metrics from session logs
2. Generates dashboard report
3. Commits to `.ai/METRICS_REPORT.md`
4. Creates GitHub issue with summary

**View in GitHub**:

```bash
# List metrics reports
gh issue list --label metrics,weekly-report

# View specific report
gh issue view <number>
```

### Manual Report Generation

**Local generation**:

```bash
# Generate for last 30 days
./.ai/scripts/generate-weekly-report.sh 30d

# Generate for last 7 days
./.ai/scripts/generate-weekly-report.sh 7d

# Create GitHub issue
./.ai/scripts/generate-weekly-report.sh 30d --issue
```

### Raw Metrics Extraction

**Extract JSON metrics**:

```bash
# Extract metrics
./.ai/scripts/metrics 30d > metrics.json

# Query specific data
jq '.templateUsage' metrics.json
jq '.earlyExit' metrics.json
jq '.qualityScores' metrics.json
```

## Interpreting Results

### Overall Efficiency Score

The **Time Efficiency Score** indicates overall workflow improvement:

- **90-100**: Excellent - consistently hitting optimization targets
- **70-89**: Good - regular optimization usage, room for improvement
- **50-69**: Fair - some optimizations used, increase adoption
- **<50**: Poor - optimizations underutilized, review recommendations

### Optimization Adoption Rates

Each optimization has a target adoption rate:

| Optimization     | Target | Interpretation                    |
| ---------------- | ------ | --------------------------------- |
| Plan Templates   | 40%    | 40% of plans should use templates |
| Early Exit       | 30%    | 30% of reviews should exit early  |
| Express Planning | 15%    | 15% of plans should be express    |

**If below target**: Review recommendations in the report for improvement actions.

### Time Savings

**Total Time Saved** = (Baseline Time - Actual Time) × Workflows

**Example**:

- Baseline: 3h 12m per workflow
- Actual: 2h 10m per workflow
- Workflows: 10
- Time Saved: (192 - 130) × 10 = 620 minutes = 10.3 hours

### Quality Scores

Metrics track quality to ensure optimizations don't compromise code quality:

| Metric         | Target  | Current (Example) |
| -------------- | ------- | ----------------- |
| Code Quality   | >80/100 | 88/100 ✓          |
| Test Quality   | >80/100 | 85/100 ✓          |
| Review Quality | >70/100 | 65/100 ⚠          |

**Green (✓)**: Meeting or exceeding target
**Yellow (⚠)**: Below target, needs improvement

## Acting on Recommendations

The dashboard provides actionable recommendations based on metrics:

### "Template usage below target"

**Actions**:

1. Review common task patterns in backlog
2. Create custom templates for frequent patterns
3. Use `--pattern` flag when planning

**Example**:

```bash
# Identify patterns
grep -r "Add.*API" knowledge-base/BACKLOG.md

# Use template
valora plan "Add orders API" --pattern=rest-api
```

### "Early exit rate below target"

**Actions**:

1. Review confidence thresholds in plans
2. Improve plan quality to increase confidence
3. Ensure clear acceptance criteria

### "Express planning underutilized"

**Actions**:

1. Break down complex tasks into smaller pieces
2. Use express mode for simple tasks
3. Review complexity assessment

**Example**:

```bash
# Instead of:
valora plan "Update user model and fix validation"

# Break into:
valora plan "Update user model" --complexity-threshold=2
valora plan "Fix user validation" --complexity-threshold=2
```

### "Linter errors in assert phase"

**Actions**:

1. Verify real-time linting is enabled
2. Check ESLint configuration
3. Review auto-fix settings

## Best Practices

### 1. Consistent Pattern Usage

When similar tasks appear, use the same pattern:

```bash
# All API endpoints use template
valora plan "Add users API" --pattern=rest-api
valora plan "Add orders API" --pattern=rest-api
valora plan "Add products API" --pattern=rest-api
```

### 2. Leverage Express Planning

For simple tasks, use express mode:

```bash
# Simple changes
valora plan "Fix typo in error message" --mode=express
valora plan "Update version number" --mode=express
```

### 3. High-Quality Plans

Write clear plans to trigger early exit:

- Specific acceptance criteria
- Clear file paths
- Explicit dependencies
- Comprehensive risk assessment

### 4. Review Metrics Regularly

Check weekly reports to:

- Identify improvement opportunities
- Track optimization adoption
- Ensure quality isn't compromised

### 5. Customize for Your Workflow

Create custom templates for your common patterns:

```bash
# Copy existing template
cp .ai/templates/plans/PATTERN_REST_API.md \
   .ai/templates/plans/PATTERN_CUSTOM.md

# Edit for your needs
code .ai/templates/plans/PATTERN_CUSTOM.md
```

## Troubleshooting

### No Metrics Data

**Problem**: Dashboard shows 0 workflows

**Solutions**:

1. Execute workflow commands (`/plan`, `/review-plan`, `/implement`, `/assert`)
2. Verify session logs exist: `ls .ai/sessions/*/`
3. Check date range matches your activity

### Low Optimization Rates

**Problem**: All optimization rates are 0%

**Solutions**:

1. Use pattern templates: add `--pattern=<type>` to plan commands
2. Ensure plans have high initial quality for early exit
3. Break complex tasks into smaller pieces for express planning

### Missing Quality Metrics

**Problem**: Quality scores not showing

**Solutions**:

1. Run assert phase: `valora assert`
2. Verify linting runs during implementation
3. Complete review-plan for review scores

## Configuration

### Baseline Times

Baseline times are configured in `.ai/scripts/extract-metrics.ts`:

```typescript
const BASELINE_TIMES = {
  avgWorkflowTime: 192, // minutes (3h 12m)
  avgIterations: 2.3,
  avgClarifications: 8.2,
  phases: {
    'plan': 24.8,
    'review-plan': 39.6,
    'implement': 62.4,
    // ...
  }
};
```

Adjust these based on your team's historical data.

### Optimization Targets

Targets are defined in `.ai/METRICS_DASHBOARD.md`:

- Template Usage: 40%
- Early Exit Rate: 30%
- Express Planning: 15%

Adjust in the dashboard generation script if needed.

## Advanced Usage

### Custom Queries

Extract specific insights using jq:

```bash
# Template usage by pattern
./.ai/scripts/metrics 30d | jq '.templateUsage.byPattern'

# Confidence distribution for early exits
./.ai/scripts/metrics 30d | jq '.earlyExit.confidenceDistribution'

# Phase-by-phase time breakdown
./.ai/scripts/metrics 30d | jq '.phaseBreakdown'
```

### CI/CD Integration

Include metrics in your CI pipeline:

```yaml
# .github/workflows/deploy.yml
- name: Check optimization targets
  run: |
    TEMPLATE_RATE=$(./.ai/scripts/metrics 7d | jq -r '.templateUsage.rate')
    if (( $(echo "$TEMPLATE_RATE < 40" | bc -l) )); then
      echo "⚠️ Template usage below target"
    fi
```

### Export to Analytics

Export metrics to your analytics platform:

```bash
# Export as CSV
./.ai/scripts/metrics 30d | jq -r '
  ["Date","Workflows","Templates","EarlyExit","TimeSaved"],
  [
    (now | strftime("%Y-%m-%d")),
    .totalWorkflows,
    .templateUsage.total,
    .earlyExit.triggered,
    (.totalTimeSaved / 60 | floor)
  ] | @csv
' > metrics.csv
```

## Related Documentation

### User Guides

- [Metrics Quick Start](./metrics-quickstart.md) - 5-minute quick start
- [Workflow Optimizations](./workflow-optimizations.md) - Detailed optimization descriptions
- [Best Practices](./best-practices.md) - Recommended usage patterns
- [Configuration](./configuration.md) - Configure metrics system

### Technical References

- [Metrics System Architecture](../architecture/metrics-system.md) - Technical implementation
- [Metrics Dashboard](../architecture/metrics-dashboard.md) - Comprehensive metrics reference
- [Automated Reporting](../operations/automated-reporting.md) - Automation setup

### Scripts

- [Scripts README](../../scripts/README.md) - Script usage and troubleshooting

---

*For technical details on metrics implementation, see the [Architecture Documentation](../architecture/metrics-system.md).*
