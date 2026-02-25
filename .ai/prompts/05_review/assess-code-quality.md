---
id: review.assess-code-quality
version: 1.0.0
category: review
experimental: true
name: Assess Code Quality
description: Orchestrate comprehensive code quality assessment across all dimensions
tags:
  - code-review
  - quality-assessment
  - orchestration
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-changes-for-review
    - review.validate-security
    - review.validate-architecture
    - review.validate-performance
    - review.validate-maintainability
    - review.validate-standards-compliance
    - review.validate-type-safety
inputs:
  - name: scope
    description: Review scope from arguments
    type: string
    required: true
  - name: severity
    description: Minimum severity filter
    type: string
    required: false
    default: "low"
  - name: focus
    description: Review focus area
    type: string
    required: false
    default: "all"
  - name: changed_files
    description: Files changed from context stage
    type: array
    required: true
  - name: review_focus_areas
    description: Prioritized focus areas from context
    type: array
    required: true
outputs:
  - quality_score
  - issues_found
  - security_concerns
  - blocking_issues
  - review_decision
tokens:
  avg: 8000
  max: 15000
  min: 4000
---

# Assess Code Quality

## Objective

Orchestrate comprehensive code quality assessment by coordinating specialized validation prompts and synthesizing results into actionable quality report.

## Context

This is the **main orchestration prompt** for code review. It delegates to specialized validation prompts based on focus areas and severity, then synthesizes results.

## Instructions

### Step 1: Determine Review Strategy

Based on inputs, decide which validations to run:

**If focus = "security"**:
- **Required**: `validate-security` (critical priority)
- Optional: `validate-architecture`, `validate-type-safety`
- Skip: `validate-performance`, `validate-maintainability`

**If focus = "performance"**:
- **Required**: `validate-performance` (critical priority)
- Optional: `validate-architecture`, `validate-maintainability`
- Skip: `validate-security` (unless security-sensitive files)

**If focus = "maintainability"**:
- **Required**: `validate-maintainability` (critical priority)
- **Required**: `validate-standards-compliance`
- Optional: `validate-architecture`, `validate-type-safety`

**If focus = "all"** (default):
- Run ALL validations in parallel:
  1. `validate-security`
  2. `validate-architecture`
  3. `validate-performance`
  4. `validate-maintainability`
  5. `validate-standards-compliance`
  6. `validate-type-safety`

**Severity-based filtering**:
- Severity filter applies AFTER validation, not during
- All validations run, but report only includes issues ≥ severity threshold

### Step 2: Execute Validations in Parallel

**For each required validation**:

Call the validation prompt with appropriate inputs:

```json
{
  "changed_files": $STAGE_context.changed_files,
  "review_focus": $STAGE_context.review_focus_areas,
  "severity": $ARG_severity
}
```

**Note**: Validations run independently and in parallel. Each produces a structured output.

### Step 3: Aggregate Results

Collect outputs from all validations:

```typescript
interface AggregatedResults {
  security: ValidationOutput;
  architecture: ValidationOutput;
  performance: ValidationOutput;
  maintainability: ValidationOutput;
  standards: ValidationOutput;
  typeSafety: ValidationOutput;
}
```

**For each validation output**:
- Extract issues array
- Extract status (pass/fail/warn)
- Extract severity counts (critical/high/medium/low)

### Step 4: Calculate Quality Score

**Quality Score Formula** (0-100):

```plaintext
Base score = 100

Deductions:
- Critical issue: -10 points each
- High issue: -5 points each
- Medium issue: -2 points each
- Low issue: -0.5 points each

Minimum score = 0
```

**Quality Grade**:
- **90-100**: Excellent (A)
- **80-89**: Good (B)
- **70-79**: Acceptable (C)
- **60-69**: Needs Improvement (D)
- **0-59**: Poor (F)

### Step 5: Identify Blocking Issues

**Blocking criteria**:

Issues that **MUST** be fixed before merge:

