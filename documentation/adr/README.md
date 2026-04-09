# Architecture Decision Records

> Documentation of key architectural decisions for Valora.

## Overview

Architecture Decision Records (ADRs) capture important architectural decisions made during the development of Valora. Each ADR describes the context, decision, and consequences of a significant technical choice.

## ADR Index

| ID                                                                 | Title                                              | Status   | Date    |
| ------------------------------------------------------------------ | -------------------------------------------------- | -------- | ------- |
| [001](./001-multi-agent-architecture.md)                           | Multi-Agent Architecture                           | Accepted | 2024-07 |
| [002](./002-three-tier-execution.md)                               | Three-Tier Execution Model                         | Accepted | 2024-08 |
| [002](./002-guidance-vs-knowledge-separation.md)                   | Guidance vs Knowledge Separation                   | Accepted | 2024-08 |
| [003](./003-session-based-state.md)                                | Session-Based State Management                     | Accepted | 2024-08 |
| [004](./004-pipeline-execution-model.md)                           | Pipeline Execution Model                           | Accepted | 2024-09 |
| [005](./005-llm-provider-abstraction.md)                           | LLM Provider Abstraction                           | Accepted | 2024-09 |
| [006](./006-automatic-context-flush.md)                            | Automatic Context Flush and Resume                 | Accepted | 2026-01 |
| [007](./007-persistent-stage-output-caching.md)                    | Persistent Stage Output Caching                    | Accepted | 2026-01 |
| [008](./008-pretooluse-cli-enforcement.md)                         | PreToolUse CLI Enforcement                         | Accepted | 2026-02 |
| [009](./009-supply-chain-hardening.md)                             | Supply Chain Hardening                             | Accepted | 2026-03 |
| [010](./010-batch-processing.md)                                   | Async Batch Processing                             | Accepted | 2026-03 |
| [010](./010-pipeline-resilience-and-tool-failure-observability.md) | Pipeline Resilience and Tool-Failure Observability | Accepted | 2026-03 |
| [011](./011-biologically-inspired-memory.md)                       | Biologically-Inspired Agent Memory System          | Accepted | 2026-04 |

> **Note on duplicate numbers**: ADR numbers 002 and 010 each have two files. This occurred because separate decisions were recorded under the same sequence number before a numbering correction was made. Both files under each duplicate number are valid, accepted decisions. When creating new ADRs, use the next available number after 010 (i.e., start at 011).

## ADR Status

| Status         | Meaning                       |
| -------------- | ----------------------------- |
| **Proposed**   | Under discussion              |
| **Accepted**   | Decision made and implemented |
| **Deprecated** | No longer valid               |
| **Superseded** | Replaced by another ADR       |

## ADR Template

When creating a new ADR, use this template:

```markdown
# ADR-NNN: Title

> **Decision**: [One sentence describing what was decided]

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive

- Benefit 1
- Benefit 2

### Negative

- Drawback 1
- Drawback 2

### Neutral

- Trade-off 1
- Trade-off 2

## Alternatives Considered

### Alternative 1

Description and why it was rejected.

### Alternative 2

Description and why it was rejected.

## References

- Link to relevant documentation
- Link to related issues or PRs
```

## Creating a New ADR

1. Copy the template above
2. Create a new file: `NNN-descriptive-title.md` (start at `011-`)
3. Fill in all sections, including the one-sentence decision summary
4. Submit for review
5. Update this index

## Related Documentation

- [Architecture Overview](../architecture/README.md)
- [System Architecture](../architecture/system-architecture.md)
- [Component Architecture](../architecture/components.md)
