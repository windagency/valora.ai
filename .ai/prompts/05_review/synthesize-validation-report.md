---
id: review.synthesize-validation-report
version: 1.0.0
category: review
experimental: true
name: Synthesize Validation Report
description: Aggregate all validation results into a comprehensive assertion report with pass/fail determination
tags:
  - validation
  - synthesis
  - reporting
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - asserter
dependencies:
  requires:
    - review.validate-completeness
    - review.validate-standards-compliance
    - review.validate-type-safety
    - review.validate-security
    - review.validate-architecture
inputs:
  - name: completeness
    description: Completeness validation results
    type: object
    required: true
  - name: standards
    description: Standards compliance results
    type: object
    required: true
  - name: type_safety
    description: Type safety validation results
    type: object
    required: true
  - name: security
    description: Security validation results
    type: object
    required: true
  - name: architecture
    description: Architecture validation results
    type: object
    required: true
  - name: accessibility
    description: Accessibility validation results (may be null if no frontend changes)
    type: object
    required: false
  - name: severity_filter
    description: Minimum severity to report (critical, high, all)
    type: string
    required: false
    default: critical
  - name: report_format
    description: Report format (structured, summary, detailed)
    type: string
    required: false
    default: structured
outputs:
  - validation_status
  - blocker_count
  - validation_report
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Synthesize Validation Report

## Objective

Aggregate all validation results into a comprehensive, actionable assertion report with clear pass/fail status and prioritized remediation guidance.

## Synthesis Process

### Step 1: Aggregate Validation Results

Collect results from all validation dimensions:

1. **Completeness** - Requirements coverage
2. **Standards Compliance** - Linting and formatting
3. **Type Safety** - Type errors and coverage
4. **Security** - Vulnerabilities and secrets
5. **Architecture** - Pattern adherence and boundaries
6. **Accessibility** - WCAG compliance (if applicable)

### Step 2: Categorize by Severity

Group all issues by severity:

**Critical (Blockers)**:
- Security vulnerabilities (CVSS ≥ 7.0)
- Build failures
- Type errors in strict mode
- WCAG Level A violations
- Major architectural violations
- Hard-coded secrets
- >50% acceptance criteria unmet

**High**:
- Linting errors (not warnings)
- API contract violations
- Circular dependencies
- SQL injection patterns

**Medium**:
- WCAG Level AA violations (if Level A met)
- Code complexity exceeds thresholds
- Missing documentation on public APIs
- Moderate coupling issues

**Low**:
- Linting warnings
- Minor naming inconsistencies
- WCAG Level AAA violations
- Optimization opportunities

### Step 3: Apply Severity Filter

Based on `severity_filter` argument:

- **critical**: Only report critical issues
- **high**: Report critical and high issues
- **all**: Report all issues

### Step 4: Calculate Overall Status

Determine final verdict:

**PASS ✅**:
- Zero critical issues
- Zero high issues (if strict mode)
- All acceptance criteria met
- All quality gates passed

**BLOCKED ❌**:
- One or more critical issues
- Multiple high issues
- <50% acceptance criteria met
- Build fails

**WARN ⚠️**:
- No critical issues
- Some high or medium issues
- Can proceed with caution
- Issues should be addressed post-QA

### Step 5: Generate Recommendations

Provide actionable next steps:

1. **Prioritized remediation list** (critical → high → medium → low)
2. **Estimated effort** (hours or complexity)
3. **Required skills** (backend, frontend, security, etc.)
4. **Documentation links** (OWASP, WCAG, MDN, etc.)

### Step 6: Format Report

Based on `report_format` argument:

**structured** (default):
- Full report with all dimensions
- Organized by severity
- Includes code snippets and locations

**summary**:
- Executive summary only
- Pass/fail status
- Key metrics
- Blocker count

**detailed**:
- Comprehensive report
- All issues with full context
- Code snippets for every violation
- Step-by-step remediation
- References and resources

## Output Format

### Structured Report (Default)

