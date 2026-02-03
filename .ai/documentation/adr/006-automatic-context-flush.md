# ADR-006: Automatic Context Flush and Resume

## Status

Accepted

## Context

LLM conversations have finite context windows (e.g., 200,000 tokens for Claude). When executing complex, multi-stage development workflows with numerous tool calls, the context can fill rapidly. Without automatic management, this leads to:

1. **Context overflow errors** - LLM requests fail when context limits are exceeded
2. **Degraded performance** - LLMs may lose focus on earlier context as windows fill
3. **Manual intervention required** - Users must manually restart or summarise
4. **Lost execution state** - No mechanism to preserve and restore progress

VALORA needs automatic context management to handle long-running operations without user intervention.

## Decision

Implement an automatic context flush and resume system with the following components:

### Architecture

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                    Tool Loop Iteration                       │
├─────────────────────────────────────────────────────────────┤
│  executeLLMIteration() ──> ContextThresholdMonitor          │
│          │                        │                          │
│          │              ┌─────────▼─────────┐               │
│          │              │ Check Threshold   │               │
│          │              │ (>80% = flush)    │               │
│          │              └─────────┬─────────┘               │
│          │                        │                          │
│          │         ┌──────────────┴──────────────┐          │
│          │         │                             │          │
│          │    No Flush                      Flush Required  │
│          │    (continue)                         │          │
│          │                                       ▼          │
│          │                          ┌────────────────────┐  │
│          │                          │ 1. Checkpoint      │  │
│          │                          │ 2. Summarise       │  │
│          │                          │ 3. Reconstruct     │  │
│          │                          └────────────────────┘  │
│          │                                       │          │
│          └───────────────────────────────────────┘          │
│                           │                                  │
│                   Continue with new context                  │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **ContextThresholdMonitor** - Monitors token usage against configurable thresholds
   - Warning threshold (50%) - logs warning
   - Flush threshold (80%) - triggers automatic flush
   - Critical threshold (90%) - mandatory flush with priority

2. **ContextSummarizationService** - Summarises conversation history
   - Uses fast model (Claude Haiku) for cost efficiency
   - Preserves last N tool results verbatim
   - Extracts key decisions for continuity
   - Falls back to heuristic summarisation if LLM unavailable

3. **ContextCheckpointService** - Creates and restores execution state
   - Captures stage, iteration, and accumulated results
   - Enables reconstruction after flush
   - Supports manual checkpoint creation

4. **ContextFlushManager** - Orchestrates the flush process
   - Coordinates threshold monitoring, summarisation, and checkpoints
   - Emits events for observability
   - Provides force flush capability

### Threshold Configuration

| Threshold       | Default       | Purpose                     |
| --------------- | ------------- | --------------------------- |
| Warning         | 50%           | Log advisory, no action     |
| Flush           | 80%           | Trigger automatic flush     |
| Critical        | 90%           | Mandatory immediate flush   |
| Min After Flush | 10,000 tokens | Ensure headroom after flush |

### Token Estimation

Uses character-based estimation with safety buffer:

- ~4 characters per token (configurable)
- 15% safety buffer for estimation inaccuracies
- Uses actual token counts from API when available

## Consequences

### Positive

- **Unattended execution** - Long-running tasks complete without manual intervention
- **Graceful degradation** - Context limits handled smoothly, not catastrophically
- **State preservation** - Execution progress is not lost during flush
- **Observability** - Events emitted for monitoring and debugging
- **Configurability** - Thresholds and behaviour configurable per environment
- **Cost efficiency** - Uses fast, cheap model for summarisation

### Negative

- **Information loss** - Summarisation necessarily loses some detail
- **Additional latency** - Flush operation adds time during execution
- **Complexity** - More moving parts in the execution flow
- **LLM dependency** - Summarisation quality depends on model capability

### Neutral

- **Token estimation** - Estimation may differ from actual counts; safety buffer mitigates this
- **Checkpoint storage** - In-memory by default; persistence optional

## Alternatives Considered

### Alternative 1: Simple Truncation

Drop oldest messages when context fills.

**Rejected because:**

- Loses important context without summarisation
- No preservation of decisions or reasoning
- Execution state not preserved

### Alternative 2: User-Initiated Flush

Require user to manually trigger context flush.

**Rejected because:**

- Requires constant monitoring
- Poor user experience for long operations
- May miss critical thresholds

### Alternative 3: External Context Store

Store full conversation in external database, load relevant portions.

**Rejected because:**

- Significantly more complex implementation
- Requires additional infrastructure
- RAG-style retrieval adds latency and complexity

### Alternative 4: Fixed-Window Summarisation

Summarise at fixed intervals regardless of context usage.

**Rejected because:**

- May summarise unnecessarily (wasting resources)
- May not summarise when actually needed
- Less adaptive to actual usage patterns

## References

- [Context Management Module](../../../src/context-management/)
- [Configuration Constants](../../../src/config/constants.ts)
- [Pipeline Execution Model](./004-pipeline-execution-model.md)
