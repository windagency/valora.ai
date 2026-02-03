---
id: review.generate-commit-insights
version: 1.0.0
category: review
experimental: true
name: Generate Commit Insights
description: AI-powered quality analysis and recommendations for commits
tags:
  - quality-analysis
  - insights
  - recommendations
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-change-scope
inputs:
  - name: change_summary
    description: Summary of changes from scope analysis
    type: string
    required: true
  - name: changed_files
    description: List of changed files with diffs
    type: array
    required: true
  - name: breaking_changes
    description: Breaking changes detected
    type: boolean
    required: true
outputs:
  - quality_score
  - impact_analysis
  - security_issues
  - recommendations
tokens:
  avg: 5000
  max: 10000
  min: 3000
---

# Generate Commit Insights

## Objective

Provide AI-powered quality insights, impact analysis, security scanning, and recommendations for the commit.

## Instructions

### Step 1: Quality Scoring

Evaluate commit quality on 0-10 scale:

**Criteria**:

1. **Message Quality** (if message provided):
   - Follows Conventional Commits format
   - Clear and descriptive
   - Appropriate length
   - Includes context

2. **Code Quality**:
   - Changes are focused and atomic
   - No obvious bugs or issues
   - Consistent with codebase style
   - Appropriate error handling

3. **Testing**:
   - Tests added for new features
   - Tests updated for bug fixes
   - Test coverage adequate

4. **Documentation**:
   - Code comments where needed
   - README updated if applicable
   - API docs updated if applicable

**Scoring**:
```typescript
quality_score = 10.0;

// Message penalties (if message provided)
if (!follows_conventional_commits) quality_score -= 2.0;
if (message_too_vague) quality_score -= 1.0;
if (message_too_long) quality_score -= 0.5;

// Code penalties
if (obvious_bugs_detected) quality_score -= 3.0;
if (missing_error_handling) quality_score -= 1.0;
if (inconsistent_style) quality_score -= 0.5;

// Testing penalties
if (new_feature_without_tests) quality_score -= 2.0;
if (bugfix_without_test) quality_score -= 1.5;

// Documentation penalties
if (public_api_without_docs) quality_score -= 1.0;
if (complex_logic_without_comments) quality_score -= 0.5;
```

### Step 2: Impact Analysis

Analyze potential impact of changes:

**Dimensions**:

1. **Breaking Changes**:
   - Detected: Yes/No
   - Affected services/clients
   - Migration complexity

2. **Affected Services**:
   - Internal services that depend on changed code
   - External APIs affected
   - Downstream impact

3. **Test Coverage Impact**:
   - Are new changes tested?
   - Test gaps identified
   - Coverage percentage change

4. **Performance Impact**:
   - Algorithm complexity changes
   - Database query changes
   - Caching impact
   - Network call changes

5. **Security Impact**:
   - Authentication/authorization changes
   - Data validation changes
   - Secrets exposure risk
   - SQL injection risk
   - XSS risk

**Analysis**:
```typescript
impact_analysis = {
  breaking_changes: detected_breaking_changes,
  affected_services: identify_dependent_services(),
  test_coverage_impact: analyze_test_coverage(),
  performance_impact: assess_performance_changes(),
  security_impact: scan_security_implications()
};
```

### Step 3: Security Scanning

Scan for security issues:

**Checks**:

1. **Secrets Detection**:
   - API keys in code
   - Passwords hardcoded
   - Tokens exposed
   - Private keys
   - Connection strings

**Patterns**:
```regex
- API_KEY.*=.*[A-Za-z0-9]{20,}
- password.*=.*['"]\w+['"]
- token.*=.*[A-Za-z0-9-_]{20,}
- private_key.*=
- mongodb://.*:.*@
```

2. **Suspicious Patterns**:
   - Large binary files (> 1MB)
   - Unusual file extensions (.exe, .dmg, .so)
   - eval() or exec() usage
   - Unsafe deserialization
   - SQL string concatenation

