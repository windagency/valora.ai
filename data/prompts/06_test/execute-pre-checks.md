---
id: test.execute-pre-checks
version: 1.0.0
category: test
experimental: true
name: Execute Pre-Checks
description: Detect the project ecosystem then run language-appropriate quality checks (type checking, linting, formatting, security audit, quick tests) in parallel
tags:
  - pre-check
  - linting
  - type-checking
  - security-audit
  - multi-language
model_requirements:
  min_context: 32000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4.6
agents:
  - qa
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: fix
    description: Automatically fix issues where possible (auto-formatters, auto-fixable linters)
    type: boolean
    required: false
    default: false
  - name: strict
    description: Enable strict mode — treat all warnings as errors
    type: boolean
    required: false
    default: false
  - name: ci
    description: CI/CD mode — non-interactive, fail fast, structured output
    type: boolean
    required: false
    default: false
outputs:
  - check_results
  - issues_found
  - auto_fixes_applied
  - overall_status
tokens:
  avg: 3500
  max: 9000
  min: 1200
---

# Execute Pre-Checks

## Objective

Detect the project's language ecosystem, select the appropriate quality tools, run all checks in parallel, and determine an overall PASS/WARN/FAIL status. If `fix` is enabled, apply auto-fixes and re-validate.

## CLI Tools for Detection and Output Processing

Use modern CLI tools throughout:

- **`fd`** to probe for ecosystem marker files (`package.json`, `go.mod`, `Cargo.toml`, etc.)
- **`jq`** / **`yq`** to parse structured config files without reading them whole
- **`rg`** to scan output logs for error patterns
- **`bat`** or plain read for inspecting small config files

```bash
# Detect all ecosystems present in the project
fd -g 'package.json' --max-depth 2 --exclude 'node_modules' --type f
fd -g 'go.mod' --max-depth 3 --type f
fd -g 'Cargo.toml' --max-depth 3 --type f
fd -g 'pyproject.toml' -g 'requirements*.txt' --max-depth 3 --type f
fd -g 'pom.xml' -g 'build.gradle' --max-depth 3 --type f
fd -g 'Gemfile' --max-depth 2 --type f
fd -g 'composer.json' --max-depth 2 --type f
```

## Instructions

### Step 1: Detect Project Ecosystem(s)

A project may have multiple ecosystems (e.g., a TypeScript frontend + Python backend). Detect all of them.

| Marker file(s)                        | Ecosystem             |
| ------------------------------------- | --------------------- |
| `package.json`                        | JavaScript/TypeScript |
| `go.mod`                              | Go                    |
| `Cargo.toml`                          | Rust                  |
| `pyproject.toml`, `requirements*.txt` | Python                |
| `pom.xml`, `build.gradle`             | Java/Kotlin           |
| `Gemfile`                             | Ruby                  |
| `composer.json`                       | PHP                   |

For each detected ecosystem, read the relevant config to discover which specific tools are available (e.g., is `eslint` configured? is `mypy` present?).

```bash
# JavaScript/TypeScript — find configured tools
jq '{hasEslint: (.devDependencies | has("eslint")), hasPrettier: (.devDependencies | has("prettier")), hasTsc: (.devDependencies | has("typescript")), scripts: .scripts}' package.json

# Python — check for linters/type checkers in pyproject.toml
yq '.tool | keys' pyproject.toml 2>/dev/null || grep -E 'mypy|ruff|flake8|black|pylint|bandit' requirements*.txt
```

**Output:**

```json
{
	"ecosystems": [
		{
			"language": "typescript",
			"root": "frontend/",
			"package_manager": "pnpm",
			"tools": {
				"type_check": "tsc",
				"lint": "eslint",
				"format": "prettier",
				"security": "npm audit",
				"test": "vitest"
			}
		},
		{
			"language": "python",
			"root": "backend/",
			"tools": {
				"type_check": "mypy",
				"lint": "ruff",
				"format": "ruff format",
				"security": "pip-audit",
				"test": "pytest"
			}
		}
	]
}
```

### Step 2: Select Check Commands per Ecosystem

For each detected ecosystem, map the available tools to the 5 check categories. Fall back gracefully when a tool is not configured.

#### JavaScript / TypeScript

| Category    | Primary                                   | Fallback                          |
| ----------- | ----------------------------------------- | --------------------------------- |
| Type check  | `tsc --noEmit`                            | skip if no tsconfig               |
| Lint        | `eslint .`                                | skip if no eslint config          |
| Format      | `prettier --check .`                      | skip if no prettier config        |
| Security    | `npm audit` / `pnpm audit` / `yarn audit` | skip if no lockfile               |
| Quick tests | scripts `test:quick` / `test:unit`        | first available test script       |
| Build       | scripts `build`                           | `tsc --noEmit` if no build script |

#### Python

