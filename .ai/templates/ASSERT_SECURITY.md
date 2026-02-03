# Security Assertion Checklist

**Scope**: [File paths or commit range]
**Date**: [YYYY-MM-DD]
**Validator**: [Agent/Human]

---

## Instructions

Quick security validation for implementation. Mark each item Y (Yes), N (No), or N/A (Not Applicable). Any N on critical items triggers BLOCKED status. Target completion: ~2 minutes.

---

## 1. Input Validation (CRITICAL)

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 1.1 | User input validated before use | [ ] Y / [ ] N / [ ] N/A | |
| 1.2 | Input length limits enforced | [ ] Y / [ ] N / [ ] N/A | |
| 1.3 | Input type validation (Zod/joi) | [ ] Y / [ ] N / [ ] N/A | |
| 1.4 | File upload validation (type, size) | [ ] Y / [ ] N / [ ] N/A | |
| 1.5 | URL/path parameters sanitised | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 2. Injection Prevention (CRITICAL)

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 2.1 | SQL queries use parameterised statements | [ ] Y / [ ] N / [ ] N/A | |
| 2.2 | No string concatenation in queries | [ ] Y / [ ] N / [ ] N/A | |
| 2.3 | HTML output properly escaped (XSS) | [ ] Y / [ ] N / [ ] N/A | |
| 2.4 | Command execution uses safe APIs | [ ] Y / [ ] N / [ ] N/A | |
| 2.5 | Template injection prevented | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 3. Authentication & Authorisation (CRITICAL)

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 3.1 | Protected routes require authentication | [ ] Y / [ ] N / [ ] N/A | |
| 3.2 | Authorisation checks on resources | [ ] Y / [ ] N / [ ] N/A | |
| 3.3 | Session management secure | [ ] Y / [ ] N / [ ] N/A | |
| 3.4 | Password handling follows best practices | [ ] Y / [ ] N / [ ] N/A | |
| 3.5 | Token validation implemented | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 4. Secrets Management (CRITICAL)

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 4.1 | No hard-coded secrets/credentials | [ ] Y / [ ] N | |
| 4.2 | No API keys in source code | [ ] Y / [ ] N | |
| 4.3 | Secrets loaded from environment | [ ] Y / [ ] N / [ ] N/A | |
| 4.4 | .env files in .gitignore | [ ] Y / [ ] N / [ ] N/A | |
| 4.5 | No sensitive data in logs | [ ] Y / [ ] N | |

**Score**: [ ] / [ ] applicable items passed

---

## 5. Data Protection

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 5.1 | Sensitive data encrypted at rest | [ ] Y / [ ] N / [ ] N/A | |
| 5.2 | HTTPS enforced for data in transit | [ ] Y / [ ] N / [ ] N/A | |
| 5.3 | PII handling follows regulations | [ ] Y / [ ] N / [ ] N/A | |
| 5.4 | Data retention policies respected | [ ] Y / [ ] N / [ ] N/A | |
| 5.5 | Audit logging for sensitive operations | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 6. Dependency Security

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 6.1 | No known CVEs in dependencies | [ ] Y / [ ] N | `pnpm audit` |
| 6.2 | Dependencies from trusted sources | [ ] Y / [ ] N | |
| 6.3 | Lock file committed | [ ] Y / [ ] N | |
| 6.4 | No deprecated packages with vulnerabilities | [ ] Y / [ ] N | |

**Score**: [ ] / 4 items passed

---

## 7. Error Handling Security

| # | Check | Status | Location/Notes |
|---|-------|--------|----------------|
| 7.1 | No stack traces exposed to users | [ ] Y / [ ] N | |
| 7.2 | Error messages don't leak internals | [ ] Y / [ ] N | |
| 7.3 | Failed auth returns generic message | [ ] Y / [ ] N / [ ] N/A | |
| 7.4 | Rate limiting on sensitive endpoints | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## Summary

| Section | Passed | Total | Critical |
|---------|--------|-------|----------|
| 1. Input Validation | | | Yes |
| 2. Injection Prevention | | | Yes |
| 3. Auth & Authz | | | Yes |
| 4. Secrets Management | | | Yes |
| 5. Data Protection | | | No |
| 6. Dependency Security | | 4 | No |
| 7. Error Handling | | | No |
| **TOTAL** | | | |

---

## Verdict

**Critical requirement**: All critical sections must have 100% pass rate

| Result | Criteria |
|--------|----------|
| [ ] **PASS** | All critical sections 100% AND overall >= 80% |
| [ ] **WARN** | All critical sections 100% AND overall >= 60% |
| [ ] **BLOCKED** | Any critical section < 100% OR overall < 60% |

---

## OWASP Top 10 Quick Check

| # | Vulnerability | Status |
|---|---------------|--------|
| A01 | Broken Access Control | [ ] Safe / [ ] Risk |
| A02 | Cryptographic Failures | [ ] Safe / [ ] Risk / [ ] N/A |
| A03 | Injection | [ ] Safe / [ ] Risk |
| A04 | Insecure Design | [ ] Safe / [ ] Risk |
| A05 | Security Misconfiguration | [ ] Safe / [ ] Risk |
| A06 | Vulnerable Components | [ ] Safe / [ ] Risk |
| A07 | Auth Failures | [ ] Safe / [ ] Risk / [ ] N/A |
| A08 | Data Integrity Failures | [ ] Safe / [ ] Risk / [ ] N/A |
| A09 | Logging Failures | [ ] Safe / [ ] Risk |
| A10 | SSRF | [ ] Safe / [ ] Risk / [ ] N/A |

---

## Critical Issues

| # | Severity | Issue | Location | Remediation |
|---|----------|-------|----------|-------------|
| 1 | CRITICAL | | | |
| 2 | HIGH | | | |

---

## Commands to Verify

```bash
# Check for secrets
pnpm exec secretlint .

# Audit dependencies
pnpm audit

# Type check
pnpm tsc:check

# Lint security rules
pnpm lint
```

---

## Next Step

- If PASS: Proceed to `/test`
- If WARN: Address issues, then `/test`
- If BLOCKED: Return to `/implement` - SECURITY ISSUES MUST BE FIXED
