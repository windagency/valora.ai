# Component Architecture

> Detailed component-level architecture of VALORA.

## Overview

This document provides component-level design details for each major module in the engine.

## CLI Components

```mermaid
C4Component
    title Component Diagram - CLI Layer

    Container_Boundary(cli, "CLI Layer") {
        Component(parser, "Command Parser", "Commander.js", "Parses CLI arguments")
        Component(resolver, "Command Resolver", "TypeScript", "Resolves command specs")
        Component(executor, "Command Executor", "TypeScript", "Executes commands")
        Component(wizard, "Command Wizard", "Inquirer.js", "Interactive prompts")
        Component(presenter, "Result Presenter", "TypeScript", "Formats output")
        Component(handler, "Error Handler", "TypeScript", "Handles errors")
        Component(adapter, "Commander Adapter", "TypeScript", "Adapts Commander.js")
    }

    Rel(parser, resolver, "Resolves")
    Rel(resolver, executor, "Executes")
    Rel(executor, wizard, "May invoke")
    Rel(executor, presenter, "Presents")
    Rel(executor, handler, "Catches")
    Rel(parser, adapter, "Uses")
```

### Component Descriptions

| Component         | File                       | Responsibility                            |
| ----------------- | -------------------------- | ----------------------------------------- |
| Command Parser    | `index.ts`                 | Entry point, sets up Commander.js         |
| Command Resolver  | `command-resolver.ts`      | Loads and resolves command specifications |
| Command Executor  | `command-executor.ts`      | Orchestrates command execution            |
| Command Wizard    | `command-wizard.ts`        | Interactive command configuration         |
| Result Presenter  | `result-presenter.ts`      | Formats and displays results              |
| Error Handler     | `command-error-handler.ts` | Converts errors to user messages          |
| Commander Adapter | `commander-adapter.ts`     | Abstracts Commander.js                    |

---

## Executor Components

```mermaid
C4Component
    title Component Diagram - Executor Layer

    Container_Boundary(exec, "Executor Layer") {
        Component(pipeline, "Pipeline", "TypeScript", "Orchestrates execution")
        Component(stage, "Stage Executor", "TypeScript", "Executes stages")
        Component(context, "Execution Context", "TypeScript", "Maintains state")
        Component(scheduler, "Stage Scheduler", "TypeScript", "Schedules stages")
        Component(validator, "Pipeline Validator", "TypeScript", "Validates pipelines")
        Component(variables, "Variable Resolver", "TypeScript", "Resolves variables")
        Component(events, "Pipeline Events", "TypeScript", "Event emission")
        Component(strategy, "Execution Strategy", "TypeScript", "Strategy patterns")
    }

    Rel(pipeline, scheduler, "Schedules")
    Rel(scheduler, stage, "Executes")
    Rel(stage, context, "Updates")
    Rel(pipeline, validator, "Validates")
    Rel(stage, variables, "Resolves")
    Rel(pipeline, events, "Emits")
    Rel(pipeline, strategy, "Uses")
```

### Pipeline Execution Flow

```mermaid
stateDiagram-v2
    [*] --> Initialising
    Initialising --> Validating
    Validating --> Loading
    Loading --> Executing
    Executing --> StageExecution
    StageExecution --> Executing: More stages
    StageExecution --> Completing: No more
    Completing --> [*]

    Validating --> Failed: Invalid
    Executing --> Failed: Error
    Failed --> [*]
```

### Component Descriptions

| Component          | File                             | Responsibility                  |
| ------------------ | -------------------------------- | ------------------------------- |
| Pipeline           | `pipeline.ts`                    | Main orchestration logic        |
| Stage Executor     | `stage-executor.ts`              | Execute individual stages       |
| Execution Context  | `execution-context.ts`           | State container                 |
| Stage Scheduler    | `stage-scheduler.ts`             | Schedule parallel/sequential    |
| Pipeline Validator | `pipeline-validator.ts`          | Validate pipeline structure     |
| Variable Resolver  | `variable-resolution.service.ts` | Template variable resolution    |
| Pipeline Events    | `pipeline-events.ts`             | Event definitions and emission  |
| Execution Strategy | `execution-strategy.ts`          | Strategy pattern implementation |

---

## Agent Components

