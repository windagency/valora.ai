# Design Spec: `valora-plugin-cross-duplication-audit`

**Date:** 2026-05-22
**Status:** Approved
**Author:** Damien Tivelet

---

## Problem

Decomposing infrastructure code by integration target (per-platform, per-driver, per-worker-client) causes N×M duplication: N targets × M cross-cutting concerns inline. Growth is multiplicative. The failure mode is invisible until DEBT tag counts reach triple digits and sibling-fix rates expose the pattern (see post-mortem #1277).

DDD vertical discipline (port/adapter, dependency-cruiser) delays the explosion but does not prevent it. No commercial scaffolder detects horizontal cross-sibling duplication as it accumulates.

This plugin provides that missing detection layer.

---

## Deliverable

A Valora plugin package: `valora-plugin-cross-duplication-audit`

Hybrid plugin — contributes `code`, `commands`, and `prompts`.

---

## Architecture

### Package layout

```
packages/valora-plugin-cross-duplication-audit/
├── valora-plugin.json
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                — register(api) → CLI subcommand wiring
│   ├── scanner.ts              — filesystem walk + fingerprint engine
│   ├── fingerprint.ts          — import + concern pattern definitions
│   └── scanner.types.ts        — shared JSON output schema (Zod + TS types)
├── commands/
│   └── audit-cross-duplication.md   — two-stage pipeline command
└── prompts/
    └── audit.generate-narrative.md  — LLM narrative prompt
```

### Plugin manifest

```json
{
	"name": "valora-plugin-cross-duplication-audit",
	"version": "1.0.0",
	"description": "Detects N×M concern accumulation across sibling directories before it becomes structural debt.",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code", "commands", "prompts"],
	"permissions": ["code-exec", "fs-read"],
	"codeEntrypoint": "dist/index.js",
	"cli": [{ "name": "audit scan", "description": "Static cross-sibling duplication scan — outputs JSON, CI-safe" }]
}
```

### Two delivery modes

| Mode         | Entry point                        | LLM call              | Use case                                      |
| ------------ | ---------------------------------- | --------------------- | --------------------------------------------- |
| CI gate      | `valora audit scan [path] [flags]` | None                  | Fail the pipeline on new violations           |
| Human review | `valora audit-cross-duplication`   | Yes (narrative stage) | Monthly report, interactive refactor sessions |

---

## CLI subcommand: `audit scan`

Registered via `api.cli.addSubcommand('audit scan', ..., handler)` in `src/index.ts`.

### Flags

| Flag               | Default | Description                             |
| ------------------ | ------- | --------------------------------------- |
| `[path]`           | `.`     | Root path to scan                       |
| `--depth=<N>`      | `2`     | Directory levels to scan from root      |
| `--threshold=<N>`  | `3`     | Minimum sibling count to flag a concern |
| `--concerns=<csv>` | all     | Restrict to named built-in categories   |
| `--exclude=<glob>` | —       | Skip sibling dirs matching this glob    |
| `--output=<path>`  | stdout  | Write JSON to file instead of stdout    |

### Exit codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| `0`  | Clean — no violations found                        |
| `1`  | Violations found — count ≥ 1                       |
| `2`  | Scan error — bad config, IO failure, unrecoverable |

Partial IO errors (unreadable sibling dir) are non-fatal: the directory is skipped and a `warnings` entry is added to the JSON output.

---

## Static scanner design

### Fingerprint types

**Import fingerprint** — regex pass over every file in a sibling directory, collecting bare module specifiers from `import`/`require`/`from` statements. Result: `Set<string>` per sibling. Language-agnostic (no compiler required).

A violation is raised when the same low-level module appears across N ≥ threshold siblings with no shared abstraction above it in the scanned tree.

**Concern fingerprint** — keyword hit count per category, normalised by file count to a density score. Built-in categories:

| Category          | Keywords                                                     |
| ----------------- | ------------------------------------------------------------ |
| `error-boundary`  | `try`, `catch`, `throw`, `except`, `Error(`                  |
| `retry`           | `retry`, `attempt`, `backoff`, `exponential`                 |
| `circuit-breaker` | `CircuitBreaker`, `breaker`, `half-open`                     |
| `timeout`         | `timeout`, `setTimeout`, `deadline`, `AbortController`       |
| `logging`         | `logger.error`, `log.error`, `console.error`, `console.warn` |
| `metrics`         | `counter(`, `histogram(`, `gauge(`, `.increment(`            |

A concern is flagged when its normalised density exceeds **1.0 average keyword hits per file** in a sibling directory (configurable via `densityFloor` in `.valora/audit.json`, default `1.0`) **and** it is present in N ≥ threshold sibling directories.

### Severity

| Severity | Condition         |
| -------- | ----------------- |
| `high`   | N ≥ threshold + 2 |
| `medium` | N = threshold + 1 |
| `low`    | N = threshold     |

### JSON output schema

```jsonc
{
	"scannedAt": "2026-05-22T09:00:00Z",
	"rootPath": "src",
	"depth": 2,
	"threshold": 3,
	"warnings": [], // non-fatal IO skips
	"siblingGroups": [
		{
			"parentPath": "src/infrastructure",
			"siblings": ["telegram", "discord", "llm", "tts"],
			"violations": [
				{
					"concern": "error-boundary",
					"severity": "high",
					"affectedSiblings": ["telegram", "discord", "llm"],
					"suggestedExtractionPath": "src/infrastructure/shared/error-boundary",
					"topKeywords": ["catch", "Error(", "throw"]
				}
			]
		}
	],
	"summary": {
		"totalViolations": 5,
		"highSeverity": 2,
		"mediumSeverity": 3
	}
}
```

---

## Pipeline command: `audit-cross-duplication`

Defined in `commands/audit-cross-duplication.md`. Two stages:

### Stage 1 `scan`

Agent calls `valora audit scan [path] [flags]` via `run_terminal_cmd`. Captures stdout as `$scan_json`.

- Exit code 2 → pipeline halts with error.
- Exit code 0 → pipeline emits clean message and stops (no narrative needed).
- Exit code 1 → proceed to Stage 2.

### Stage 2 `narrative`

Feeds `$scan_json` to prompt `audit.generate-narrative`. LLM produces a Markdown report:

```markdown
## Cross-Duplication Audit — <date>

### Executive summary

<2–3 sentences: N violations across M sibling groups, worst offender>

### Violations

#### [HIGH] error-boundary — src/infrastructure/{telegram,discord,llm}

**Pattern:** try/catch + Error() repeated in 3 of 4 siblings.
**Suggested extraction:** `src/infrastructure/shared/error-boundary.ts`
**Interface sketch:**
export function withErrorBoundary<T>(fn: () => Promise<T>): Promise<T>

### Prioritised actions

1. Extract error-boundary stage — unblocks 3 siblings
2. ...
```

Prompt constraints: interface sketches ≤ 5 lines each; suggested extraction path is `{parentPath}/shared/{concern}` (e.g. `src/infrastructure/shared/error-boundary`); actions ordered by N count descending.

**Report persistence:** pipeline writes the Markdown to `.valora/reports/cross-duplication-<date>.md`, accumulating a diff-able history for monthly cron runs.

---

## Configuration

Three layers, narrowest wins: CLI flags > `.valora/audit.json` > plugin defaults.

`.valora/audit.json` (project-level, checked in):

```json
{
	"depth": 2,
	"threshold": 3,
	"densityFloor": 1.0,
	"concerns": ["error-boundary", "retry", "circuit-breaker", "timeout", "logging", "metrics"],
	"exclude": ["__tests__", "*.spec"]
}
```

Config loaded via `api.config.extend(AuditConfigSchema)` (Zod) — type errors surface at startup.

**Custom keyword patterns deferred to v2.** The `--concerns` flag filters to named built-in categories only. Regex overrides introduce ReDoS risk and the six built-in categories cover the documented #1277 failure modes.

---

## Error handling

| Failure                          | Behaviour                                          |
| -------------------------------- | -------------------------------------------------- |
| Unreadable sibling dir           | Skip, add entry to `warnings[]`, continue          |
| No sibling groups found at depth | Exit 0, `summary.note` explains why — never silent |
| Invalid config (bad Zod parse)   | Startup error, exit 2 before scan begins           |
| Unexpected crash                 | Exit 2, plain-text to stderr                       |

---

## Testing

TDD order: `fingerprint.ts` → `scanner.ts` → CLI wiring.

| Layer            | Approach                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `fingerprint.ts` | Pure unit tests — given source lines, assert keyword hits and import extraction                        |
| `scanner.ts`     | Integration tests against fixture directory trees in `__tests__/fixtures/` — real filesystem, no mocks |
| CLI subcommand   | Smoke test: run against fixtures, assert exit code and JSON shape                                      |
| Pipeline command | Manual verification; no automated harness in v1                                                        |

No filesystem mocks. Fixture trees are real directories, consistent with CLAUDE.md integration test rules.

---

## Out of scope (v1)

- Custom keyword regex patterns
- Cross-repository scanning
- Automatic PR comment posting
- IDE extension integration
- DEBT tag co-location (correlating `DEBT:*` tag counts with scan violations)
