---
updated: 2026-05-07
---

# Regression suite (`pnpm regression`)

The regression suite at `scripts/run-regression-suite.ts` exists to detect **model drift** — the case where the same prompt issued to the same model on a future date produces a meaningfully different response. Detection works by replaying a small set of representative scenarios against the live LLM provider, comparing the response to a previously-captured baseline, and flagging any pair whose similarity drops below the configured threshold.

## Current state

`data/regression-baselines.json` ships with an empty `baselines` array. Until baselines are captured and committed, **`pnpm regression` exits with status 1** and prints a clear remediation message. This is intentional: a regression suite that silently passes on missing baselines is worse than no regression suite at all because it suggests the system is being checked when it is not.

## Capturing baselines

```bash
ANTHROPIC_API_KEY=... pnpm regression:capture
```

The capture script reads scenario definitions from `__tests__/regression/scenarios/`, sends each prompt to the configured Anthropic model, and writes the responses into `data/regression-baselines.json`. Commit the resulting file.

Baselines should be re-captured deliberately — for example, after a model upgrade, or after a prompt change that legitimately alters the expected response shape. Re-capture is **not** an automatic CI step; it is a manual operational decision.

## Running the suite

```bash
ANTHROPIC_API_KEY=... pnpm regression
```

Exit codes:

- **0** — every scenario matched its baseline within the similarity threshold (currently 0.3).
- **1** — at least one scenario deviated, OR no baselines exist. Drift events are appended to `.valora/drift-alerts.jsonl` for dashboard display.

The scheduled GitHub workflow `.github/workflows/regression.yml` runs the suite weekly on `main`. It uploads `drift-alerts.jsonl` as an artefact on failure.

## Why fail-loud rather than warn-quiet

Prior to this change the runner exited 0 when baselines were empty. A scheduled workflow that always succeeds gives no signal whether the system is healthy or whether the operator has forgotten to capture baselines. Fail-loud surfaces the missing-baseline state at the same severity as a real drift detection, so the operator notices and acts.

## Verification Summary

Verified 2026-05-07 against `scripts/run-regression-suite.ts`, `scripts/capture-regression-transcript.ts`, `data/regression-baselines.json`, and `.github/workflows/regression.yml`.

- Claims checked: 5 (path of baselines file; current empty state; runner exit code on empty; capture script command; workflow location).
- Confirmed: 5 — `data/regression-baselines.json` has `"baselines": []`; the runner now exits 1 on empty; `pnpm regression:capture` resolves to `tsx scripts/capture-regression-transcript.ts`; the workflow runs Mondays 06:00 UTC on `main`.
- Unverifiable: 0