```mermaid
C4Component
    title Component Diagram - Agent Layer

    Container_Boundary(agent, "Agent Layer") {
        Component(registry, "Agent Registry", "TypeScript", "Stores agent definitions")
        Component(loader, "Agent Loader", "TypeScript", "Loads from files")
        Component(selector, "Agent Selector", "TypeScript", "Dynamic selection")
        Component(discovery, "Command Discovery", "TypeScript", "Discovers commands")
        Component(cmd_loader, "Command Loader", "TypeScript", "Loads command specs")
        Component(prompt_loader, "Prompt Loader", "TypeScript", "Loads prompts")
    }

    Rel(registry, loader, "Loads via")
    Rel(selector, registry, "Queries")
    Rel(discovery, cmd_loader, "Uses")
    Rel(cmd_loader, prompt_loader, "Uses")
```

### Agent Selection Algorithm

```mermaid
flowchart TD
    A[Task Input] --> B[Analyse Task Description]
    B --> C[Identify Affected Files]
    C --> D[Match File Patterns]
    D --> E[Score Agents]
    E --> F{Single Best?}
    F -->|Yes| G[Select Agent]
    F -->|No| H[Apply Priority Rules]
    H --> G
    G --> I[Return Selected Agent]
```

### Component Descriptions

| Component         | File                    | Responsibility              |
| ----------------- | ----------------------- | --------------------------- |
| Agent Registry    | Part of config          | Agent capability storage    |
| Agent Loader      | `agent-loader.ts`       | Load agent markdown files   |
| Agent Selector    | Dynamic selection logic | Select best agent for task  |
| Command Discovery | `command-discovery.ts`  | Discover available commands |
| Command Loader    | `command-loader.ts`     | Load command specifications |
| Prompt Loader     | `prompt-loader.ts`      | Load prompt templates       |

---

## LLM Components

```mermaid
C4Component
    title Component Diagram - LLM Layer

    Container_Boundary(llm, "LLM Layer") {
        Component(registry, "Provider Registry", "TypeScript", "Manages providers")
        Component(interface, "Provider Interface", "TypeScript", "Contract definition")
        Component(anthropic, "Anthropic Provider", "TypeScript", "Claude integration")
        Component(openai, "OpenAI Provider", "TypeScript", "GPT integration")
        Component(google, "Google Provider", "TypeScript", "Gemini integration")
        Component(cursor, "Cursor Provider", "TypeScript", "Cursor integration")
    }

    Rel(registry, interface, "Implements")
    Rel(anthropic, interface, "Implements")
    Rel(openai, interface, "Implements")
    Rel(google, interface, "Implements")
    Rel(cursor, interface, "Implements")
```

### Provider Interface

```typescript
interface LLMProvider {
	readonly name: string;
	readonly displayName: string;

	sendPrompt(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

	sendStreamingPrompt(prompt: string, options?: LLMOptions): AsyncGenerator<string>;

	isConfigured(): boolean;
	getModel(): string;
	getCapabilities(): ProviderCapabilities;
}
```

### Prompt Caching

All providers extract cache metrics into the normalised `LLMUsage` type (`cache_creation_input_tokens`, `cache_read_input_tokens`). The CLI displays cache hit rates and cost savings when these fields are present.

| Provider      | Mechanism                                                               | Config Flag            |
| ------------- | ----------------------------------------------------------------------- | ---------------------- |
| **Anthropic** | Explicit `cache_control` breakpoints (system, tools, last user message) | `prompt_caching: true` |
| **OpenAI**    | Automatic — reads `prompt_tokens_details.cached_tokens`                 | None needed            |
| **Google**    | Automatic — reads `usageMetadata.cachedContentTokenCount`               | None needed            |

### Cost Tracking

Cost information flows through three layers:

1. **Live display** — `ProcessingFeedback` (`src/output/processing-feedback.ts`) calls `calculateActualCost()` on each `LLM_RESPONSE` event and accumulates an `estimatedCostUsd` total. This total is appended to the context-insights status bar (`~$0.xxxx`) and to each stage-completion line.

2. **Final summary** — `ResultPresenter` (`src/cli/result-presenter.ts`) receives `costUsd` and `cacheSavingsUsd` from the executor and appends them to the "Token Usage" block printed at the end of every command:

   ```
   📊 Token Usage:
      • This interaction: 48,880 tokens (~$0.0124)
        └─ Cache read: 12,000 tokens (25% hit rate, saved $0.0036)
   ```

3. **Persistent ledger** — `SpendingTracker` (`src/utils/spending-tracker.ts`) appends one `SpendingRecord` to `.valora/spending.jsonl` after each command. The ledger is queried by `valora monitoring spending` and by the dashboard Spending panel.

| Component       | File                        | Responsibility                                      |
| --------------- | --------------------------- | --------------------------------------------------- |
| SpendingTracker | `utils/spending-tracker.ts` | Append-only JSONL ledger; query by endpoint or date |
| TokenEstimator  | `utils/token-estimator.ts`  | `calculateActualCost()` — pricing for all providers |

