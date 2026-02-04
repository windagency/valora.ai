---
name: create-pr
description: Generate and submit pull requests with intelligent title/description generation, automated reviewer assignment, label management, and quality validation
experimental: true
argument-hint: '[--title="<custom-title>"] [--draft] [--base=<branch>] [--reviewers=<user1,user2>] [--labels=<label1,label2>] [--auto-assign] [--template=<name>] [--link-issues] [--require-checks] [--auto-merge] [--squash] [--no-push]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
  # MCP: GitHub for PR creation, commits, issues, branches
  - mcp_github
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    # Stage 1: Analyze Git Branch State
    - stage: context
      prompt: context.analyze-git-branch
      required: true
      inputs:
        base_branch_arg: $ARG_base
      outputs:
        - current_branch
        - base_branch
        - branch_name_convention
        - commits_ahead
        - commits_behind
    
    # Stage 2: Extract Ticket References (Conditional)
    - stage: context
      prompt: context.extract-ticket-references
      required: false
      conditional: $ARG_link_issues == true
      inputs:
        current_branch: $STAGE_context.current_branch
        commits_ahead: $STAGE_context.commits_ahead
      outputs:
        - related_issues
        - ticket_numbers
        - issue_titles
    
    # Stage 3: Analyze Commits for PR
    - stage: context
      prompt: context.analyze-commits-for-pr
      required: true
      inputs:
        current_branch: $STAGE_context.current_branch
        base_branch: $STAGE_context.base_branch
        commits_ahead: $STAGE_context.commits_ahead
      outputs:
        - commit_messages
        - change_summary
        - affected_files
        - change_types
        - breaking_changes
        - authors
    
    # Stage 4: Load PR Template (Conditional)
    - stage: context
      prompt: context.load-pr-template
      required: false
      conditional: $ARG_template != null
      inputs:
        template_name: $ARG_template
      outputs:
        - template_content
        - required_sections
        - checklist_items
    
    # Stage 5: Analyze Codebase Changes (Parallel)
    - stage: context
      prompt: context.analyze-codebase-changes
      required: true
      parallel: true
      inputs:
        affected_files: $STAGE_context.affected_files
        change_types: $STAGE_context.change_types
      outputs:
        - impact_areas
        - test_coverage_delta
        - complexity_metrics
        - dependencies_changed
    
    # Stage 6: Validate PR Readiness
    - stage: review
      prompt: review.validate-pr-readiness
      required: true
      inputs:
        change_summary: $STAGE_context.change_summary
        breaking_changes: $STAGE_context.breaking_changes
        test_coverage_delta: $STAGE_context.test_coverage_delta
        complexity_metrics: $STAGE_context.complexity_metrics
      outputs:
        - pr_ready
        - readiness_issues
        - quality_score
        - recommendations
    
    # Stage 7: Generate PR Title
    - stage: code
      prompt: code.generate-pr-title
      required: true
      inputs:
        custom_title: $ARG_title
        change_summary: $STAGE_context.change_summary
        change_types: $STAGE_context.change_types
        ticket_numbers: $STAGE_context.ticket_numbers
        branch_name_convention: $STAGE_context.branch_name_convention
      outputs:
        - pr_title
        - title_format
    
    # Stage 8: Generate PR Description
    - stage: code
      prompt: code.generate-pr-description
      required: true
      inputs:
        template_content: $STAGE_context.template_content
        change_summary: $STAGE_context.change_summary
        commit_messages: $STAGE_context.commit_messages
        affected_files: $STAGE_context.affected_files
        breaking_changes: $STAGE_context.breaking_changes
        related_issues: $STAGE_context.related_issues
        impact_areas: $STAGE_context.impact_areas
        test_coverage_delta: $STAGE_context.test_coverage_delta
        complexity_metrics: $STAGE_context.complexity_metrics
      outputs:
        - pr_description
        - description_sections
    
    # Stage 9: Determine Reviewers
    - stage: code
      prompt: code.determine-reviewers
      required: true
      inputs:
        reviewers_arg: $ARG_reviewers
        auto_assign: $ARG_auto_assign
        affected_files: $STAGE_context.affected_files
        impact_areas: $STAGE_context.impact_areas
        authors: $STAGE_context.authors
      outputs:
        - reviewers_list
        - reviewer_rationale
    
    # Stage 10: Determine Labels
    - stage: code
      prompt: code.determine-labels
      required: true
      inputs:
        labels_arg: $ARG_labels
        change_types: $STAGE_context.change_types
        impact_areas: $STAGE_context.impact_areas
        breaking_changes: $STAGE_context.breaking_changes
        complexity_metrics: $STAGE_context.complexity_metrics
      outputs:
        - labels_list
        - label_rationale
    
    # Stage 11: Push and Create PR
    - stage: code
      prompt: code.push-and-create-pr
      required: true
      inputs:
        current_branch: $STAGE_context.current_branch
        base_branch: $STAGE_context.base_branch
        pr_title: $STAGE_code.pr_title
        pr_description: $STAGE_code.pr_description
        reviewers_list: $STAGE_code.reviewers_list
        labels_list: $STAGE_code.labels_list
        draft: $ARG_draft
        no_push: $ARG_no_push
      outputs:
        - pr_url
        - pr_number
        - push_status
    
    # Stage 12: Validate PR Creation
    - stage: validation
      prompt: review.validate-pr-creation
      required: true
      inputs:
        pr_url: $STAGE_code.pr_url
        pr_number: $STAGE_code.pr_number
        require_checks: $ARG_require_checks
      outputs:
        - pr_status
        - validation_result
        - next_steps
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - timeout
      - error
