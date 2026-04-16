# Data Flow Architecture

> Data flow, state management, and integration patterns in VALORA.

## Primary Data Flows

### 1. Command Execution Flow

```mermaid
flowchart TD
    subgraph Input
        A[User Input] --> B[CLI Parser]
    end

    subgraph Resolution
        B --> C[Command Resolver]
        C --> D{Valid Command?}
        D -->|No| E[Error Handler]
        D -->|Yes| F[Load Specification]
    end

    subgraph Preparation
        F --> G[Load Session Context]
        G --> H[Select Agent]
        H --> I[Assemble Prompt]
    end

    subgraph Execution
        I --> J[Pipeline Executor]
        J --> K[Stage Executor]
        K --> L[LLM Provider]
    end

    subgraph Output
        L --> M[Response Processing]
        M --> N[Session Update]
        N --> O[Output Formatting]
        O --> P[User Display]
    end

    E --> P
```

### 2. Pipeline Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Resolver
    participant Pipeline
    participant Agent
    participant LLM
    participant Session

    User->>CLI: valora plan "feature"
    CLI->>Resolver: resolveCommand("plan")
    Resolver-->>CLI: CommandSpec
    CLI->>Pipeline: execute(spec, args)
    Pipeline->>Session: loadContext()
    Session-->>Pipeline: context
    Pipeline->>Agent: selectAgent(task)
    Agent-->>Pipeline: @lead
    Pipeline->>LLM: sendPrompt(prompt)
    LLM-->>Pipeline: response
    Pipeline->>Session: saveOutput()
    Pipeline-->>CLI: result
    CLI-->>User: formatted output
```

### 3. LLM Request Flow

```mermaid
sequenceDiagram
    participant Executor
    participant Registry
    participant Provider
    participant API

    Executor->>Registry: getProvider(name)
    Registry-->>Executor: provider
    Executor->>Provider: sendPrompt(prompt, options)
    Provider->>Provider: applyCacheBreakpoints(params)
    Provider->>API: HTTP POST (with cache_control markers)
    API-->>Provider: response (incl. cache metrics)
    Provider->>Provider: extractUsage(response)
    Provider-->>Executor: LLMResponse {usage: {cache_read, cache_write, ...}}
```

Prompt caching reduces input token costs across tool-loop iterations. Each provider applies its own caching strategy:

- **Anthropic**: Injects `cache_control: { type: "ephemeral" }` breakpoints on system prompt, tools, and last user message (when `prompt_caching: true`)
- **OpenAI**: Automatic caching — extracts `cached_tokens` from `prompt_tokens_details`
- **Google**: Automatic caching — extracts `cachedContentTokenCount` from `usageMetadata`

Cache metrics are normalised into `LLMUsage.cache_creation_input_tokens` and `LLMUsage.cache_read_input_tokens`. For caching implementation detail, see [Session Optimisation](./session-optimization.md).

### 4. Terminal Output Compression

Before tool results are assembled into the LLM context, `compressTerminalOutput()` in `src/executor/output-compression.service.ts` reduces their token footprint through a three-step pipeline:

| Step                 | Mechanism                                                                                                    | Applied when                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| ANSI strip           | Removes colour codes and cursor-movement sequences                                                           | Always                                      |
| Per-command filter   | Content-aware noise reduction keyed on the executable (`git`, `tsc`, `eslint`, `jest`/`vitest`, `pnpm`)      | Output above `OUTPUT_COMPRESSION_THRESHOLD` |
| Head+tail truncation | Keeps the first 80 % (command context) and last 20 % (errors and summary) within `MAX_TERMINAL_OUTPUT_CHARS` | Always                                      |

Short outputs below `OUTPUT_COMPRESSION_THRESHOLD` pass through after ANSI stripping only. The full filter table is in [Orchestration Components](./components.md#orchestration-components).

### 5. MCP Integration Flow

```mermaid
sequenceDiagram
    participant Cursor
    participant MCPServer
    participant ToolHandler
    participant Engine
    participant LLM

    Cursor->>MCPServer: ListTools
    MCPServer-->>Cursor: [ai_plan, ai_implement, ...]

    Cursor->>MCPServer: CallTool(ai_plan, args)
    MCPServer->>ToolHandler: handle(ai_plan, args)
    ToolHandler->>Engine: execute(plan, args)
    Engine->>LLM: sendPrompt()
    LLM-->>Engine: response
    Engine-->>ToolHandler: result
    ToolHandler-->>MCPServer: ToolResult
    MCPServer-->>Cursor: response