### Provider Selection Flow

```mermaid
flowchart TD
    A[Request] --> B{Provider Specified?}
    B -->|Yes| C[Use Specified]
    B -->|No| D[Use Default]
    C --> E{Is Configured?}
    D --> E
    E -->|Yes| F[Execute Request]
    E -->|No| G{Fallback Available?}
    G -->|Yes| H[Use Fallback]
    G -->|No| I[Throw Error]
    H --> F
```

---

## Exploration Components

```mermaid
C4Component
    title Component Diagram - Exploration Layer

    Container_Boundary(explore, "Exploration Layer") {
        Component(orchestrator, "Orchestrator", "TypeScript", "Main coordination")
        Component(collab, "Collaboration Coordinator", "TypeScript", "Agent collaboration")
        Component(container, "Container Manager", "TypeScript", "Isolation management")
        Component(worktree, "Worktree Manager", "TypeScript", "Git worktrees")
        Component(merge, "Merge Orchestrator", "TypeScript", "Result merging")
        Component(comparator, "Result Comparator", "TypeScript", "Compare outputs")
        Component(safety, "Safety Validator", "TypeScript", "Validate safety")
        Component(state, "Exploration State", "TypeScript", "State tracking")
    }

    Rel(orchestrator, collab, "Coordinates")
    Rel(collab, container, "Uses")
    Rel(container, worktree, "Uses")
    Rel(orchestrator, merge, "Merges")
    Rel(merge, comparator, "Compares")
    Rel(merge, safety, "Validates")
    Rel(orchestrator, state, "Tracks")
```

### Exploration Component Descriptions

| Component                 | File                           | Responsibility                                    |
| ------------------------- | ------------------------------ | ------------------------------------------------- |
| Orchestrator              | `orchestrator.ts`              | Main exploration coordination                     |
| Collaboration Coordinator | `collaboration-coordinator.ts` | Agent collaboration management                    |
| Container Manager         | `container-manager.ts`         | Docker container isolation                        |
| Worktree Manager          | `worktree-manager.ts`          | Git worktree CRUD operations                      |
| Merge Orchestrator        | `merge-orchestrator.ts`        | Result merging strategies                         |
| Result Comparator         | `result-comparator.ts`         | Compare outputs across branches                   |
| Safety Validator          | `safety-validator.ts`          | Pre-exploration safety checks (1GB/branch memory) |
| Exploration State         | `exploration-state.ts`         | State persistence, recovery, and session linking  |
| Exploration Events        | `exploration-events.ts`        | Real-time event emitter for dashboard monitoring  |

### Dashboard Integration

The exploration layer integrates with the main dashboard (`valora dash`) through three mechanisms:

1. **Worktree Diagram Panel**: The dashboard fetches `WorktreeManager.listWorktrees()` and `ExplorationStateManager.getActiveExplorations()` in parallel, transforming them into a live tree-diagram showing all git worktrees with exploration status indicators.

2. **Exploration Info Panel**: When viewing a session that is linked to an exploration, the `ExplorationInfoPanel` component loads the exploration data (via `ExplorationStateManager.findBySessionId()`) and displays the task, status, branch completion, and per-worktree details. This works even while the exploration is still running, since the `session_id` is stored on the `Exploration` object immediately after creation.

3. **Worktree Stats Tracking**: The `WorktreeStatsTracker` (in `src/session/`) subscribes to `ExplorationEventEmitter` events and accumulates per-session statistics, which are displayed in the session details view.

4. **Spending Panel**: The session details view has a **Spending** sub-tab (`SpendingPanel` in `src/ui/dashboard/detail-panels/spending-panel.tsx`) that queries `SpendingTracker` filtered to `session.created_at`. It displays session-scoped total cost, cache savings, a per-command cost bar chart, and the top 5 most expensive requests.

### Session-Exploration Linking

Explorations and sessions are bidirectionally linked:

- The `Exploration` type has a `session_id` field, set by the orchestrator immediately after the exploration is created
- Each `WorktreeExploration` also stores the `session_id`
- The session context stores `exploration_id` after the exploration completes
- `ExplorationStateManager.findBySessionId()` enables reverse lookup from session to exploration

### Parallel Exploration Flow

```mermaid
sequenceDiagram
    participant User
    participant Orchestrator
    participant Agent1
    participant Agent2
    participant Merger

    User->>Orchestrator: explore(task)
    Orchestrator->>Agent1: explore(task, approach1)
    Orchestrator->>Agent2: explore(task, approach2)
    Agent1-->>Orchestrator: result1
    Agent2-->>Orchestrator: result2
    Orchestrator->>Merger: merge(result1, result2)
    Merger-->>Orchestrator: mergedResult
    Orchestrator-->>User: finalResult
```

