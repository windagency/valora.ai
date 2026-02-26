---
name: feedback
description: Capture outcomes and user feedback to refine agents and prompts through continuous learning and workflow optimization
experimental: true
argument-hint: '[--command=<command-name>] [--pr=<pr-number>] [--satisfaction=<1-10>] [--interactive] [--metrics] [--suggest-improvements] [--export=<format>] [--no-stash]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
  - query_session
  - mcp_github
model: gpt-5-thinking-high
agent: product-manager
stash_protection: true
prompts:
  pipeline:
    - stage: context-identify
      prompt: context.identify-completed-workflow
      required: true
      inputs:
        command_name: $ARG_command
        pr_number: $ARG_pr
      outputs:
        - workflow_executed
        - commands_chain
        - start_time
        - end_time
        - execution_duration
    - stage: context-analyze
      prompt: context.analyze-command-execution
      required: true
      inputs:
        workflow_executed: $STAGE_context-identify.workflow_executed
        commands_chain: $STAGE_context-identify.commands_chain
      outputs:
        - agents_used
        - prompts_executed
        - tools_invoked
        - files_changed
        - errors_encountered
        - retries_performed
    - stage: context-git
      prompt: context.gather-git-metrics
      required: true
      parallel: true
      inputs:
        pr_number: $ARG_pr
      outputs:
        - commits_created
        - files_modified
        - lines_changed
        - test_coverage_delta
        - ci_status
        - review_comments_count
    - stage: review-feedback
      prompt: review.collect-user-feedback
      required: false
      conditional: interactive_mode == true || satisfaction_arg != null
      inputs:
        workflow_executed: $STAGE_context-identify.workflow_executed
        satisfaction_arg: $ARG_satisfaction
        interactive_mode: $ARG_interactive
      outputs:
        - satisfaction_score
        - feedback_comments
        - improvement_suggestions
        - pain_points
        - success_highlights
    - stage: review-performance
      prompt: review.calculate-performance-metrics
      required: true
      inputs:
        execution_duration: $STAGE_context-identify.execution_duration
        commands_chain: $STAGE_context-identify.commands_chain
        errors_encountered: $STAGE_context-analyze.errors_encountered
        retries_performed: $STAGE_context-analyze.retries_performed
      outputs:
        - time_efficiency_score
        - error_rate
        - completion_success_rate
        - bottlenecks_identified
        - performance_trends
    - stage: review-quality
      prompt: review.evaluate-quality-outcomes
      required: true
      inputs:
        files_changed: $STAGE_context-analyze.files_changed
        test_coverage_delta: $STAGE_context-git.test_coverage_delta
        ci_status: $STAGE_context-git.ci_status
        review_comments_count: $STAGE_context-git.review_comments_count
      outputs:
        - code_quality_score
        - test_quality_score
        - review_quality_score
        - overall_quality_score
    - stage: review-improvements
      prompt: review.identify-improvement-areas
      required: true
      inputs:
        agents_used: $STAGE_context-analyze.agents_used
        prompts_executed: $STAGE_context-analyze.prompts_executed
        bottlenecks_identified: $STAGE_review-performance.bottlenecks_identified
        errors_encountered: $STAGE_context-analyze.errors_encountered
      outputs:
        - agent_improvements
        - prompt_refinements
        - workflow_optimizations
        - tool_suggestions
        - training_recommendations
    - stage: summary
      prompt: documentation.generate-feedback-summary
      required: true
      inputs:
        workflow_executed: $STAGE_context-identify.workflow_executed
        execution_duration: $STAGE_context-identify.execution_duration
        satisfaction_score: $STAGE_review-feedback.satisfaction_score
        time_efficiency_score: $STAGE_review-performance.time_efficiency_score
        error_rate: $STAGE_review-performance.error_rate
        completion_success_rate: $STAGE_review-performance.completion_success_rate
        bottlenecks_identified: $STAGE_review-performance.bottlenecks_identified
        overall_quality_score: $STAGE_review-quality.overall_quality_score
        code_quality_score: $STAGE_review-quality.code_quality_score
        test_quality_score: $STAGE_review-quality.test_quality_score
        review_quality_score: $STAGE_review-quality.review_quality_score
        agent_improvements: $STAGE_review-improvements.agent_improvements
        prompt_refinements: $STAGE_review-improvements.prompt_refinements
        workflow_optimizations: $STAGE_review-improvements.workflow_optimizations
      outputs:
        - feedback_summary
        - key_insights
        - recommendations
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 500
    retry_on:
      - error
