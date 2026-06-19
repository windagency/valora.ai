---
id: test.generate-precheck-report
version: 1.0.0
category: test
experimental: true
name: Generate Pre-Check Report
description: Format pre-check results from any language ecosystem into a structured summary, detailed, or JSON report
tags:
  - pre-check
  - reporting
  - quality-assessment
  - multi-language
model_requirements:
  min_context: 16000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4.6
agents:
  - qa
dependencies:
  requires:
    - test.execute-pre-checks
inputs:
  - name: check_results
    description: Normalised check results from execute-pre-checks, keyed by ecosystem
    type: object
    required: true
  - name: issues_found
    description: List of issues with ecosystem, check, severity and detail
    type: object
    required: true
  - name: report_format
    description: Output format — summary (default), detailed, or json
    type: string
    required: false
    default: summary
    validation:
      enum: ['summary', 'detailed', 'json']
outputs:
  - precheck_report
  - recommendations
tokens:
  avg: 2000
  max: 5000
  min: 800
---

# Generate Pre-Check Report

## Objective

Transform the normalised check results from `execute-pre-checks` into a clear, actionable report. The report format is controlled by `report_format`. All formats must cover every detected ecosystem.

## Instructions

### Step 1: Compute Aggregate Metrics

Across all ecosystems, compute totals:

```json
{
	"totals": {
		"ecosystems_checked": 2,
		"checks_run": 11,
		"checks_skipped": 1,
		"errors": 0,
		"warnings": 5,
		"vulnerabilities": { "critical": 0, "high": 0, "moderate": 2, "low": 5 },
		"overall_status": "WARN",
		"total_duration": "~35s"
	}
}
```

### Step 2: Identify Blocking vs. Non-Blocking Issues

Classify each issue from `issues_found`:

| Severity | Blocking? | Examples                                        |
| -------- | --------- | ----------------------------------------------- |
| CRITICAL | Yes       | Type errors, build failures, high/critical CVEs |
| HIGH     | Yes       | Lint errors, test failures                      |
| MEDIUM   | No        | Lint warnings, moderate CVEs, formatting        |
| LOW      | No        | Low CVEs, minor style warnings                  |

### Step 3: Generate Recommendations

For each issue, produce one concrete, actionable recommendation:

```json
{
	"recommendations": [
		{
			"priority": "LOW",
			"ecosystem": "typescript",
			"check": "security",
			"action": "Run `pnpm audit --fix` to upgrade packages with moderate vulnerabilities",
			"detail": "2 moderate vulnerabilities — non-blocking but should be addressed"
		},
		{
			"priority": "LOW",
			"ecosystem": "typescript",
			"check": "lint",
			"action": "Review 3 ESLint warnings — run `pnpm lint` for details",
			"detail": "Warnings are non-blocking in non-strict mode"
		}
	]
}
```

### Step 4: Format Output

#### Summary Report (default)

Concise pass/fail per ecosystem and check, with a next-step directive.

```markdown
## Pre-Check: WARN

**Duration**: ~35s  
**Ecosystems checked**: TypeScript, Python  
**Ready for**: Manual review (with noted warnings)

### Results

| Ecosystem  | Type Check | Lint    | Format  | Security | Tests   | Build   |
| ---------- | ---------- | ------- | ------- | -------- | ------- | ------- |
| TypeScript | ✅ PASS    | ⚠️ WARN | ✅ PASS | ⚠️ WARN  | ✅ PASS | ✅ PASS |
| Python     | ✅ PASS    | ✅ PASS | ✅ PASS | ✅ PASS  | ✅ PASS | —       |

### Warnings (non-blocking)

- **TypeScript / ESLint**: 3 warnings
- **TypeScript / Security**: 2 moderate vulnerabilities in dependencies

### Next Step

→ `valora review-code --focus=architecture` for manual review
```

#### Detailed Report

Full breakdown of every issue with file paths, line numbers, and suggested fixes.