---

# Pull Request Creation Command

## Role

Use the [agent] profile

## Goal

Generate and submit a comprehensive, well-structured pull request through a 12-stage pipeline:

1. **Context Gathering** (Stages 1-5): Analyze Git state, commits, templates, and codebase changes
2. **Validation** (Stage 6): Ensure PR meets quality standards before creation
3. **Content Generation** (Stages 7-10): Generate title, description, reviewers, and labels
4. **Submission** (Stage 11): Push branch and create PR
5. **Post-Creation** (Stage 12): Validate successful creation and provide next steps

The pipeline automatically handles conventional commits, CODEOWNERS, issue linking, and quality validation.

## Pipeline Overview

The command executes 12 sequential stages (with one parallel stage):

**Context Stages** (1-5):

- `context.analyze-git-branch`: Identify branch, base, commits ahead/behind
- `context.extract-ticket-references`: Parse issue/ticket references (conditional)
- `context.analyze-commits-for-pr`: Extract commit details, changes, breaking changes
- `context.load-pr-template`: Load repository PR template (conditional)
- `context.analyze-codebase-changes`: Deep analysis of impact and coverage (parallel)

**Review Stages** (6, 12):

- `review.validate-pr-readiness`: Quality checks before PR creation
- `review.validate-pr-creation`: Verify successful creation

**Code Stages** (7-11):

- `code.generate-pr-title`: Create concise, conventional title
- `code.generate-pr-description`: Generate comprehensive description
- `code.determine-reviewers`: Auto-assign based on CODEOWNERS/history
- `code.determine-labels`: Auto-detect labels from changes
- `code.push-and-create-pr`: Push and submit PR

Each stage produces outputs consumed by subsequent stages. See individual prompts for detailed instructions.

## Context

```plaintext
$ARGUMENTS
```

### Available Arguments

- `--title="<custom-title>"`: Override auto-generated title
- `--draft`: Create PR as draft
- `--base=<branch>`: Specify base branch (default: auto-detect)
- `--reviewers=<user1,user2>`: Manually assign reviewers
- `--labels=<label1,label2>`: Manually assign labels
- `--auto-assign`: Automatically assign reviewers based on CODEOWNERS
- `--template=<name>`: Use specific PR template
- `--link-issues`: Automatically link related issues
- `--require-checks`: Validate CI checks before finalizing
- `--auto-merge`: Enable auto-merge on approval
- `--squash`: Configure squash merge as preferred method
- `--no-push`: Skip pushing branch (for testing)

## Core Principles

**Quality First**:

- Validate PR readiness before creation (quality score ≥70%)
- Ensure proper test coverage for new features
- Document breaking changes with migration guides
- Follow conventional commit format
- Respect CODEOWNERS and team conventions

**Automation**:

- Auto-detect change types from commits
- Auto-assign reviewers based on file ownership
- Auto-apply labels based on impact analysis
- Auto-link related issues from commits/branches
- Auto-generate descriptive titles and descriptions

**Clarity**:

- Comprehensive PR descriptions with context
- Clear titles following `type(scope): description` format
- Rationale for reviewer assignments
- Quality metrics and recommendations
- Actionable next steps

## Success Criteria

- ✅ PR created with clear title and description
- ✅ Appropriate reviewers assigned (if `--auto-assign`)
- ✅ Relevant labels applied
- ✅ Related issues linked (if `--link-issues`)
- ✅ CI checks initiated
- ✅ Quality score ≥ 70/100
- ✅ No blocking readiness issues

## Workflow Integration

**Entry Point**: After implementation phase, before code review

**Exit Paths**:

- ✅ **Success**: PR created → Proceed to code review
- ⚠️ **Validation Warnings**: PR created with recommendations
- 🔴 **Validation Failure**: Address quality issues before PR creation

**Follows Template**: [Pull Request](../templates/PULL_REQUEST.md)

## Command Output Summary

Print the following summary at command completion:

**For successful PR creation:**

```markdown
## ✅ Pull Request Created

**PR Number**: #[number]
**URL**: [pr-url]
**Status**: [Draft | Ready for Review]

### PR Details
- **Title**: [pr-title]
- **Base**: [base-branch] ← [feature-branch]
- **Commits**: [N] commits

### Reviewers & Labels
- **Reviewers**: [assigned-reviewers]
- **Labels**: [applied-labels]

### Quality Score
- **Readiness**: [XX]/100
- **CI Status**: Pending

### PR Description Preview
> [First 2-3 lines of description]

### Next Step
→ Await code review and approval
→ `/feedback` after PR is merged
```

**For PR with warnings:**

```markdown
## ⚠️ Pull Request Created with Warnings

**PR Number**: #[number]
**URL**: [pr-url]
**Status**: Ready for Review (with notes)

### Warnings
- ⚠️ [Warning 1]
- ⚠️ [Warning 2]

### Recommendations
- [Recommendation 1]
- [Recommendation 2]

### Next Step
→ Review warnings before requesting reviews
→ Consider addressing recommendations
```

**For validation failure:**

```markdown
## ❌ Pull Request Not Created

**Reason**: Quality validation failed
**Readiness Score**: [XX]/100 (below 70% threshold)

### Blocking Issues
1. **[Issue]**: [Description]
2. **[Issue]**: [Description]

### Required Actions
- [Action to fix issue]

### Next Step
→ Address issues and re-run `/create-pr`
```