| Category    | Primary                                     | Fallback             |
| ----------- | ------------------------------------------- | -------------------- |
| Type check  | `mypy .`                                    | `pyright` if present |
| Lint        | `ruff check .`                              | `flake8` / `pylint`  |
| Format      | `ruff format --check .`                     | `black --check .`    |
| Security    | `pip-audit`                                 | `safety check`       |
| Quick tests | `pytest -x -q --tb=short`                   | skip if no pytest    |
| Build       | `python -m py_compile $(fd -e py --type f)` | skip                 |

#### Go

| Category    | Command                                 |
| ----------- | --------------------------------------- |
| Type check  | `go build ./...`                        |
| Lint        | `golangci-lint run` / `go vet ./...`    |
| Format      | `gofmt -l .` (fail if output non-empty) |
| Security    | `govulncheck ./...`                     |
| Quick tests | `go test -short ./...`                  |
| Build       | `go build ./...`                        |

#### Rust

| Category    | Command                       |
| ----------- | ----------------------------- |
| Type check  | `cargo check`                 |
| Lint        | `cargo clippy -- -D warnings` |
| Format      | `cargo fmt -- --check`        |
| Security    | `cargo audit`                 |
| Quick tests | `cargo test --lib`            |
| Build       | `cargo build`                 |

#### Java / Kotlin

| Category    | Maven                                  | Gradle                             |
| ----------- | -------------------------------------- | ---------------------------------- |
| Type check  | `mvn compile -q`                       | `./gradlew compileJava -q`         |
| Lint        | `mvn checkstyle:check`                 | `./gradlew checkstyleMain`         |
| Format      | (manual check with google-java-format) | same                               |
| Security    | `mvn dependency-check:check`           | `./gradlew dependencyCheckAnalyze` |
| Quick tests | `mvn test -Dtest=*Unit*`               | `./gradlew test --tests *Unit*`    |
| Build       | `mvn package -DskipTests`              | `./gradlew build -x test`          |

#### Ruby

| Category    | Command                                      |
| ----------- | -------------------------------------------- |
| Type check  | `srb tc` (Sorbet) or skip                    |
| Lint        | `rubocop --no-color`                         |
| Format      | `rubocop --format json`                      |
| Security    | `bundle audit check --update`                |
| Quick tests | `rspec --fail-fast --format progress`        |
| Build       | `bundle exec rake assets:precompile` or skip |

#### PHP

| Category    | Command                                       |
| ----------- | --------------------------------------------- |
| Type check  | `phpstan analyse --level=5`                   |
| Lint        | `phpcs --standard=PSR12`                      |
| Format      | `phpcbf --standard=PSR12` (fix) or check diff |
| Security    | `composer audit`                              |
| Quick tests | `./vendor/bin/phpunit --testsuite Unit`       |
| Build       | `php -l` on all PHP files                     |

### Step 3: Run All Checks in Parallel

Run each ecosystem's checks concurrently. Within an ecosystem, also run checks in parallel where safe.

```bash
# Example: TypeScript ecosystem parallel run
(pnpm tsc --noEmit 2>&1; echo "TSC_EXIT:$?") &
(pnpm eslint . --format json 2>&1; echo "ESLINT_EXIT:$?") &
(pnpm prettier --check . 2>&1; echo "PRETTIER_EXIT:$?") &
(pnpm audit --json 2>&1; echo "AUDIT_EXIT:$?") &
(pnpm test:quick 2>&1; echo "TEST_EXIT:$?") &
wait

# Example: Go ecosystem parallel run
(go build ./... 2>&1; echo "BUILD_EXIT:$?") &
(go vet ./... 2>&1; echo "VET_EXIT:$?") &
(gofmt -l . 2>&1; echo "FMT_EXIT:$?") &
(govulncheck ./... 2>&1; echo "VULN_EXIT:$?") &
(go test -short ./... 2>&1; echo "TEST_EXIT:$?") &
wait
```

Capture both stdout/stderr and exit codes for each check.

### Step 4: Parse and Collect Results

Use structured output when available (JSON reporters), fall back to exit code + pattern matching.

```bash
# TypeScript/ESLint: parse JSON
pnpm eslint . --format json | jq '{errors: ([.[].errorCount] | add // 0), warnings: ([.[].warningCount] | add // 0)}'

# Go: check gofmt output (non-empty = unformatted files)
unformatted=$(gofmt -l . | wc -l)

# Rust: parse clippy JSON output
cargo clippy --message-format json | jq 'select(.reason == "compiler-message") | .message | select(.level == "error" or .level == "warning")'

# Python/ruff: parse JSON output
ruff check . --output-format json | jq '[.[] | {file: .filename, rule: .code, severity: .level}]'
```

**Normalised result structure per check (all ecosystems use this format):**