1. **Security**:
   - Any critical security vulnerability (CVSS ≥ 9.0)
   - Any high security vulnerability (CVSS ≥ 7.0)
   - Hard-coded secrets found
   - SQL injection or XSS vulnerabilities

2. **Architecture**:
   - Critical circular dependencies
   - Major layer violations (UI → Data direct access)
   - Breaking changes without migration path

3. **Type Safety**:
   - Any type errors in strict mode
   - Unsafe type assertions without guards

4. **Standards**:
   - Linting errors (not warnings)
   - Build-breaking issues

5. **Performance** (if critical):
   - N+1 query problems
   - Memory leaks in production code
   - Unbounded result sets in production APIs

6. **Maintainability** (if severe):
   - Cyclomatic complexity > 20
   - Critical business logic without tests

**Non-blocking** (warnings):
- Medium/low severity issues
- Code smells
- Minor optimizations
- Style inconsistencies

### Step 6: Make Review Decision

Based on blocking issues and quality score:

**APPROVE ✅**:
- No blocking issues
- Quality score ≥ 70
- All critical validations passed

**REQUEST CHANGES ⚠️**:
- 1-5 blocking issues (fixable)
- Quality score 50-69
- Issues can be addressed without redesign

**BLOCK ❌**:
- 6+ blocking issues
- Quality score < 50
- Critical security vulnerabilities
- Fundamental architectural violations
- Requires significant rework

### Step 7: Prioritize Issues

Group all issues by priority for remediation:

**Priority 1 (Fix Now)**:
- All critical severity
- All blocking issues
- Security vulnerabilities

**Priority 2 (Fix Before Merge)**:
- High severity non-blocking
- Architectural improvements
- Type safety issues

**Priority 3 (Address Soon)**:
- Medium severity
- Code smells
- Technical debt items

**Priority 4 (Consider Later)**:
- Low severity
- Optimizations
- Nice-to-haves

### Step 8: Generate Recommendations

For each issue category, provide:

1. **What's wrong**: Clear description
2. **Why it matters**: Impact explanation
3. **How to fix**: Concrete code examples
4. **Effort estimate**: Low/Medium/High
5. **Resources**: Links to docs, standards, examples

**Example**:

```markdown
### Issue: N+1 Query in Order Service

**What**: Database query executed inside loop (lines 45-52)

**Why**: Performance degrades linearly with data volume. 
1000 users = 1000 separate queries = 5-10 seconds.

**Fix**:
Replace:
// BAD const orders = []; for (const user of users) { const userOrders = await db.orders.find({ userId: user.id }); orders.push(...userOrders); }
With:
// GOOD const userIds = users.map(u => u.id); const orders = await db.orders.find({ userId: { $in: userIds } });
**Effort**: Low (5 minutes)
**Reference**: [N+1 Query Problem](https://example.com/n-plus-one)
```

## Output Format

