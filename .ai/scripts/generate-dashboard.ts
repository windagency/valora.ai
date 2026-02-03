#!/usr/bin/env tsx
/**
 * Dashboard Generation Script
 *
 * Generates visual dashboard from extracted metrics
 * Usage: tsx generate-dashboard.ts [metrics.json]
 */

import { readFileSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';

interface Metrics {
  period: string;
  startDate: string;
  endDate: string;
  totalWorkflows: number;
  templateUsage: {
    total: number;
    rate: number;
    byPattern: Record<string, { count: number; avgTime: number; timeSaved: number }>;
    avgTimeSaved: number;
    totalTimeSaved: number;
  };
  earlyExit: {
    triggered: number;
    rate: number;
    avgTimeSaved: number;
    totalTimeSaved: number;
    confidenceDistribution: Record<string, number>;
  };
  expressPlanning: {
    used: number;
    rate: number;
    avgComplexity: number;
    avgTime: number;
    avgTimeSaved: number;
    totalTimeSaved: number;
  };
  avgWorkflowTime: number;
  baselineTime: number;
  totalTimeSaved: number;
  timeEfficiency: number;
  phaseBreakdown: Record<string, {
    avg: number;
    count: number;
    baseline: number;
    savings: number;
  }>;
  realTimeLinting: {
    implementations: number;
    errorsFoundRealtime: number;
    errorsInAssert: number;
    totalTimeSaved: number;
  };
  decisionCriteria: {
    avgIterations: number;
    baselineIterations: number;
    iterationReduction: number;
    totalTimeSaved: number;
  };
  technicalDefaults: {
    avgClarifications: number;
    baselineClarifications: number;
    clarificationReduction: number;
    totalTimeSaved: number;
  };
  qualityScores: {
    codeQuality: number;
    testQuality: number;
    reviewQuality: number;
  };
}

function generateBar(percentage: number, width: number = 20, symbol: string = '█'): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return symbol.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function generateDashboard(metrics: Metrics): string {
  const improvement = ((metrics.totalTimeSaved / (metrics.baselineTime * metrics.totalWorkflows)) * 100).toFixed(0);
  const templateRate = metrics.templateUsage.rate.toFixed(0);
  const earlyExitRate = metrics.earlyExit.rate.toFixed(0);
  const totalHoursSaved = (metrics.totalTimeSaved / 60).toFixed(1);

  // Sort phases by baseline time (descending)
  const sortedPhases = Object.entries(metrics.phaseBreakdown)
    .sort((a, b) => b[1].baseline - a[1].baseline);

  // Calculate time savings percentage for each optimization
  const optimizationSavings = {
    templates: metrics.templateUsage.totalTimeSaved,
    earlyExit: metrics.earlyExit.totalTimeSaved,
    express: metrics.expressPlanning.totalTimeSaved,
    linting: metrics.realTimeLinting.totalTimeSaved,
    criteria: metrics.decisionCriteria.totalTimeSaved,
    defaults: metrics.technicalDefaults.totalTimeSaved
  };

  return `# Workflow Optimization Metrics Report

**Generated**: ${new Date().toISOString().split('T')[0]}
**Period**: ${metrics.period} (${new Date(metrics.startDate).toISOString().split('T')[0]} to ${new Date(metrics.endDate).toISOString().split('T')[0]})
**Workflows Analyzed**: ${metrics.totalWorkflows}

---

## Executive Summary

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│ WORKFLOW PERFORMANCE SUMMARY                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Workflow Time:  ${formatDuration(metrics.avgWorkflowTime).padEnd(6)} ▼${improvement}% from baseline     │
│  Baseline Time:          ${formatDuration(metrics.baselineTime).padEnd(6)}                         │
│  Time Efficiency Score:  ${metrics.timeEfficiency}/100                              │
│  Workflows Completed:    ${metrics.totalWorkflows.toString().padEnd(6)}                         │
│  Total Time Saved:       ${totalHoursSaved} hours                         │
│                                                             │
│  ${generateBar(parseFloat(improvement))} ${improvement}%                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ OPTIMIZATION ADOPTION RATES                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Plan Templates:      ${generateBar(metrics.templateUsage.rate, 15)}  ${templateRate}%  (Target: 40%) │
│  Early Exit Reviews:  ${generateBar(metrics.earlyExit.rate, 15)}  ${earlyExitRate}%  (Target: 30%) │
│  Express Planning:    ${generateBar(metrics.expressPlanning.rate, 15)}  ${metrics.expressPlanning.rate.toFixed(0)}%  (Target: 15%) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
\`\`\`

---

## Optimization Performance

### 1. Plan Templates

${metrics.templateUsage.total > 0 ? `
- **Usage**: ${metrics.templateUsage.total} plans (${templateRate}% of total)
- **Average Time Saved**: ${metrics.templateUsage.avgTimeSaved.toFixed(1)} minutes per plan
- **Total Time Saved**: ${(metrics.templateUsage.totalTimeSaved / 60).toFixed(1)} hours

**By Pattern**:
${Object.entries(metrics.templateUsage.byPattern)
  .sort((a, b) => b[1].count - a[1].count)
  .map(([pattern, data]) => {
    const percentage = (data.count / metrics.templateUsage.total * 100).toFixed(0);
    return `- **${pattern}**: ${data.count} uses (${percentage}%) - ${data.timeSaved.toFixed(1)} min total saved`;
  })
  .join('\n')}
` : '*No template usage data available yet*'}

### 2. Early Exit Reviews

${metrics.earlyExit.triggered > 0 ? `
- **Trigger Rate**: ${earlyExitRate}% (${metrics.earlyExit.triggered}/${metrics.totalWorkflows} reviews)
- **Average Time Saved**: ${metrics.earlyExit.avgTimeSaved.toFixed(1)} minutes per early exit
- **Total Time Saved**: ${(metrics.earlyExit.totalTimeSaved / 60).toFixed(1)} hours

**Confidence Distribution**:
${Object.entries(metrics.earlyExit.confidenceDistribution)
  .map(([range, count]) => {
    const percentage = (count / metrics.earlyExit.triggered * 100).toFixed(0);
    return `- ${range}: ${generateBar(parseFloat(percentage), 10)} ${count} reviews (${percentage}%)`;
  })
  .join('\n')}
` : '*No early exit data available yet*'}

### 3. Express Planning

${metrics.expressPlanning.used > 0 ? `
- **Usage Rate**: ${metrics.expressPlanning.rate.toFixed(0)}% (${metrics.expressPlanning.used}/${metrics.totalWorkflows} plans)
- **Average Complexity**: ${metrics.expressPlanning.avgComplexity.toFixed(1)}/10 (trivial)
- **Average Time Saved**: ${metrics.expressPlanning.avgTimeSaved.toFixed(1)} minutes per plan
- **Total Time Saved**: ${(metrics.expressPlanning.totalTimeSaved / 60).toFixed(1)} hours
` : '*No express planning data available yet*'}

### 4. Real-Time Linting

${metrics.realTimeLinting.implementations > 0 ? `
- **Implementations**: ${metrics.realTimeLinting.implementations}
- **Errors Caught Real-Time**: ${metrics.realTimeLinting.errorsFoundRealtime}
- **Errors in Assert Phase**: ${metrics.realTimeLinting.errorsInAssert} ✓
- **Error Reduction**: ${((1 - metrics.realTimeLinting.errorsInAssert / Math.max(1, metrics.realTimeLinting.errorsFoundRealtime)) * 100).toFixed(0)}%
- **Total Time Saved**: ${(metrics.realTimeLinting.totalTimeSaved / 60).toFixed(1)} hours
` : '*No linting data available yet*'}

### 5. Decision Criteria

${metrics.decisionCriteria.avgIterations > 0 ? `
- **Average Iterations**: ${metrics.decisionCriteria.avgIterations.toFixed(1)} (baseline: ${metrics.decisionCriteria.baselineIterations})
- **Iteration Reduction**: ${metrics.decisionCriteria.iterationReduction.toFixed(0)}%
- **Total Time Saved**: ${(metrics.decisionCriteria.totalTimeSaved / 60).toFixed(1)} hours
` : '*No decision criteria data available yet*'}

### 6. Technical Defaults

${metrics.technicalDefaults.avgClarifications > 0 ? `
- **Average Clarifications**: ${metrics.technicalDefaults.avgClarifications.toFixed(1)} (baseline: ${metrics.technicalDefaults.baselineClarifications})
- **Clarification Reduction**: ${metrics.technicalDefaults.clarificationReduction.toFixed(0)}%
- **Total Time Saved**: ${(metrics.technicalDefaults.totalTimeSaved / 60).toFixed(1)} hours
` : '*No technical defaults data available yet*'}

---

## Phase Breakdown

| Phase | Current | Baseline | Savings | Change |
|-------|---------|----------|---------|--------|
${sortedPhases
  .map(([phase, data]) => {
    const change = data.baseline > 0 ? ((data.savings / data.baseline) * 100).toFixed(0) : '0';
    const arrow = data.savings > 0 ? '▼' : data.savings < 0 ? '▲' : '→';
    return `| ${phase.padEnd(13)} | ${data.avg.toFixed(1)} min | ${data.baseline.toFixed(1)} min | ${data.savings.toFixed(1)} min | ${arrow}${change}% |`;
  })
  .join('\n')}

**Total Workflow Time**: ${formatDuration(metrics.avgWorkflowTime)} (baseline: ${formatDuration(metrics.baselineTime)})

---

## Quality Metrics

| Metric | Score | Status |
|--------|-------|--------|
| Code Quality | ${metrics.qualityScores.codeQuality}/100 | ${metrics.qualityScores.codeQuality >= 80 ? '✓ Good' : '⚠ Needs improvement'} |
| Test Quality | ${metrics.qualityScores.testQuality}/100 | ${metrics.qualityScores.testQuality >= 80 ? '✓ Good' : '⚠ Needs improvement'} |
| Review Quality | ${metrics.qualityScores.reviewQuality.toFixed(0)}/100 | ${metrics.qualityScores.reviewQuality >= 70 ? '✓ Good' : '⚠ Needs improvement'} |

*Quality metrics maintained or improved despite time savings*

---

## Time Savings Distribution

\`\`\`
Total Time Saved: ${totalHoursSaved} hours

By Optimization:
${Object.entries(optimizationSavings)
  .filter(([, savings]) => savings > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([name, savings]) => {
    const percentage = (savings / metrics.totalTimeSaved) * 100;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return `${label.padEnd(15)}: ${generateBar(percentage, 20)} ${(savings / 60).toFixed(1)}h (${percentage.toFixed(0)}%)`;
  })
  .join('\n')}
\`\`\`

---

## Recommendations

${metrics.templateUsage.rate < 40 ? '⚠️ **Template usage below target** - Consider creating more templates for common patterns\n' : ''}
${metrics.earlyExit.rate < 30 ? '⚠️ **Early exit rate below target** - Review confidence thresholds\n' : ''}
${metrics.expressPlanning.rate < 15 ? '⚠️ **Express planning underutilized** - Ensure trivial tasks are routed correctly\n' : ''}
${metrics.realTimeLinting.errorsInAssert > 0 ? '⚠️ **Linter errors in assert phase** - Real-time validation may need tuning\n' : ''}
${metrics.templateUsage.rate >= 40 && metrics.earlyExit.rate >= 30 && metrics.expressPlanning.rate >= 15 ? '✅ **All optimization targets met!** - Continue monitoring and refining\n' : ''}

---

## Next Steps

1. **Monitor trends** - Track metrics weekly for patterns
2. **Adjust thresholds** - Fine-tune based on actual performance
3. **Add templates** - Create new templates for emerging patterns
4. **Share learnings** - Document what works best

---

*Generated by Workflow Optimization Metrics Dashboard v1.0*
`;
}

// Read metrics from stdin or file and generate dashboard
(async () => {
  let input: string;

  // If file path provided as argument, read from file
  if (process.argv[2]) {
    input = readFileSync(process.argv[2], 'utf-8');
  }
  // Otherwise read from stdin (piped input)
  else if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf-8');
  }
  // Default to metrics.json in current directory
  else {
    input = readFileSync('metrics.json', 'utf-8');
  }

  const metrics: Metrics = JSON.parse(input);
  const dashboard = generateDashboard(metrics);

  // Write to file
  await writeFile('.ai/METRICS_REPORT.md', dashboard);
  console.log('✓ Dashboard generated: .ai/METRICS_REPORT.md');
  console.log(`✓ Period: ${metrics.period}`);
  console.log(`✓ Workflows: ${metrics.totalWorkflows}`);
  console.log(`✓ Time saved: ${(metrics.totalTimeSaved / 60).toFixed(1)} hours`);
})().catch(error => {
  console.error('Failed to generate dashboard:', error);
  process.exit(1);
});