```json
{
	"check_results": {
		"<ecosystem>": {
			"type_check": { "status": "PASS|FAIL", "errors": 0, "detail": "", "duration": "2.1s" },
			"lint": { "status": "PASS|FAIL|WARN", "errors": 0, "warnings": 3, "detail": "", "duration": "1.4s" },
			"format": { "status": "PASS|FAIL", "files_unformatted": 0, "duration": "0.3s" },
			"security": {
				"status": "PASS|WARN|FAIL",
				"vulnerabilities": { "critical": 0, "high": 0, "moderate": 2, "low": 5 },
				"duration": "4.2s"
			},
			"tests": { "status": "PASS|FAIL|SKIP", "passed": 45, "failed": 0, "duration": "8.1s" },
			"build": { "status": "PASS|FAIL|SKIP", "duration": "6.3s" }
		}
	}
}
```

Use `"SKIP"` when a check category is not applicable or the tool is not configured.

### Step 5: Apply Auto-Fixes (if `fix = true`)

Apply automated fixes for each ecosystem's formatter and auto-fixable linter, then re-run those checks to confirm resolution.

| Ecosystem  | Format fix                  | Lint fix                  |
| ---------- | --------------------------- | ------------------------- |
| TypeScript | `prettier --write .`        | `eslint . --fix`          |
| Python     | `ruff format .` / `black .` | `ruff check . --fix`      |
| Go         | `gofmt -w .`                | `golangci-lint run --fix` |
| Rust       | `cargo fmt`                 | (clippy fixes are manual) |
| Java       | `google-java-format -r .`   | (checkstyle fixes manual) |
| Ruby       | `rubocop -a`                | `rubocop -a`              |
| PHP        | `phpcbf --standard=PSR12`   | same                      |

Track all fixes applied:

```json
{
	"auto_fixes_applied": [
		{ "ecosystem": "typescript", "check": "format", "files_fixed": 3 },
		{ "ecosystem": "python", "check": "lint", "issues_fixed": 7 }
	]
}
```

Type errors and security vulnerabilities are **never** auto-fixed — they require manual attention.

### Step 6: Determine Overall Status

Apply this matrix across **all** ecosystems combined:

| Type Check (any ecosystem) | Lint Errors | Security (critical/high) | Decision |
| -------------------------- | ----------- | ------------------------ | -------- |
| All PASS                   | 0           | 0                        | **PASS** |
| All PASS                   | 0           | moderate/low only        | **WARN** |
| All PASS                   | > 0         | any                      | **FAIL** |
| Any FAIL                   | any         | any                      | **FAIL** |

In `strict` mode, any warning (lint warnings, formatting issues, low security vulnerabilities) escalates to **FAIL**.

## Output Format

```json
{
	"check_results": {
		"typescript": {
			"type_check": { "status": "PASS", "errors": 0, "duration": "12s" },
			"lint": { "status": "WARN", "errors": 0, "warnings": 3, "duration": "8s" },
			"format": { "status": "PASS", "files_unformatted": 0, "duration": "3s" },
			"security": {
				"status": "WARN",
				"vulnerabilities": { "critical": 0, "high": 0, "moderate": 2, "low": 5 },
				"duration": "5s"
			},
			"tests": { "status": "PASS", "passed": 45, "failed": 0, "duration": "20s" },
			"build": { "status": "PASS", "duration": "15s" }
		},
		"python": {
			"type_check": { "status": "PASS", "errors": 0, "duration": "4s" },
			"lint": { "status": "PASS", "errors": 0, "warnings": 0, "duration": "2s" },
			"format": { "status": "PASS", "files_unformatted": 0, "duration": "1s" },
			"security": { "status": "PASS", "vulnerabilities": { "critical": 0, "high": 0 }, "duration": "3s" },
			"tests": { "status": "PASS", "passed": 28, "failed": 0, "duration": "6s" },
			"build": { "status": "SKIP" }
		}
	},
	"issues_found": [
		{ "ecosystem": "typescript", "check": "lint", "severity": "MEDIUM", "detail": "3 ESLint warnings" },
		{ "ecosystem": "typescript", "check": "security", "severity": "MEDIUM", "detail": "2 moderate vulnerabilities" }
	],
	"auto_fixes_applied": [],
	"overall_status": "WARN"
}
```

## Success Criteria

- ✅ All detected ecosystems identified
- ✅ All applicable checks executed per ecosystem (skipped checks documented)
- ✅ Results collected in normalised format for every check
- ✅ Auto-fixes applied and re-validated when `fix = true`
- ✅ Overall status determined consistently across all ecosystems

## Rules

**DO**:

- ✅ Detect ecosystems before running any check
- ✅ Run checks in parallel within and across ecosystems
- ✅ Use `"SKIP"` for checks with no applicable tool, never omit
- ✅ Parse structured JSON output (linters, audits) rather than grepping raw text
- ✅ Continue collecting results even when individual checks fail

**DON'T**:

- ❌ Don't hardcode language-specific commands — detect first
- ❌ Don't auto-fix type errors or security vulnerabilities
- ❌ Don't stop at the first failing check — collect all results
- ❌ Don't treat lint warnings as errors unless `strict = true`
- ❌ Don't assume a single ecosystem per project
