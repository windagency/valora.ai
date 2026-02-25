---
id: review.validate-security
version: 1.0.0
category: review
experimental: true
name: Validate Security
description: Scan for security vulnerabilities, secrets, and OWASP compliance violations
tags:
  - validation
  - security
  - owasp
  - vulnerabilities
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - asserter
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.gather-validation-context
inputs:
  - name: quality_gates
    description: Security policies and compliance requirements
    type: object
    required: true
outputs:
  - security_vulnerabilities
  - secrets_found
  - owasp_violations
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Validate Security

## Objective

Execute security scanning tools to detect vulnerabilities, hard-coded secrets, and OWASP compliance violations.

## Validation Steps

**IMPORTANT: Infrastructure Exclusions**

VALORA validates the project being built, NOT its own infrastructure. Always exclude from scanning:
- `.ai/` - VALORA infrastructure
- `.git/` - Git internal state
- `node_modules/` - Package dependencies

Target specific project directories (e.g., `src/`, `app/`, `lib/`) rather than the repository root.

### Step 1: Scan for OWASP Vulnerabilities

Run security analysis tools on **project source only**:

```bash
# Semgrep for pattern-based security scanning (target project source)
pnpm exec semgrep --config auto src/ --exclude ".ai" --exclude "node_modules"

# Or CodeQL/Snyk if configured
```

**Check for**:
- SQL injection patterns
- XSS vulnerabilities
- Command injection
- Path traversal
- Insecure authentication
- Broken access control
- Security misconfiguration

**Severity Classification**:
- Critical: CVSS ≥ 9.0
- High: CVSS 7.0-8.9
- Medium: CVSS 4.0-6.9
- Low: CVSS < 4.0

### Step 2: Scan for Hard-Coded Secrets

Check for exposed credentials in **project source only**:

```bash
# Use detect-secrets or similar
pnpm exec detect-secrets scan --all-files --exclude-files ".ai/.*"

# Or search for common patterns in project source
rg "password\s*=\s*['\"]" src/ -t ts -t js
rg "api[_-]?key\s*=\s*['\"]" src/ -t ts -t js
```

**Look for**:
- API keys, tokens, passwords
- AWS credentials
- Private keys
- Database connection strings
- OAuth secrets

### Step 3: Validate Input Handling

Review code for proper input validation:

- User input validated before use
- Input sanitized appropriately
- Output encoded (HTML, SQL, etc.)
- Parameterized queries used (no string concatenation)

**Manual patterns to check**:
- `innerHTML` usage (XSS risk)
- `eval()` or `Function()` usage
- Direct SQL string concatenation
- Unvalidated file uploads
- Missing CSRF protection

### Step 4: Scan Dependency Vulnerabilities

Check for known CVEs in dependencies:

```bash
# NPM
npm audit --audit-level=moderate

# Yarn
yarn audit --level moderate

# PNPM
pnpm audit --audit-level moderate
```

**Capture**:
- Vulnerability count by severity
- Affected packages
- Available fixes
- CVE identifiers

### Step 5: Check Security Best Practices

Verify common security patterns:

- HTTPS enforcement (no http:// in production)
- Secure headers (CSP, X-Frame-Options, etc.)
- CSRF tokens for state-changing operations
- Rate limiting on sensitive endpoints
- Proper session management

## Output Format

```json
{
  "security_vulnerabilities": {
    "status": "fail",
    "critical_count": 1,
    "high_count": 0,
    "medium_count": 2,
    "low_count": 1,
    "vulnerabilities": [
      {
        "type": "SQL Injection",
        "severity": "critical",
        "cvss_score": 9.8,
        "owasp": "A03:2021-Injection",
        "location": "src/db/queries.ts:34-38",
        "description": "User input directly concatenated into SQL query",
        "code_snippet": "const query = `SELECT * FROM users WHERE email = '${userEmail}'`;",
        "remediation": "Use parameterized queries: db.query('SELECT * FROM users WHERE email = $1', [userEmail])",
        "cwe": "CWE-89",
        "reference": "https://owasp.org/Top10/A03_2021-Injection/"
      }
    ],
    "commands_run": [
      "pnpm exec semgrep --config auto src/"
    ]
  },
  "secrets_found": {
    "status": "pass",
    "secrets_count": 0,
    "secrets": [],
    "commands_run": [
      "pnpm exec detect-secrets scan --all-files"
    ]
  },
  "owasp_violations": {
    "injection": 1,
    "broken_authentication": 0,
    "sensitive_data_exposure": 0,
    "xxe": 0,
    "broken_access_control": 0,
    "security_misconfiguration": 1,
    "xss": 0,
    "insecure_deserialization": 0,
    "vulnerable_components": 2,
    "insufficient_logging": 0
  },
  "dependency_vulnerabilities": {
    "critical": 0,
    "high": 1,
    "moderate": 3,
    "low": 2,
    "info": 5,
    "total": 11,
    "vulnerable_packages": [
      {
        "name": "axios",
        "version": "0.21.1",
        "severity": "high",
        "cve": "CVE-2021-3749",
        "fix_available": "0.21.2"
      }
    ],
    "commands_run": [
      "npm audit --audit-level=moderate"
    ]
  },
  "summary": {
    "total_issues": 4,
    "critical": 1,
    "high": 1,
    "medium": 2,
    "blocking": true,
    "escalation_required": true
  }
}
```

## Success Criteria

- ✅ Security scanning tools executed
- ✅ Secrets scanning completed
- ✅ Dependency audit performed
- ✅ OWASP categories checked
- ✅ All vulnerabilities captured with CVSS scores
- ✅ Remediation guidance provided
- ✅ Commands documented for reproducibility

## Rules

**Blocking Issues (Fail Quality Gate)**:
- Critical vulnerabilities (CVSS ≥ 9.0)
- High vulnerabilities (CVSS ≥ 7.0)
- Any hard-coded secrets found
- SQL injection patterns
- XSS vulnerabilities
- Command injection

**Warning Issues**:
- Medium vulnerabilities (CVSS 4.0-6.9)
- Outdated dependencies with available patches
- Missing security headers (non-critical)

**Escalation Required**:
- All critical and high severity vulnerabilities
- Must escalate to security team or SecOps

**Note**: Security is non-negotiable. All critical and high severity issues must be resolved before advancing.