---

## Session Components

```mermaid
C4Component
    title Component Diagram - Session Layer

    Container_Boundary(session, "Session Layer") {
        Component(service, "Session Service", "TypeScript", "Session operations")
        Component(repository, "Session Repository", "TypeScript", "File persistence")
        Component(types, "Session Types", "TypeScript", "Type definitions")
        Component(worktree_tracker, "Worktree Stats Tracker", "TypeScript", "Worktree usage statistics")
    }

    Container_Boundary(exploration, "Exploration Layer") {
        Component(events, "Exploration Events", "TypeScript", "Event emitter")
    }

    ContainerDb(store, "Session Files", "JSON", "Persistent storage")

    Rel(service, repository, "Uses")
    Rel(repository, store, "Reads/Writes")
    Rel(service, types, "Uses")
    Rel(worktree_tracker, events, "Subscribes to")
    Rel(service, worktree_tracker, "Collects stats from")
```

### Component Descriptions

| Component              | File                         | Responsibility                                           |
| ---------------------- | ---------------------------- | -------------------------------------------------------- |
| Session Service        | `lifecycle.ts`, `context.ts` | Session creation, resumption, and state management       |
| Session Repository     | `store.ts`                   | File-based persistence of session data                   |
| Session Types          | `types/session.types.ts`     | Type definitions (`Session`, `WorktreeUsageStats`, etc.) |
| Worktree Stats Tracker | `worktree-stats-tracker.ts`  | Event-driven worktree usage statistics accumulation      |

### Worktree Stats Tracking

The `WorktreeStatsTracker` subscribes to `ExplorationEventEmitter` and accumulates worktree usage statistics during a session:

| Event                | Action                                                        |
| -------------------- | ------------------------------------------------------------- |
| `worktree:created`   | Increment `total_created`, add to `worktree_summaries`        |
| `worktree:started`   | Track in active map, update `max_concurrent`                  |
| `worktree:completed` | Calculate duration, update `total_duration_ms`, mark complete |
| `worktree:failed`    | Same as completed but with `failed` status                    |

Worktrees that exceed the exploration timeout are marked with `timed_out` status. Timed-out worktrees are not eligible for merging and score 5/40 (status component) in result comparisons.

On session completion, stats are stored into `session.context['worktree_stats']` (only if `total_created > 0`).

### Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: createSession()
    Created --> Active: firstCommand()
    Active --> Active: executeCommand()
    Active --> Suspended: timeout
    Suspended --> Active: resume()
    Active --> Completed: complete()
    Suspended --> Archived: cleanup()
    Completed --> Archived: cleanup()
    Archived --> [*]
```

---

## MCP Components

```mermaid
C4Component
    title Component Diagram - MCP Layer

    Container_Boundary(mcp, "MCP Layer") {
        Component(server, "MCP Server", "TypeScript", "Protocol server")
        Component(tool_handler, "Tool Handler", "TypeScript", "Tool execution")
        Component(prompt_handler, "Prompt Handler", "TypeScript", "Prompt handling")
        Component(context, "Request Context", "TypeScript", "Request state")
        Component(session_svc, "Session Service", "TypeScript", "MCP sessions")
        Component(health, "Health Service", "TypeScript", "Health checks")
        Component(discovery, "Discovery Service", "TypeScript", "Command discovery")
    }

    Rel(server, tool_handler, "Routes")
    Rel(server, prompt_handler, "Routes")
    Rel(tool_handler, context, "Uses")
    Rel(prompt_handler, context, "Uses")
    Rel(server, session_svc, "Uses")
    Rel(server, health, "Uses")
    Rel(tool_handler, discovery, "Uses")
```

---

## Configuration Components

```mermaid
C4Component
    title Component Diagram - Configuration Layer

    Container_Boundary(config, "Configuration Layer") {
        Component(loader, "Config Loader", "TypeScript", "Load config files")
        Component(schema, "Schema Validator", "Zod", "Validate structure")
        Component(wizard, "Interactive Wizard", "Inquirer.js", "Config wizard")
        Component(providers, "Provider Config", "TypeScript", "Provider settings")
        Component(constants, "Constants", "TypeScript", "Application constants")
        Component(helpers, "Validation Helpers", "TypeScript", "Helper functions")
    }

    ContainerDb(files, "Config Files", "JSON/YAML", "Configuration storage")

    Rel(loader, schema, "Validates")
    Rel(loader, files, "Reads")
    Rel(wizard, loader, "Writes via")
    Rel(loader, providers, "Loads")
    Rel(schema, helpers, "Uses")
