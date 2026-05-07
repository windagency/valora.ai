---
updated: 2026-05-06
---

# AGENTS.md

> Agent entry point. Keep this file under 120 lines — rules and details belong in the docs/ files linked below.

## What this repository is

Valora is a TypeScript CLI/MCP orchestration platform for multi-agent AI workflows across the software development lifecycle. Two binaries: `valora` (CLI) and `valora-mcp` (MCP server).

## How to navigate this repository

| Topic                                | Where to look                                           |
| ------------------------------------ | ------------------------------------------------------- |
| Architecture overview                | `documentation/architecture/system-architecture.md`     |
| Layer diagram and components         | `documentation/architecture/components.md`              |
| Architectural decisions (ADRs)       | `documentation/adr/`                                    |
| Agent registry and capabilities      | `data/agents/registry.json`                             |
| Command specs                        | `data/commands/registry.json`                           |
| Plugin development guide             | `documentation/developer-guide/`                        |
| Quality grades per domain            | `documentation/quality/grades.json`                     |
| Golden principles (mechanical rules) | `documentation/quality/golden-principles.json`          |
| Test conventions                     | `.claude/CLAUDE.md`                                     |
| Security controls                    | `SECURITY.md`                                           |
| EU AI Act obligations (deployers)    | `documentation/user-guide/eu-ai-act-compliance.md`      |
| GPAI upstream provider policy        | `documentation/developer-guide/gpai-upstream-policy.md` |
| Memory data governance and purge     | `documentation/user-guide/memory-data-governance.md`    |
| System card (auditor reference)      | `documentation/architecture/system-card.md`             |

## Non-negotiable rules

1. **TDD always.** Write the failing test before any implementation code.
2. **Layer direction: `Types → Config → Repo → Service → Runtime → UI`.** Cross-cutting concerns (auth, telemetry, feature flags) enter through `Providers` only. Enforced by arch-unit-ts tests in `__tests__/architecture/`.
3. **No mock-based integration tests.** Use Testcontainers.
4. **Language:** American English in code identifiers. British English in documentation.
5. **Every doc file must have `updated: YYYY-MM-DD` frontmatter.** Run `pnpm docs:validate` to check.

## Development loop

```bash
pnpm test:suite:unit       # fast unit feedback after any change
pnpm lint:fix              # auto-fix style issues
pnpm docs:validate         # check knowledge base freshness and link integrity
pnpm tsc:check             # full type check
pnpm regression            # run behavioural regression suite against baselines
pnpm maintenance:grade     # re-score quality grades across all domains
pnpm maintenance:gc        # prune stale memory and trace data
```

## When you are stuck

1. Run `pnpm docs:validate` — it surfaces stale or broken documentation.
2. Search `documentation/adr/` for prior architectural decisions.
3. Read `docs/quality/grades.json` for known gaps and technical debt.
4. Check `docs/superpowers/plans/` for active implementation plans.
5. If a Slack discussion or design decision shaped current code, it belongs in a doc — add it so future agents can reason over it.

## Verification Summary

Verified 2026-05-06 against `package.json` scripts, `documentation/`, `data/`, and `SECURITY.md`.

- Claims checked: 4 (navigation table entries, dev-loop commands, rule statements, file/directory paths referenced)
- Confirmed: 2 (existing entries and rules are accurate; all referenced paths exist)
- Updated: 2 — added 4 navigation entries for Phase 2–4 governance docs (eu-ai-act-compliance.md, gpai-upstream-policy.md, memory-data-governance.md, system-card.md); added `pnpm regression`, `pnpm maintenance:grade`, `pnpm maintenance:gc` to the dev loop (all confirmed in `package.json`)
- Unverifiable: 0