3. **Vulnerability Patterns**:
   - SQL injection risks
   - XSS vulnerabilities
   - CSRF issues
   - Insecure random generators
   - Weak cryptography

**Output**:
```typescript
security_issues = [
  {
    severity: "critical" | "high" | "medium" | "low",
    type: "secrets" | "vulnerability" | "suspicious",
    description: "API key exposed in configuration file",
    file: "src/config/api.ts",
    line: 42,
    recommendation: "Move to environment variable"
  }
];
```

### Step 4: Pattern Detection

Identify commit anti-patterns:

**Anti-patterns**:

1. **Mixed Concerns**:
   - Feature + refactor in same commit
   - Multiple unrelated changes
   - Fix + new feature together

2. **Missing Tests**:
   - New public API without tests
   - Bug fix without regression test
   - Refactor without test coverage

3. **Incomplete Implementation**:
   - TODO comments
   - Console.log/debugger statements
   - Commented-out code
   - Dead code

4. **Poor Commit Hygiene**:
   - Very large commits (> 1000 LOC)
   - Generated files committed
   - Build artifacts committed
   - .env files committed

### Step 5: Generate Recommendations

Provide actionable recommendations:

**Categories**:

1. **Splitting Strategy**:
   - "Consider splitting into 2 commits: auth changes and UI updates"
   - "Separate schema migration from code changes"

2. **Testing Improvements**:
   - "Add integration tests for OAuth flow"
   - "Add edge case tests for null handling"

3. **Documentation Needs**:
   - "Document breaking changes in commit body"
   - "Add migration guide for API consumers"
   - "Update API documentation"

4. **Security Improvements**:
   - "Remove hardcoded API key, use environment variable"
   - "Add input validation for user-provided data"

5. **Code Quality**:
   - "Add error handling for network failures"
   - "Extract complex logic into separate function"
   - "Add code comments for algorithm explanation"

## Output Format

```json
{
  "quality_score": 8.5,
  "quality_breakdown": {
    "message_quality": 9.0,
    "code_quality": 8.0,
    "testing": 7.0,
    "documentation": 9.0
  },
  "impact_analysis": {
    "breaking_changes": true,
    "affected_services": ["api-gateway", "mobile-app", "web-app"],
    "breaking_change_details": [
      {
        "area": "API",
        "change": "Authentication endpoint signature changed",
        "impact": "All API consumers must update"
      }
    ],
    "test_coverage_impact": "Missing tests for token rotation edge cases",
    "performance_impact": "Low - minimal performance change",
    "security_impact": "Medium - changes to authentication logic"
  },
  "security_issues": [
    {
      "severity": "medium",
      "type": "vulnerability",
      "description": "New authentication logic lacks rate limiting",
      "file": "src/auth/login.ts",
      "recommendation": "Add rate limiting to prevent brute force attacks"
    }
  ],
  "anti_patterns": [
    {
      "pattern": "missing_tests",
      "description": "New OAuth flow lacks integration tests",
      "severity": "medium"
    }
  ],
  "recommendations": [
    {
      "category": "testing",
      "priority": "high",
      "recommendation": "Add integration tests for token rotation scenario"
    },
    {
      "category": "documentation",
      "priority": "high",
      "recommendation": "Document breaking changes and migration path in commit body"
    },
    {
      "category": "security",
      "priority": "medium",
      "recommendation": "Add rate limiting to login endpoint"
    }
  ],
  "summary": "Good commit quality with clear breaking changes. Needs additional tests and security improvements."
}
```

## Success Criteria

- ✅ Quality score calculated objectively
- ✅ Impact analysis covers all dimensions
- ✅ Security scan completed
- ✅ Anti-patterns identified
- ✅ Actionable recommendations provided

## Rules

**DO**:
- ✅ Be specific in recommendations
- ✅ Prioritize security issues
- ✅ Flag breaking changes prominently
- ✅ Suggest concrete improvements

**DON'T**:
- ❌ Be overly critical - provide constructive feedback
- ❌ Miss security issues
- ❌ Provide vague recommendations
- ❌ Ignore breaking changes