```

### 6. Interactive Clarification Flow

When commands require user input to resolve ambiguities, the pipeline pauses for interactive clarification:

```mermaid
sequenceDiagram
    participant Pipeline
    participant Stage
    participant Clarifier
    participant User
    participant Document

    Pipeline->>Stage: Execute analysis stage
    Stage-->>Pipeline: clarifying_questions[]

    alt Has Questions
        Pipeline->>Clarifier: Present questions (P0→P1→P2)
        Clarifier->>User: Display options
        User-->>Clarifier: Select/provide answers
        Clarifier-->>Pipeline: answers, summary
        Pipeline->>Document: Apply clarifications
        Document-->>Pipeline: Updated with User Clarifications section
    else No Questions
        Pipeline->>Document: Proceed without pause
    end
```

<details>
<summary><strong>Clarification Data Structures</strong></summary>

```typescript
interface ClarifyingQuestion {
	id: string;
	question: string;
	options: string[];
	priority: 'P0' | 'P1' | 'P2';
	context?: string;
	affects_sections: string[];
}

interface UserAnswer {
	question: string;
	answer: string | null;
	selected_option?: number;
	was_custom: boolean;
	skipped: boolean;
	priority: string;
	affects_sections: string[];
}

interface ClarificationOutput {
	answers: Record<string, UserAnswer>;
	summary: string; // Formatted markdown for document inclusion
	questions_answered: number;
	questions_skipped: number;
}
```

</details>

---

## State Management

### Session State

```typescript
interface SessionState {
	// Identity
	id: string;
	createdAt: Date;
	updatedAt: Date;

	// Context
	context: {
		currentTask?: Task;
		currentPlan?: Plan;
		knowledgeBase: KnowledgeItem[];
		history: HistoryEntry[];
	};

	// Outputs
	outputs: Map<string, CommandOutput>;

	// Metadata
	metadata: {
		commandCount: number;
		lastCommand: string;
		totalTokens: number;
	};
}
```

### Session Data Flow

```mermaid
flowchart LR
    subgraph Command
        A[Command Start] --> B[Load Session]
        B --> C[Execute]
        C --> D[Capture Output]
        D --> E[Update Session]
        E --> F[Persist]
    end

    subgraph Storage
        G[(Session File)] --> B
        F --> G
    end

    subgraph Context
        H[Previous Outputs] --> C
        D --> I[Context Aggregation]
        I --> H
    end
```

### Context Propagation

```mermaid
flowchart TD
    subgraph Session
        A[Session Context]
    end

    subgraph Command1
        B[plan command]
        C[Plan Output]
    end

    subgraph Command2
        D[implement command]
        E[Implementation Output]
    end

    subgraph Command3
        F[review-code command]
        G[Review Output]
    end

    A --> B
    C --> A
    A --> D
    E --> A
    A --> F
    G --> A

    C -.->|Available to| D
    C -.->|Available to| F
    E -.->|Available to| F
