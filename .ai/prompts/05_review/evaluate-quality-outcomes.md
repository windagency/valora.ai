---
id: review.evaluate-quality-outcomes
version: 1.0.0
category: review
experimental: true
name: Evaluate Quality Outcomes
description: Assess code quality, test quality, and review quality with scoring
tags:
  - quality-assessment
  - metrics
  - code-quality
  - test-quality
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.gather-git-metrics
inputs:
  - name: files_changed
    description: Files created/modified/deleted
    type: object
    required: true
  - name: test_coverage_delta
    description: Test coverage change
    type: object
    required: false
  - name: ci_status
    description: CI check status
    type: string
    required: true
  - name: review_comments_count
    description: Number of review comments
    type: number
    required: false
outputs:
  - code_quality_score
  - test_quality_score
  - review_quality_score
  - overall_quality_score
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Evaluate Quality Outcomes

## Objective

Assess the quality of produced artifacts across code, tests, and review dimensions.

## Instructions

**IMPORTANT: Infrastructure Exclusions**

VALORA evaluates the project being built, NOT its own infrastructure. Always exclude from quality evaluation:
- `.ai/` - VALORA infrastructure
- `.git/` - Git internal state
- `node_modules/` - Package dependencies

Target specific project directories (e.g., `src/`, `app/`, `lib/`) rather than the repository root.

### Step 1: Evaluate Code Quality (0-100)

**Factors (weighted):**

1. **Linter compliance (30%)**: Check for linting errors (on project source only)
   ```bash
   npm run lint --silent || eslint src --format json
   ```
   - 0 errors: 100%
   - 1-5 errors: 80%
   - 6-10 errors: 60%
   - >10 errors: 40%

2. **Type safety (25%)**: If TypeScript/typed language
   ```bash
   tsc --noEmit || check type coverage
   ```
   - 100% type coverage: 100%
   - 90-99%: 90%
   - 80-89%: 70%
   - <80%: 50%

3. **Code complexity (20%)**: Analyze changed files
   - Low average complexity (<5): 100%
   - Moderate (5-10): 80%
   - High (10-15): 60%
   - Very high (>15): 40%

4. **Security issues (15%)**: Run security scan if available
   - 0 issues: 100%
   - Low severity only: 80%
   - Any medium: 60%
   - High/critical: 0%

5. **Documentation (10%)**: Check for docs in changed files
   - All functions documented: 100%
   - Most documented: 80%
   - Some documented: 60%
   - None: 40%

**Calculate:** `code_quality_score = sum(factor × weight)`

### Step 2: Evaluate Test Quality (0-100)

**Factors (weighted):**

1. **Coverage (40%)**: From `test_coverage_delta`
   - ≥90%: 100%
   - 80-89%: 85%
   - 70-79%: 70%
   - 60-69%: 55%
   - <60%: 40%

2. **Coverage delta (20%)**: Improvement direction
   - Positive delta (improved): 100%
   - No change: 80%
   - Negative <5%: 60%
   - Negative ≥5%: 40%

3. **Test pass rate (25%)**: From CI status
   - All passed: 100%
   - 1-2 failures: 70%
   - >2 failures: 40%

4. **Test types (15%)**: Check for unit/integration/e2e
   - All 3 types: 100%
   - 2 types: 80%
   - 1 type: 60%
   - None: 0%

**Calculate:** `test_quality_score = sum(factor × weight)`

### Step 3: Evaluate Review Quality (0-100)

**Factors (weighted):**

1. **PR description (30%)**: Check PR description completeness
   - Complete (all sections): 100%
   - Most sections: 80%
   - Basic: 60%
   - Minimal: 40%

2. **Commit messages (30%)**: Conventional commit adherence
   - All follow convention: 100%
   - Most follow: 80%
   - Some follow: 60%
   - None follow: 40%

3. **Review engagement (20%)**: Comments and reviews
   - Appropriate comments: 100%
   - Few comments: 80%
   - No engagement: 60%

4. **CI checks (20%)**: All checks status
   - All passed: 100%
   - Some pending: 80%
   - Some failed: 50%
   - None configured: 70%

**Calculate:** `review_quality_score = sum(factor × weight)`

### Step 4: Calculate Overall Quality Score

```
overall_quality_score = (
  code_quality_score × 0.40 +
  test_quality_score × 0.35 +
  review_quality_score × 0.25
)
```

**Rating:**
- **90-100**: Excellent
- **80-89**: Good
- **70-79**: Acceptable
- **60-69**: Needs improvement
- **<60**: Poor

## Output Format

```json
{
  "code_quality_score": 88,
  "code_quality_details": {
    "linter_score": 95,
    "type_coverage": 89,
    "complexity_average": 4.2,
    "security_issues": 0,
    "documentation_completeness": 80
  },
  "test_quality_score": 82,
  "test_quality_details": {
    "coverage_unit": 85,
    "coverage_integration": 78,
    "coverage_e2e": 65,
    "coverage_delta": "+3.8%",
    "test_pass_rate": 100,
    "test_types_present": ["unit", "integration"]
  },
  "review_quality_score": 90,
  "review_quality_details": {
    "pr_description_completeness": 95,
    "commit_message_quality": 92,
    "review_engagement": 88,
    "ci_checks_status": "passed"
  },
  "overall_quality_score": 87,
  "overall_rating": "Good"
}
```

## Success Criteria

- ✅ Code quality scored (0-100)
- ✅ Test quality scored (0-100)
- ✅ Review quality scored (0-100)
- ✅ Overall quality calculated
- ✅ All scores justified with details

## Error Handling

- **Linter not configured**: Use manual assessment or skip
- **No test coverage**: Mark as 0% with note
- **No CI**: Adjust scoring weights
- **Cannot access files**: Use git metrics only