```markdown
## Pre-Check: WARN

**Duration**: ~35s | **Status**: Proceed with noted warnings

### TypeScript

#### Type Check ✅ PASS

No errors.

#### Lint ⚠️ WARN — 0 errors, 3 warnings

| File                | Line | Rule                               | Message                      |
| ------------------- | ---- | ---------------------------------- | ---------------------------- |
| src/utils/format.ts | 12   | no-console                         | Unexpected console statement |
| src/utils/format.ts | 34   | @typescript-eslint/no-explicit-any | Unexpected `any`             |
| src/auth/service.ts | 89   | prefer-const                       | Use `const` instead of `let` |

#### Format ✅ PASS

All files formatted.

#### Security ⚠️ WARN — 2 moderate vulnerabilities

| Package | Severity | CVE            | Fix                |
| ------- | -------- | -------------- | ------------------ |
| lodash  | moderate | CVE-2021-23337 | Upgrade to 4.17.21 |
| axios   | moderate | CVE-2023-45857 | Upgrade to 1.6.0   |

#### Tests ✅ PASS — 45 passed, 0 failed

#### Build ✅ PASS

---

### Python

#### Type Check ✅ PASS

#### Lint ✅ PASS

#### Format ✅ PASS

#### Security ✅ PASS

#### Tests ✅ PASS — 28 passed, 0 failed

#### Build — (not applicable)

---

### Recommendations

1. Run `pnpm audit --fix` to resolve moderate vulnerabilities (non-blocking)
2. Consider addressing 3 ESLint warnings before next review cycle

### Next Step

→ `valora review-code --focus=architecture`
```

#### JSON Report (for CI/CD)

Machine-readable, suitable for pipeline consumption.

```json
{
	"status": "PASS|WARN|FAIL",
	"ready_for_review": true,
	"duration_seconds": 35,
	"ecosystems": {
		"typescript": {
			"overall": "WARN",
			"checks": {
				"type_check": { "status": "PASS", "errors": 0, "duration_seconds": 12 },
				"lint": { "status": "WARN", "errors": 0, "warnings": 3, "duration_seconds": 8 },
				"format": { "status": "PASS", "files_unformatted": 0, "duration_seconds": 3 },
				"security": { "status": "WARN", "critical": 0, "high": 0, "moderate": 2, "low": 5, "duration_seconds": 5 },
				"tests": { "status": "PASS", "passed": 45, "failed": 0, "duration_seconds": 20 },
				"build": { "status": "PASS", "duration_seconds": 15 }
			}
		},
		"python": {
			"overall": "PASS",
			"checks": {
				"type_check": { "status": "PASS", "errors": 0, "duration_seconds": 4 },
				"lint": { "status": "PASS", "errors": 0, "warnings": 0, "duration_seconds": 2 },
				"format": { "status": "PASS", "files_unformatted": 0, "duration_seconds": 1 },
				"security": { "status": "PASS", "critical": 0, "high": 0, "duration_seconds": 3 },
				"tests": { "status": "PASS", "passed": 28, "failed": 0, "duration_seconds": 6 },
				"build": { "status": "SKIP" }
			}
		}
	},
	"issues": [
		{ "ecosystem": "typescript", "check": "lint", "severity": "MEDIUM", "detail": "3 ESLint warnings" },
		{ "ecosystem": "typescript", "check": "security", "severity": "MEDIUM", "detail": "2 moderate vulnerabilities" }
	],
	"recommendations": [
		{ "priority": "LOW", "action": "Run `pnpm audit --fix` to resolve moderate vulnerabilities" },
		{ "priority": "LOW", "action": "Review 3 ESLint warnings" }
	],
	"next_step": "valora review-code --focus=architecture"
}
```

### Step 5: Append Next-Step Directive

Always conclude the report with the appropriate next command:

| Status | Next step                                                 |
| ------ | --------------------------------------------------------- |
| PASS   | `valora review-code --focus=architecture`                 |
| WARN   | `valora review-code --focus=architecture` (note warnings) |
| FAIL   | Fix blocking issues, then re-run `valora pre-check`       |

For FAIL, list only the blocking issues and the specific command to fix each (e.g., `cargo clippy --fix`, `mypy .` for diagnosis).

## Output Format

```json
{
	"precheck_report": "<formatted report string matching requested report_format>",
	"recommendations": [
		{
			"priority": "HIGH|MEDIUM|LOW",
			"ecosystem": "<language>",
			"check": "<check-category>",
			"action": "<concrete command or step>",
			"detail": "<explanation>"
		}
	]
}
```

## Success Criteria

- ✅ All detected ecosystems covered in the report
- ✅ Report format matches `report_format` parameter
- ✅ Every issue classified as blocking or non-blocking
- ✅ Every recommendation is concrete and actionable (includes a command)
- ✅ Next-step directive clearly stated

## Rules

**DO**:

- ✅ Cover all ecosystems — never omit one from the report
- ✅ Use SKIP clearly for checks not applicable to an ecosystem
- ✅ Make every recommendation actionable (a runnable command, not vague advice)
- ✅ Keep summary format genuinely brief — one table row per ecosystem

**DON'T**:

- ❌ Don't invent issues not present in `check_results`
- ❌ Don't recommend proceeding to review when overall_status is FAIL
- ❌ Don't use language-specific terminology in the summary (use generic check category names)