```json
{
  "quality_score": 72,
  "quality_grade": "C",
  "issues_found": {
    "total": 23,
    "by_severity": {
      "critical": 1,
      "high": 4,
      "medium": 12,
      "low": 6
    },
    "by_category": {
      "security": 2,
      "architecture": 3,
      "performance": 5,
      "maintainability": 8,
      "standards": 4,
      "type_safety": 1
    }
  },
  "security_concerns": {
    "critical_count": 1,
    "high_count": 1,
    "vulnerabilities": [
      {
        "severity": "critical",
        "type": "sql_injection",
        "location": "src/api/users.ts:67",
        "cve": "CWE-89",
        "description": "User input concatenated into SQL query",
        "recommendation": "Use parameterized queries"
      }
    ]
  },
  "blocking_issues": [
    {
      "id": "SEC-001",
      "category": "security",
      "severity": "critical",
      "location": "src/api/users.ts:67",
      "description": "SQL injection vulnerability",
      "must_fix_reason": "Critical security risk, exploitable in production"
    },
    {
      "id": "ARCH-001",
      "category": "architecture",
      "severity": "high",
      "location": "src/components/UserList.tsx:45",
      "description": "UI component directly imports database repository",
      "must_fix_reason": "Violates layer separation, makes testing impossible"
    }
  ],
  "review_decision": "REQUEST_CHANGES",
  "review_decision_reasoning": "2 blocking issues must be resolved. SQL injection is critical security risk. Layer violation prevents proper testing. Quality score of 72 is acceptable after fixes.",
  "validation_results": {
    "security": {
      "status": "fail",
      "critical_issues": 1,
      "blocking": true
    },
    "architecture": {
      "status": "fail",
      "critical_issues": 0,
      "high_issues": 1,
      "blocking": true
    },
    "performance": {
      "status": "warn",
      "high_issues": 3,
      "blocking": false
    },
    "maintainability": {
      "status": "warn",
      "medium_issues": 8,
      "blocking": false
    },
    "standards": {
      "status": "pass",
      "warnings": 4,
      "blocking": false
    },
    "type_safety": {
      "status": "pass",
      "blocking": false
    }
  },
  "positive_observations": [
    "Good test coverage for new features (85%)",
    "Clear documentation for API changes",
    "Consistent code style and formatting",
    "Proper error handling in critical paths"
  ],
  "recommendations_by_priority": {
    "priority_1": [
      {
        "id": "SEC-001",
        "action": "Fix SQL injection in users API",
        "effort": "low",
        "files": ["src/api/users.ts"]
      },
      {
        "id": "ARCH-001",
        "action": "Remove direct database import from UI component",
        "effort": "medium",
        "files": ["src/components/UserList.tsx"]
      }
    ],
    "priority_2": [
      {
        "id": "PERF-001",
        "action": "Fix N+1 query in order service",
        "effort": "low",
        "files": ["src/services/order.service.ts"]
      }
    ],
    "priority_3": [
      {
        "id": "MAINT-001",
        "action": "Refactor processOrder function (complexity 15)",
        "effort": "medium",
        "files": ["src/services/order.service.ts"]
      }
    ]
  },
  "summary": "Code review identified 2 blocking issues requiring immediate attention. Critical SQL injection vulnerability must be fixed before merge. Once blocking issues are resolved, code will be ready for functional review. Good test coverage and documentation are positive aspects."
}
```

## Success Criteria

- ✅ All relevant validations executed
- ✅ Results aggregated from all validation prompts
- ✅ Quality score calculated objectively
- ✅ Blocking issues clearly identified
- ✅ Review decision made (APPROVE/REQUEST_CHANGES/BLOCK)
- ✅ Concrete recommendations prioritized
- ✅ Positive observations noted
- ✅ Next steps clearly defined

## Rules

**Decision Making**:

- **APPROVE**: Only if no blocking issues and score ≥ 70
- **REQUEST CHANGES**: 1-5 blocking issues, fixable
- **BLOCK**: 6+ blocking issues OR critical security/architecture

**Severity Thresholds**:

- **Critical**: Security vulnerabilities, data corruption risks, breaking changes
- **High**: Major bugs, architectural violations, type errors
- **Medium**: Code smells, performance issues, maintainability concerns
- **Low**: Style, minor optimizations, documentation gaps

**Never**:

- ❌ Approve code with critical security issues
- ❌ Approve code with type errors (in strict mode)
- ❌ Skip validations without reason
- ❌ Subjective decisions without objective criteria

**Always**:

- ✅ Run validations in parallel for speed
- ✅ Provide specific file:line references
- ✅ Include code examples in recommendations
- ✅ Balance thoroughness with practicality
- ✅ Note positive aspects, not just issues

## Notes

- This prompt orchestrates other prompts; it doesn't do detailed analysis itself
- Validation prompts are domain experts; this prompt is the coordinator
- Quality score is objective and repeatable
- Blocking criteria are non-negotiable for production safety
- Focus on actionability: every issue must have a clear fix path