```markdown
# ASSERTION REPORT: [Feature/Task Title]

**Generated**: [Timestamp]
**Branch**: [Branch name]
**Commit**: [Commit SHA]

## VALIDATION SUMMARY

**Status**: ✅ PASS | ❌ BLOCKED | ⚠️ WARN
**Critical Issues**: N
**High Issues**: N
**Medium Issues**: N
**Warnings**: N

**Recommendation**: [Advance to QA | Return to implementation | Proceed with caution]

## VALIDATION DIMENSIONS

| Dimension            | Status | Issues |
| -------------------- | ------ | ------ |
| Completeness         | ✅/❌/⚠️ | N critical, N high... |
| Standards Compliance | ✅/❌/⚠️ | N linting errors... |
| Type Safety          | ✅/❌/⚠️ | N type errors... |
| Security             | ✅/❌/⚠️ | N vulnerabilities... |
| Architecture         | ✅/❌/⚠️ | N violations... |
| Accessibility        | ✅/❌/⚠️ | N WCAG violations... |

## CRITICAL BLOCKERS (Must Resolve)

[If any exist, enumerate with full details:]

### 1. [Issue Category] (SEVERITY)
- **Location**: `file/path:line`
- **Issue**: [Description]
- **Rule/Standard**: [Identifier]
- **Impact**: [Why this is critical]
- **Fix**: [Specific remediation steps]
- **Reference**: [Documentation link]

[Repeat for each critical blocker]

## HIGH PRIORITY ISSUES

[Similar structure for high severity issues]

## MEDIUM & LOW PRIORITY ISSUES

[Grouped by category]

## QUALITY METRICS

- **Lines Changed**: +N / -N
- **Completeness**: N% (M/P criteria met)
- **Code Coverage**: N% (threshold: N%) ✅/⚠️
- **Type Coverage**: N%
- **Cyclomatic Complexity**: Max N (threshold: N) ✅/⚠️
- **Code Duplication**: N% (threshold: N%) ✅/⚠️
- **Security Score**: No critical vulnerabilities ✅ | N vulnerabilities ❌
- **Accessibility Score**: N/100 (WCAG Level AA) ✅/⚠️
- **Technical Debt**: +N hours

## REQUIREMENTS TRACEABILITY

| Requirement | Acceptance Criteria | Status | Validation |
| ----------- | ------------------- | ------ | ---------- |
| US-XXX      | [Criterion 1]       | ✅/❌/⚠️ | ✅/❌/⚠️ |
| US-XXX      | [Criterion 2]       | ✅/❌/⚠️ | ✅/❌/⚠️ |

**Requirements Coverage**: N% (M/P requirements met)

## NEXT STEPS

**If BLOCKED:**
1. [Prioritized list of critical remediations]
2. [Estimated effort and skills needed]
3. [Resources and documentation links]

**If PASS:**
1. Proceed to `/test` command
2. [Any advisory items to address post-testing]

## REPRODUCIBILITY

**Validation Commands**:
```bash
# Run locally to reproduce results
npm run lint
npm run type-check
npm run build
npm audit
# [Any other validation commands]
```

## RESOURCES

- [Link to coding standards]
- [Link to security guidelines]
- [Link to accessibility requirements]
- [Link to architectural documentation]

---
```

### Summary Report

```markdown
# VALIDATION SUMMARY

**Status**: ✅ PASS | ❌ BLOCKED | ⚠️ WARN
**Critical Issues**: N
**Recommendation**: [Advance to QA | Return to implementation]

**Blocking Issues**:
1. [Issue 1]
2. [Issue 2]

**Estimated Remediation**: N hours
```

### Detailed Report

Full structured report with additional sections:
- **Code Snippets**: Show actual code for every violation
- **Before/After Examples**: Demonstrate correct implementation
- **Step-by-Step Remediation**: Detailed fix instructions
- **Related Issues**: Link related violations together
- **Historical Context**: Compare to baseline metrics

## Success Criteria

- ✅ All validation results aggregated
- ✅ Issues categorized by severity
- ✅ Overall status determined (PASS/BLOCKED/WARN)
- ✅ Blockers clearly enumerated
- ✅ Recommendations prioritized
- ✅ Report formatted per specification
- ✅ Reproducibility commands included
- ✅ Resources and references provided

## Rules

**Status Determination**:
- PASS: Zero critical, zero high (or per threshold)
- BLOCKED: Any critical issues
- WARN: High or medium issues, no critical

**Severity Escalation**:
- Critical security issues → escalate to security team
- Major architectural violations → escalate to lead/architect
- >50% assertion failures → escalate to lead

**Report Quality**:
- Every blocker includes location, explanation, remediation
- Commands are executable (copy-paste ready)
- References are valid links
- Metrics are quantified, not vague

**Handoff**:
- If PASS → proceed to `/test`
- If BLOCKED → return to `/implement` with remediation plan
- If WARN → team decision, document risks