---

# Feedback Command

## Role

Use the [agent] profile

## Goal

**Capture comprehensive feedback and outcomes** from AI-assisted development workflows to enable continuous improvement of agents, prompts, and processes. This command provides systematic feedback collection, performance analysis, quality assessment, and actionable recommendations for optimizing the development workflow.

### Success Criteria

- ✅ Workflow execution chain is accurately reconstructed
- ✅ Performance metrics are comprehensively measured (time, errors, retries)
- ✅ Quality outcomes are objectively assessed (code, tests, reviews)
- ✅ User satisfaction is captured (if interactive mode)
- ✅ Bottlenecks and pain points are identified
- ✅ Specific improvement recommendations are generated
- ✅ Agent and prompt refinements are suggested
- ✅ Feedback report is stored in knowledge base
- ✅ Patterns and best practices are extracted
- ✅ Metrics are exported for analysis (if requested)

## Rules

### Feedback Collection

1. **MUST reconstruct workflow execution**:
   - Identify all commands executed
   - Extract agent/prompt pairs used
   - Capture timing information
   - Map command dependencies

2. **MUST gather comprehensive metrics**:
   - Git and repository metrics (commits, files, lines) — use structured `git` output
   - CI/CD status and test results
   - Performance metrics (time, errors, retries)
   - Quality metrics (code, tests, reviews)

3. **SHOULD collect user feedback** (when possible):
   - Use `--interactive` for guided feedback session
   - Accept `--satisfaction=<1-10>` for quick rating
   - Capture pain points and success highlights

### Performance Assessment

1. **MUST calculate objective scores**:
   - Time efficiency score (0-100)
   - Error rate and retry metrics
   - Completion success rate
   - Quality scores (code, test, review)

2. **MUST identify bottlenecks**:
   - Commands taking >150% of baseline time
   - High-error operations
   - User-reported slow parts

### Improvement Identification

1. **MUST generate actionable recommendations**:
   - Agent-specific improvements
   - Prompt refinements
   - Workflow optimizations
   - Tool suggestions

2. **MUST prioritize by impact**:
   - High: >10 min savings or critical issues
   - Medium: 5-10 min savings or quality improvements
   - Low: <5 min savings or nice-to-haves

### Output (No File Generation)

**IMPORTANT: This command does NOT write files to the .ai folder.**

1. **MUST display summary in terminal**:
   - Executive summary (2-3 sentences)
   - Performance and quality metrics
   - Prioritized recommendations
   - Key insights

2. **Insights are for display only**:
   - Patterns and learnings shown in output
   - No files created in .ai folder
   - No knowledge base modifications

### Git Safety (CRITICAL)

**IMPORTANT: This command MUST NOT modify the git working tree.**

1. **MUST stash uncommitted changes** at start (unless `--no-stash`):
   - Check for uncommitted changes: `git status --porcelain`
   - If changes exist, ask user: "Uncommitted changes detected. Stash them before gathering metrics?"
   - If user agrees, run: `git stash push -m "ai-feedback-auto-stash"`
   - Record that stash was created

2. **MUST restore changes** at end:
   - If stash was created, run: `git stash pop`
   - Verify working tree is restored

3. **NEVER run destructive git commands**:
   - ❌ `git checkout .` or `git checkout <file>`
   - ❌ `git reset` (any form)
   - ❌ `git restore`
   - ❌ `git clean`
   - ❌ `git stash drop` (without user consent)
   - ✅ Only read operations: `git log`, `git diff`, `git status`, `git show`, `git rev-list`

