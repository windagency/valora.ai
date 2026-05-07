---
updated: 2026-05-07
---

# ADR-015: Executor↔MCP coupling is bidirectional and accepted

> **Decision**: The `executor/` and `mcp/` layers form a co-located orchestration ring. `executor/` may import concrete classes from `mcp/`; `mcp/` may import `executor/` only at type level. The previously-empty arch test now enforces that direction.

## Status

Accepted

## Consequences

### Positive

- **No premature abstraction.** Extracting interface types into `types/mcp-execution.types.ts` and rewriting all `executor/` imports against those interfaces would be invasive (touches `stage-executor.ts`, 1,980 LOC) for a coupling whose direction is in practice always `executor → mcp`. The ADR captures the directional fact instead of paying refactor cost for an abstraction nobody else needs.
- **The arch test stops being a no-op.** The previous body at `__tests__/architecture/circular-dependencies.test.ts:308-315` was empty with a comment that bidirectional was "acceptable". After this ADR the test asserts the *direction*: `mcp/` may not perform any runtime import of `executor/`, only `import type`.
- **Truthful documentation.** The system card and architecture overview can now describe `executor + mcp` as a single orchestration ring rather than implying clean layered separation that the imports do not respect.

### Negative

- **`mcp/` cannot share runtime helpers from `executor/`.** Any helper currently needed at runtime would have to live in `executor/` and be imported there, or move to `utils/`/`types/`. In practice today only `CommandLoader` is referenced and only as a type — no concrete runtime helper crosses the boundary in this direction.
- **Tighter coupling for refactors.** Splitting the orchestration ring later is harder once the ADR endorses the coupling. Mitigation: any new code that wants to push runtime symbols *from* `mcp/` *back* to `executor/` is fine (still in the allowed direction), but any future need for `mcp/` to call `executor/` runtime code triggers reopening this ADR.

### Neutral

- The MCP server entry-point (`bin/mcp.js`, `src/mcp/server.ts`) still composes `executor/` services indirectly via the DI container (`src/di/container.ts`). The DI composition root remains the one place where both layers are wired together at runtime; nothing in this ADR changes that.

## Context

The executor↔MCP boundary review (April 2026, captured in conversation history above this ADR) found:

```
executor/ → mcp/ (runtime imports)
  src/executor/stage-executor.ts:32-37        — 5 concrete class imports + 1 factory
  src/executor/tool-execution.service.ts:55,60 — 2 type-only imports

mcp/ → executor/ (imports)
  src/mcp/tool-registry.ts:12                 — type-only (`CommandLoader`)
  src/mcp/command-discovery.service.ts:5      — type-only
  src/mcp/server.ts:9                         — type-only
```

`mcp/ → executor/` is already 100 % type-only. `executor/ → mcp/` is mostly concrete classes.

Two options were considered:

**Option Y — Full type extraction.** Move shared interfaces into `src/types/mcp-execution.types.ts`. Have both layers import from `types/` only.
- Pro: Strictest separation; no concrete cross-layer dependency.
- Con: Requires rewriting `stage-executor.ts` to inject MCP services through interfaces and the DI container. Touches a 1,980-LOC file; high blast radius.
- Pro/con assessment: ~25 % of the imports are already type-only; ~75 % are concrete. The ratio of work-to-benefit is poor.

**Option X — Direction-only enforcement.** Document the bidirectional coupling as deliberate (executor is the orchestration layer; mcp is its tool-protocol adapter), and tighten the arch test to enforce the direction (mcp must remain type-only towards executor, no runtime imports).
- Pro: Minimal change. Reflects the actual architecture (executor coordinates everything; mcp is one of the things it coordinates).
- Pro: Removes the empty test body that gave false signal.
- Con: Codifies the coupling. Future refactors that genuinely want to invert the flow (e.g. mcp owning its own pipeline stage executor) must reopen this ADR.

**Decision: Option X.** The benefit-to-cost ratio of Option Y did not justify rewriting `stage-executor.ts`. The orchestration ring is honest about its shape; the arch test now enforces what is actually true and detects regression.

## Implementation

The arch test at `__tests__/architecture/circular-dependencies.test.ts` is updated (in the same change as this ADR) to enforce the directional rule. See that file's commit message and diff for the exact assertion.

## Verification Summary

Verified 2026-05-07 against `src/executor/stage-executor.ts:32-37`, `src/executor/tool-execution.service.ts:55,60`, `src/mcp/tool-registry.ts:12`, `src/mcp/command-discovery.service.ts:5`, `src/mcp/server.ts:9`, and `__tests__/architecture/circular-dependencies.test.ts`.

- Claims checked: 6 (executor → mcp import count and shape; mcp → executor type-only nature; line numbers; previously-empty test; chosen option).
- Confirmed: 6 — all line-number citations exist; mcp imports against executor are uniformly `import type` declarations; the arch test body was empty pre-change.
- Unverifiable: 0
