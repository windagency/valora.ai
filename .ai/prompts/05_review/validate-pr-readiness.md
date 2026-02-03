---
id: review.validate-pr-readiness
version: 1.0.0
category: review
experimental: true
name: Validate PR Readiness
description: Validate that the PR is ready for creation based on quality checks
tags:
  - validation
  - quality-assurance
  - pr-readiness
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-commits-for-pr
    - context.analyze-codebase-changes
inputs:
  - name: change_summary
    description: Summary of changes
    type: object
    required: true
  - name: breaking_changes
    description: Breaking changes detected
    type: array
    required: true
  - name: test_coverage_delta
    description: Test coverage analysis
    type: object
    required: true
  - name: complexity_metrics
    description: Change complexity metrics
    type: object
    required: true
outputs:
  - pr_ready
  - readiness_issues
  - quality_score
  - recommendations
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Validate PR Readiness

## Objective

Validate that the pull request meets quality standards and is ready for submission.

## Validation Criteria

### 1. Git State Validation

**Checks**:

- [ ] No uncommitted changes (`git status --porcelain` returns empty)
- [ ] At least 1 commit ahead of base branch
- [ ] No merge conflicts with base branch
- [ ] Branch is pushed to remote (or will be pushed)

**Scoring**: Pass = 25 points, Fail = 0 points

---

### 2. Commit Quality

**Checks**:

- [ ] At least 70% of commits follow conventional commit format
- [ ] Commit messages are descriptive (>10 characters)
- [ ] No "WIP", "tmp", "debug" commits
- [ ] Breaking changes are properly marked

**Scoring**:

- 100% conventional: 25 points
- 70-99% conventional: 20 points
- 50-69% conventional: 15 points
- <50% conventional: 10 points

---

### 3. Test Coverage

**Checks**:

- [ ] New features have tests (if `change_types` includes "feat")
- [ ] Bug fixes have tests (if `change_types` includes "fix")
- [ ] Test coverage delta is positive or neutral
- [ ] Critical/security files are tested

**Scoring**:

- All covered: 25 points
- Mostly covered (>70%): 20 points
- Partially covered (50-70%): 15 points
- Poorly covered (<50%): 10 points

---

### 4. Documentation

**Checks**:

- [ ] Breaking changes are documented
- [ ] Public API changes have documentation
- [ ] README updated (if applicable)
- [ ] Migration guide provided (for breaking changes)

**Scoring**:

- Fully documented: 25 points
- Mostly documented: 20 points
- Partially documented: 15 points
- Not documented: 10 points

---

### 5. Change Complexity

**Assessment**:

- Complexity score from `complexity_metrics`
- Lower complexity = higher score

**Scoring**:

- Low complexity (0-30): 25 points
- Medium complexity (31-60): 20 points
- High complexity (61-85): 15 points
- Very high (86-100): 10 points

---

## Quality Score Calculation

```plaintext
Total Score = (
  Git State (0-25) +
  Commit Quality (0-25) +
  Test Coverage (0-25) +
  Documentation (0-25) +
  Complexity Bonus (0-25)
) / 125 * 100

Result: 0-100%
```

## Decision Logic

### Score ≥ 80%: ✅ Ready

**Status**: Ready for PR creation

**Message**:

```plaintext
✅ PR is ready for creation

Quality Score: XX/100

All quality checks passed. Proceed with PR creation.
```

---

### Score 60-79%: ⚠️ Ready with Warnings

**Status**: Can proceed but with recommendations

**Message**:

```plaintext
⚠️ PR can be created but has some issues

Quality Score: XX/100

Issues:
- [List specific issues]

Recommendations:
- [List specific recommendations]

You can proceed, but consider addressing these issues.
```

---

### Score <60%: 🔴 Not Ready

**Status**: Should not create PR yet

**Message**:

```plaintext
🔴 PR is not ready for creation

Quality Score: XX/100

Blocking Issues:
- [List blocking issues]

Please address these issues before creating the PR:
1. [Action 1]
2. [Action 2]
```

---

## Output Format

```json
{
  "pr_ready": true,
  "quality_score": 87,
  "status": "ready",
  "validation_results": {
    "git_state": {
      "score": 25,
      "passed": true,
      "issues": []
    },
    "commit_quality": {
      "score": 23,
      "passed": true,
      "issues": ["2 commits don't follow conventional format"],
      "conventional_percentage": 85
    },
    "test_coverage": {
      "score": 20,
      "passed": true,
      "issues": ["2 files lack test coverage"],
      "coverage_percentage": 80
    },
    "documentation": {
      "score": 20,
      "passed": true,
      "issues": ["API docs could be more detailed"]
    },
    "complexity": {
      "score": 20,
      "passed": true,
      "complexity_level": "medium",
      "review_time_estimate": "2-3 hours"
    }
  },
  "readiness_issues": [
    {
      "category": "test_coverage",
      "severity": "medium",
      "description": "2 files lack test coverage",
      "affected_files": ["src/auth/token-refresh.ts", "src/utils/crypto.ts"],
      "blocking": false
    }
  ],
  "recommendations": [
    "Add tests for token-refresh.ts",
    "Add tests for crypto.ts (security-sensitive)",
    "Update API documentation for /auth/login endpoint"
  ],
  "blocking_issues": [],
  "can_proceed": true
}
```

## Success Criteria

- ✅ All validation checks executed
- ✅ Quality score calculated
- ✅ Readiness decision made (ready/warning/not ready)
- ✅ Specific issues identified
- ✅ Actionable recommendations provided

## Special Cases

### High-Risk Changes

If changes involve:

- Security-sensitive code
- Database migrations
- Breaking API changes
- Infrastructure changes

**Additional validation**:

- Require higher quality score (≥80%)
- Require test coverage (≥80%)
- Require documentation
- Recommend security review

### Draft PRs

If creating as draft (`--draft` flag):

- Lower quality threshold (≥50%)
- Allow missing tests
- Allow WIP commits
- Skip some checks

### Hotfixes

If branch name indicates hotfix:

- Fast-track validation
- Require tests for bug fix
- Allow lower documentation standards
- Require clear incident reference