4. **If git commands fail**:
   - Report the error to the user
   - Do NOT attempt to "fix" git state
   - Continue with available data

## Context

### User-Provided Arguments

```plaintext
$ARGUMENTS
```

### Available Arguments

#### Command Context

- `--command=<command-name>` - Specify the last command executed (e.g., `create-pr`, `implement`)
- `--pr=<pr-number>` - Link feedback to specific pull request number
- `--workflow=<workflow-name>` - Specify full workflow (e.g., `feature-implementation`, `bugfix`)

#### Satisfaction Input

- `--satisfaction=<1-10>` - Quick satisfaction rating (1=very unsatisfied, 10=very satisfied)
- `--comment="<text>"` - Free-form feedback comment
- `--interactive` - Enter interactive feedback mode with guided questions

#### Analysis Options

- `--metrics` - Generate detailed performance and quality metrics (enabled by default)
- `--suggest-improvements` - Enable AI-powered improvement suggestions (enabled by default)
- `--compare-baseline` - Compare metrics against historical baseline
- `--identify-bottlenecks` - Highlight slowest operations (enabled by default)

#### Export Options

- `--export=<format>` - Export feedback report (formats: `markdown`, `json`, `csv`, `html`)
- `--output=<path>` - Custom output path for report
- `--summary-only` - Generate summary report only (skip detailed analysis)

## Integration with Workflow

### Position in Development Lifecycle

The feedback command typically runs after workflow completion to capture learnings:

```plaintext
create-pr → feedback → [next-task]
```

### Typical Usage Patterns

#### Pattern 1: After PR Merge

```bash
create-pr
# PR gets reviewed and merged
feedback --pr=<number> --interactive
```

#### Pattern 2: After Complete Workflow

```bash
fetch-task → plan → implement → test → commit → create-pr
feedback --command=create-pr --satisfaction=8
```

#### Pattern 3: Quick Feedback

```bash
feedback --satisfaction=9 --comment="Great workflow, very smooth!"
```

#### Pattern 4: Detailed Analysis with Export

```bash
feedback --pr=456 --interactive --export=json --metrics
```

## Examples

### Example 1: Quick Feedback After PR Creation

**Input:**

```bash
feedback --command=create-pr --satisfaction=9
```

**Output:**

```plaintext
📊 Collecting feedback for workflow: create-pr

✅ Workflow Analysis Complete
- Duration: 3 minutes
- Agent: @lead
- Files changed: 12
- Quality score: 92/100

📝 Feedback Report Saved
- Path: .ai/feedback/2025-11-15-1430-create-pr.md
- Satisfaction: 9/10 (Excellent!)

💡 Key Insights:
✅ PR creation was fast and high quality
✅ All checks passed, reviewers assigned successfully

No significant improvements identified. Great workflow! 🎉
```

### Example 2: Interactive Feedback Session

**Input:**

```bash
feedback --interactive --pr=456
```

**Output:**

```plaintext
📊 Feedback Session: Feature Implementation Workflow

Workflow Overview:
- Commands: fetch-task → plan → implement → test → commit → create-pr
- Duration: 1h 30m
- PR #456: feat(auth): add OAuth2 authentication
- Status: ✅ Merged

---

Overall, how satisfied are you with this workflow? (1-10): 8

✨ What went well?
> Implementation was smooth, AI understood requirements clearly.

😤 What was frustrating or slow?
> Test phase took 15 minutes. Expected 5 minutes.

💡 What could be improved?
> Better linting before commit, faster tests.

⏱️ Which part took longer than expected?
> The test command.

❓ Were there any confusing steps?
> No.

🎯 Any suggestions for specific agents or prompts?
> Engineer agent should check linting before finishing.

---

📈 Analyzing Performance Metrics...

Performance Summary:
- Time Efficiency: 75/100
- Error Rate: 4% (3 errors, 2 auto-resolved)
- Completion Success: 100% ✅

Quality Summary:
- Code Quality: 88/100 ✅
- Test Quality: 82/100 ✅
- Review Quality: 90/100 ✅
- Overall: 87/100 ✅

🔍 Identified Bottlenecks:
1. Test execution (15 min vs 5 min expected)
   → Parallelize test suites, optimize setup

2. Manual linter fixes (2 retries)
   → Add real-time linting validation

💡 Improvement Recommendations:

High Priority:
1. Optimize Test Performance (Save 10 min/workflow)
2. Add Real-Time Linter Validation (Save 5 min)

Medium Priority:
3. Parallel Execution (Save 5 min)

---

✅ Feedback Report Generated
📄 Path: .ai/feedback/2025-11-15-1430-feature-implementation.md

🧠 Knowledge Base Updated:
- 2 patterns learned
- 2 best practices added
- Agent profiles refined

Thank you for your feedback! 🙏
```

