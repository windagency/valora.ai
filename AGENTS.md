---
updated: 2026-05-07
---

# AGENTS.md

> Agent entry point. Keep this file under 120 lines — rules and details belong in the documentation/ files linked below.

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

## Most important behavioural rules

1. **Don’t assume. Don’t hide confusion. Surface tradeoffs.**
2. **Minimum code that solves the problem. Nothing speculative.**
3. **Touch only what you must. Clean up only your own mess.**
4. **Define success criteria. Loop until verified.**

## Non-negotiable rules

1. **TDD always.** Write the failing test before any implementation code.
2. **Layer direction: `Types → Config → LLM/Services → Executor + MCP → CLI`.** Cross-cutting concerns (output, observability, memory, utils, registry) are leaves: every layer may import them, they may import only `Types`. The `Executor` and `MCP` layers form one orchestration ring (see [ADR-015](documentation/adr/015-executor-mcp-coupling.md)) — `executor/` may import concrete `mcp/` classes, but `mcp/` may import `executor/` only at the type level. Enforced by arch-unit-ts tests in `__tests__/architecture/`.
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
3. Read `documentation/quality/grades.json` for known gaps and technical debt.
4. Check `.claude/plans/` for active implementation plans.
5. If a Slack discussion or design decision shaped current code, it belongs in a doc — add it so future agents can reason over it.