```

---

## Data Persistence

### File Structure

```plaintext
.valora/
├── sessions/
│   ├── session-abc123.json
│   └── session-def456.json
├── logs/
│   ├── <date>.log
│   └── latest.log -> <date>.log
├── batches/
│   └── <localId>.json
├── index/               ← AST symbol index (sharded JSON)
│   ├── manifest.json
│   ├── files.json
│   └── symbols-*.json
├── memory/              ← Agent memory stores (biologically-inspired decay)
│   ├── episodic.json    #   7-day half-life events and observations
│   ├── semantic.json    #   30-day half-life extracted patterns and insights
│   └── decisions.json   #   21-day half-life architectural decisions
└── spending.jsonl        ← append-only per-request cost ledger
```

### spending.jsonl Record Format

```json
{
	"id": "1741609384000-review",
	"command": "review",
	"stage": "context+analysis+synthesis",
	"model": "claude-3-5-sonnet-latest",
	"promptTokens": 29817,
	"completionTokens": 19063,
	"cacheReadTokens": 12000,
	"cacheWriteTokens": 0,
	"totalTokens": 48880,
	"costUsd": 0.0124,
	"cacheSavingsUsd": 0.0036,
	"durationMs": 3200,
	"timestamp": "2026-03-10T14:23:01.000Z",
	"batchDiscounted": false
}
```

### Session File Format

```json
{
	"id": "session-abc123",
	"createdAt": "...",
	"updatedAt": "...",
	"context": {
		"currentTask": {},
		"history": []
	},
	"outputs": {
		"plan": {},
		"implement": {}
	},
	"metadata": {
		"commandCount": 5,
		"lastCommand": "review-code",
		"totalTokens": 15000
	}
}
```

---

## What's Cached

| Data Type         | Cache Location        | TTL                |
| ----------------- | --------------------- | ------------------ |
| Agent definitions | Memory                | Session lifetime   |
| Command specs     | Memory                | Session lifetime   |
| Prompt templates  | Memory                | Session lifetime   |
| Configuration     | Memory                | Until reload       |
| Session data      | File                  | Configurable       |
| LLM prompt tokens | Provider-side (API)   | ~5 minutes         |
| LLM responses     | None                  | Not cached         |
| AST symbol index  | File (.valora/index/) | Until file changes |

LLM prompt token caching is handled server-side by the provider APIs — the provider injects cache markers in the request and extracts cache metrics from the response. For the full caching implementation, see [Session Optimisation](./session-optimization.md).

---

## Metrics and Observability

| Metric                 | Type      | Description                                                |
| ---------------------- | --------- | ---------------------------------------------------------- |
| command_duration       | Histogram | Command execution time                                     |
| llm_request_duration   | Histogram | LLM API latency                                            |
| session_count          | Gauge     | Active sessions                                            |
| error_count            | Counter   | Errors by type                                             |
| token_usage            | Counter   | Tokens consumed                                            |
| cache_read_tokens      | Counter   | Tokens read from prompt cache                              |
| cache_write_tokens     | Counter   | Tokens written to prompt cache                             |
| cost_usd               | Ledger    | Per-request USD cost (spending.jsonl)                      |
| cache_savings_usd      | Ledger    | Per-request cache savings (spending.jsonl)                 |
| memory:created         | Event     | New memory entry created from feedback output              |
| memory:accessed        | Event     | Memory entry accessed; half-life extended by boost days    |
| memory:pruned          | Event     | Entry removed; strength fell below `prune_threshold`       |
| memory:promoted        | Event     | Episodic entry promoted to semantic store                  |
| memory:stale           | Event     | Entry confidence downgraded to `stale`                     |
| consolidation:complete | Event     | Full consolidation cycle finished (pruned/merged/promoted) |

### Log Structure

```json
{
	"timestamp": "...",
	"level": "info",
	"component": "executor",
	"message": "Pipeline execution started",
	"context": {
		"command": "plan",
		"sessionId": "abc123",
		"agent": "lead"
	}
}
```

---

## Integration Patterns

<details>
<summary><strong>Provider Integration, GitHub Integration, and Concurrency Patterns</strong></summary>

### Provider Integration

```mermaid
flowchart TD
    subgraph Engine
        A[LLM Layer]
        B[Provider Registry]
        C[Provider Interface]
    end

    subgraph Providers
        D[Anthropic Provider]
        E[OpenAI Provider]
        F[Google Provider]
        G[Cursor Provider]
    end

    subgraph External
        H[Anthropic API]
        I[OpenAI API]
        J[Google API]
        K[Cursor MCP]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    C --> G
    D --> H
    E --> I
    F --> J
    G --> K
```

### GitHub Integration

```mermaid
sequenceDiagram
    participant Engine
    participant GitHelper
    participant GitHub

    Engine->>GitHelper: createPR(options)
    GitHelper->>GitHub: gh api /repos/{}/pulls
    GitHub-->>GitHelper: PR created
    GitHelper->>GitHub: gh api /repos/{}/issues/{}/labels
    GitHub-->>GitHelper: Labels added
    GitHelper->>GitHub: gh api /repos/{}/pulls/{}/reviewers
    GitHub-->>GitHelper: Reviewers assigned
    GitHelper-->>Engine: PRResult
```

### Parallel Stage Execution

```mermaid
flowchart TD
    subgraph Pipeline
        A[Start]
        B[Sequential Stage 1]
        C{Parallel Block}
        D[Stage 2a]
        E[Stage 2b]
        F[Stage 2c]
        G{Sync Point}
        H[Sequential Stage 3]
        I[End]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    D --> G
    E --> G
    F --> G
    G --> H
    H --> I
```

### Resource Locking

```mermaid
sequenceDiagram
    participant Pipeline1
    participant Lock
    participant Resource
    participant Pipeline2

    Pipeline1->>Lock: acquire(session)
    Lock-->>Pipeline1: granted
    Pipeline1->>Resource: write()
    Pipeline2->>Lock: acquire(session)
    Lock-->>Pipeline2: wait
    Pipeline1->>Resource: write()
    Pipeline1->>Lock: release()
    Lock-->>Pipeline2: granted
    Pipeline2->>Resource: write()
    Pipeline2->>Lock: release()
```

</details>

<details>
<summary><strong>Error Propagation</strong></summary>

```mermaid
flowchart TD
    subgraph Source
        A[LLM API Error]
        B[Validation Error]
        C[File System Error]
        D[Configuration Error]
    end

    subgraph Handler
        E[Error Wrapper]
        F[Error Classification]
    end

    subgraph Response
        G[User Message]
        H[Log Entry]
        I[Recovery Action]
    end

    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    F --> G
    F --> H
    F --> I
```

</details>