### Example 3: Feedback with JSON Export

**Input:**

```bash
feedback --pr=789 --export=json
```

**Output:**

```plaintext
📊 Analyzing Workflow from PR #789...

Workflow: Bugfix Implementation
Duration: 45 minutes

✅ Analysis Complete

Performance: 82/100 ✅
Quality: 90/100 ✅

💡 3 improvements identified

📄 Reports Generated:
- Markdown: .ai/feedback/2025-11-15-1600-bugfix-implementation.md
- JSON: .ai/feedback/2025-11-15-1600-bugfix-implementation.json

🧠 Knowledge Base Updated
```

## Best Practices

### ✅ DO

- **Provide feedback regularly** - After each significant workflow
- **Be specific** - Mention specific commands, agents, or steps
- **Rate honestly** - Honest feedback drives real improvements
- **Use interactive mode** - Provides richer, more actionable insights
- **Review feedback reports** - Check generated reports for accuracy

### ❌ DON'T

- **Skip feedback** - Feedback drives continuous improvement
- **Provide vague comments** - "It was fine" doesn't help
- **Only provide negative feedback** - Highlight successes too
- **Ignore recommendations** - Review and consider AI suggestions

## Error Handling

### No Recent Workflow Detected

```plaintext
⚠️  No recent workflow detected.

Please specify a workflow using:
- --command=<command-name>
- --pr=<pr-number>

Or run feedback immediately after completing a workflow.
```

### Git History Unavailable

```plaintext
❌ Cannot access git history or repository metadata.

Ensure you are in a git repository and have appropriate permissions.
```

### PR Not Found

```plaintext
❌ Pull request #123 not found.

Please verify the PR number and repository access.
```

## Performance Considerations

- **Fast feedback collection** - Basic feedback in < 30 seconds
- **Detailed analysis** - With `--metrics`, may take 1-2 minutes
- **Interactive mode** - Depends on user response time
- **Export operations** - Large JSON exports may take a few seconds

## Document Generation

**This command does NOT generate files.** All output is displayed in the terminal.

## Command Output Summary

Print the following summary at command completion:

**For complete feedback:**

```markdown
## ✅ Feedback Collected

**Workflow**: [workflow-name]
**Satisfaction**: [X]/10
**Duration**: [X] minutes

### Performance Metrics
| Metric          | Score    |
| --------------- | -------- |
| Time Efficiency | [XX]/100 |
| Error Rate      | [X]%     |
| Completion Rate | [XX]%    |

### Quality Metrics
| Metric         | Score    |
| -------------- | -------- |
| Code Quality   | [XX]/100 |
| Test Quality   | [XX]/100 |
| Review Quality | [XX]/100 |

### Key Insights
- [Insight 1]
- [Insight 2]

### Recommendations
1. **[Category]**: [Recommendation] (Impact: [High/Med/Low])
2. **[Category]**: [Recommendation] (Impact: [High/Med/Low])

### Next Step
→ `/fetch-task` for next task
→ Project complete! 🎉 (if all tasks done)
```

**For quick feedback:**

```markdown
## ✅ Quick Feedback Recorded

**Workflow**: [workflow-name]
**Satisfaction**: [X]/10

### Summary
[Brief feedback captured]

### Document Generated
→ `.ai/feedback/[timestamp]-[workflow].md`

### Next Step
→ `/fetch-task` for next task
```