```

---

## Context Management Components

```mermaid
C4Component
    title Component Diagram - Context Management Layer

    Container_Boundary(ctx, "Context Management Layer") {
        Component(manager, "Flush Manager", "TypeScript", "Orchestrates flush operations")
        Component(monitor, "Threshold Monitor", "TypeScript", "Monitors token usage")
        Component(summariser, "Summarisation Service", "TypeScript", "Summarises conversations")
        Component(checkpoint, "Checkpoint Service", "TypeScript", "State preservation")
    }

    Rel(manager, monitor, "Checks thresholds")
    Rel(manager, summariser, "Summarises via")
    Rel(manager, checkpoint, "Creates/restores")
    Rel(summariser, checkpoint, "Provides summary to")
```

### Context Flush Flow

```mermaid
sequenceDiagram
    participant Executor
    participant Manager as FlushManager
    participant Monitor as ThresholdMonitor
    participant Summariser as SummarizationService
    participant Checkpoint as CheckpointService

    Executor->>Manager: checkAndFlush(messages, ...)
    Manager->>Monitor: checkThreshold(messages, contextWindow)
    Monitor-->>Manager: {shouldFlush: true, usagePercentage: 85%}
    Manager->>Checkpoint: createCheckpoint(stage, iteration, toolResults)
    Checkpoint-->>Manager: checkpoint
    Manager->>Summariser: summarize(messages, toolResults, stage)
    Summariser-->>Manager: summary
    Manager->>Checkpoint: restoreWithSummary(checkpoint, summary)
    Checkpoint-->>Manager: newMessages
    Manager-->>Executor: {flushed: true, messages: newMessages, tokensSaved: 50000}
```

### Threshold State Machine

```mermaid
stateDiagram-v2
    [*] --> Normal: usage < 50%
    Normal --> Warning: usage >= 50%
    Warning --> Normal: usage < 50%
    Warning --> FlushRequired: usage >= 80%
    FlushRequired --> Flushing: trigger flush
    Flushing --> Normal: flush complete
    FlushRequired --> Critical: usage >= 90%
    Critical --> Flushing: mandatory flush
```

### Component Descriptions

| Component             | File                               | Responsibility                          |
| --------------------- | ---------------------------------- | --------------------------------------- |
| Flush Manager         | `context-flush-manager.ts`         | Orchestrates flush operations           |
| Threshold Monitor     | `context-threshold-monitor.ts`     | Monitors token usage against thresholds |
| Summarisation Service | `context-summarization.service.ts` | Summarises conversation history         |
| Checkpoint Service    | `context-checkpoint.service.ts`    | Creates and restores execution state    |

### Configuration

| Constant                           | Default          | Description                       |
| ---------------------------------- | ---------------- | --------------------------------- |
| `CONTEXT_FLUSH_THRESHOLD`          | 80%              | Trigger automatic flush           |
| `CONTEXT_FLUSH_CRITICAL_THRESHOLD` | 90%              | Mandatory flush                   |
| `CONTEXT_FLUSH_WARNING_THRESHOLD`  | 50%              | Log warning                       |
| `CONTEXT_PRESERVE_TOOL_RESULTS`    | 3                | Tool results to preserve verbatim |
| `CONTEXT_SUMMARIZATION_MODEL`      | claude-haiku-4-5 | Model for summarisation           |
| `CONTEXT_MIN_TOKENS_AFTER_FLUSH`   | 10,000           | Minimum headroom after flush      |

---

## Cross-Cutting Concerns

### Logging

```mermaid
flowchart TD
    subgraph Components
        CLI
        Executor
        LLM
        Session
    end

    subgraph Logging
        Logger[Logger Utility]
        File[File Handler]
        Console[Console Handler]
    end

    CLI --> Logger
    Executor --> Logger
    LLM --> Logger
    Session --> Logger
    Logger --> File
    Logger --> Console
```

### Error Handling

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type}
    B -->|Validation| C[ValidationError]
    B -->|Provider| D[ProviderError]
    B -->|Execution| E[ExecutionError]
    B -->|Config| F[ConfigError]
    C --> G[Error Handler]
    D --> G
    E --> G
    F --> G
    G --> H[User Message]
    G --> I[Log Entry]
```

### Dependency Injection

```mermaid
classDiagram
    class Container {
        +register(token, implementation)
        +resolve(token)
        +singleton(token, implementation)
    }

    class Logger
    class SessionService
    class ConfigLoader
    class LLMRegistry

    Container --> Logger
    Container --> SessionService
    Container --> ConfigLoader
    Container --> LLMRegistry
```
