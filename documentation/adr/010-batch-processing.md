# ADR-010: Async Batch Processing

## Status

Accepted

## Context

LLM provider batch APIs (Anthropic Message Batches, OpenAI Batch API) offer approximately 50% token cost reduction in exchange for asynchronous processing with a 24-hour completion window. For pipeline stages that complete in a single LLM call without tool loops — analysis, review, documentation, summarisation — this is pure savings with no behavioural difference.

VALORA processes many such stages. Without batch support, every execution pays full real-time token prices even when the user does not need an immediate response.

## Decision

We will add an opt-in `--batch` global CLI flag that submits eligible pipeline stages to the provider's batch API. The implementation introduces:

1. A `BatchableProvider` interface that extends `LLMProvider` with five batch-specific methods.
2. A `BatchOrchestrator` that manages the submit → poll → retrieve lifecycle with exponential-backoff polling.
3. A `BatchSession` that persists batch state to `.valora/batches/<localId>.json` so jobs survive process restarts.
4. A `batch-eligibility` helper that gates the batch path on three conditions: the stage opts in (`batch: true`), the `--batch` flag is set, and the provider implements `BatchableProvider`.
5. `valora batch list|status|results|cancel` CLI sub-commands for managing async jobs.

### BatchableProvider Interface

```typescript
interface BatchableProvider extends LLMProvider {
	supportsBatch(): true;
	submitBatch(requests: BatchRequest[]): Promise<BatchSubmission>;
	getBatchStatus(batchId: string): Promise<BatchStatusInfo>;
	getBatchResults(batchId: string): Promise<BatchResult[]>;
	cancelBatch(batchId: string): Promise<void>;
}
```

`isBatchableProvider(provider)` provides a runtime type guard so `StageExecutor` can branch without coupling to concrete provider types.

### Stage Eligibility

A stage is batch-eligible when all three conditions hold:

```typescript
stage.batch === true; // explicit opt-in in command definition
context.flags.batch === true; // user passed --batch
isBatchableProvider(provider); // provider implements the interface
```

If the user passes `--batch` but the stage or provider is ineligible, execution falls back to real-time with a warning log.

### Opted-in stages (initial rollout)

25 stages across 10 commands have `batch: true` set. The selection criterion: all inputs arrive from prior stage outputs — no direct file reads, no tool loops, no interactive prompts, no file writes.

| Command               | Batch stages                                                     | Total stages |
| --------------------- | ---------------------------------------------------------------- | ------------ |
| `review-plan`         | `completeness`, `risks`, `steps`, `tests`, `synthesis`           | 5 of 7       |
| `create-backlog`      | `onboard`, `breakdown`, `review`, `generate`                     | 4 of 5       |
| `generate-docs`       | `generateInfra`, `generateBackend`, `generateFrontend`, `review` | 4 of 7       |
| `create-prd`          | `onboard`, `documentation`, `review`                             | 3 of 5       |
| `plan-implementation` | `risks`, `breakdown`                                             | 2 of 4       |
| `refine-specs`        | `onboard`, `review`                                              | 2 of 5       |
| `refine-task`         | `analyze`, `review`                                              | 2 of 6       |
| `review-code`         | `documentation`                                                  | 1 of 3       |
| `review-functional`   | `documentation`                                                  | 1 of 3       |
| `plan-architecture`   | `architecture`                                                   | 1 of 3       |

Stages not opted in (by design): any `context`/`load`/`execute`/`persist`/`apply` stage, `user_answers` stages, and stages whose prompts are documented to use `codebase_search` (e.g. `review.validate-technical-feasibility`).

### Batch Execution Path in StageExecutor

When a stage is eligible, `executeStage()` bypasses the tool loop:

1. `MessageBuilderService` builds messages exactly as for real-time execution.
2. The messages are wrapped in a `BatchRequest` with a content-hash ID for idempotency.
3. `BatchOrchestrator.submit()` submits to the provider and persists state.
4. `StageOutput` is returned with `{ batchPending: true, batchId, localId }` — the pipeline does not block.

### Provider Implementations

| Provider      | Mechanism                                                           | `supportsBatch()` |
| ------------- | ------------------------------------------------------------------- | ----------------- |
| **Anthropic** | `client.beta.messages.batches.create()` / `.results()` (async iter) | `true`            |
| **OpenAI**    | JSONL upload → `client.batches.create()` → download output file     | `true`            |
| **Google**    | Vertex AI `BatchPredictionJob` — stub, not yet implemented          | `false`           |
| **Cursor**    | MCP sampling only — no batch API                                    | N/A               |

## Consequences

### Positive

- **~50% token cost reduction** for batch-eligible stages on Anthropic and OpenAI.
- **Zero behavioural change** for stages that do not opt in or do not pass `--batch`.
- **Resilient** — batch state survives process restarts via file persistence.
- **Graceful fallback** — ineligible stages silently use real-time execution.
- **Additive** — no existing provider interfaces or command definitions changed (only new optional fields added).

### Negative

- **Async UX**: Results are not available immediately; users must poll or wait.
- **24-hour window**: Expired batches cannot be retrieved.
- **Google batch not implemented**: Vertex AI `BatchPredictionJob` requires `@google-cloud/aiplatform` and GCS setup; deferred.
- **Anthropic Vertex AI limitation**: The Anthropic Message Batches API is unavailable on Vertex AI; `submitBatch()` throws if a Vertex-hosted Anthropic configuration is detected.

### Neutral

- One new `batch?: boolean` field on `PipelineStage` — purely additive.
- One new `batch_discount_applied?: boolean` field on `LLMUsage` — purely additive.
- New `src/batch/` module with its own alias in tsconfig and vitest configs.

## Alternatives Considered

### Alternative 1: Polling wrapper around real-time calls

Simulate batch behaviour by queuing real-time calls with a delay.

**Rejected because** it provides no cost reduction — the benefit comes entirely from the provider's batch discount.

### Alternative 2: Separate batch-only command variants

Create duplicate commands (e.g., `review-code-batch`) that always use batch mode.

**Rejected because** it doubles the command surface area. An opt-in flag on the existing commands is simpler and composable.

### Alternative 3: Automatic batch detection (no `batch: true` stage flag)

Automatically submit any single-call stage to the batch API when `--batch` is passed.

**Rejected because** some stages that appear single-call may grow tool loops in future; explicit opt-in prevents surprises and makes intent clear in command definitions.

## References

- [BatchableProvider interface](../../src/batch/batch-provider.interface.ts)
- [BatchOrchestrator](../../src/batch/batch-orchestrator.ts)
- [Anthropic batch provider](../../src/batch/providers/anthropic.batch-provider.ts)
- [OpenAI batch provider](../../src/batch/providers/openai.batch-provider.ts)
- [Batch CLI command](../../src/cli/commands/batch.command.ts)
- [ADR-005: LLM Provider Abstraction](./005-llm-provider-abstraction.md)
- [ADR-007: Persistent Stage Output Caching](./007-persistent-stage-output-caching.md)
