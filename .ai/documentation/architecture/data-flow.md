# Data Flow Architecture

> Data flow, state management, and integration patterns in VALORA.

## Overview

This document describes how data flows through the system, how state is managed, and how different components integrate.

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

### 2. Session Data Flow

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

### 3. Interactive Clarification Flow

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

**Key Data Structures:**

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
  summary: string;  // Formatted markdown for document inclusion
  questions_answered: number;
  questions_skipped: number;
}
```

### 4. LLM Request Flow

```mermaid
sequenceDiagram
    participant Executor
    participant Registry
    participant Provider
    participant API
    participant Cache

    Executor->>Registry: getProvider(name)
    Registry-->>Executor: provider
    Executor->>Provider: sendPrompt(prompt, options)
    Provider->>Cache: checkCache(prompt)
    alt Cached
        Cache-->>Provider: cachedResponse
    else Not Cached
        Provider->>API: HTTP POST
        API-->>Provider: response
        Provider->>Cache: store(prompt, response)
    end
    Provider-->>Executor: LLMResponse
```

## State Management

### Session State

Sessions maintain the following state:

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

### State Transitions

```mermaid
stateDiagram-v2
    [*] --> Idle: Session Created

    state Active {
        Idle --> Loading: Command Received
        Loading --> Executing: Context Loaded
        Executing --> Processing: LLM Response
        Processing --> Updating: Output Processed
        Updating --> Idle: Session Updated
    }

    Active --> Suspended: Timeout
    Active --> Completed: User Ends
    Suspended --> Active: Resume
    Completed --> [*]
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

## Integration Patterns

### 1. Provider Integration

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

### 2. MCP Integration

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

### 3. GitHub Integration

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

## Data Transformation

### Prompt Assembly

```mermaid
flowchart TD
    subgraph Inputs
        A[Agent Definition]
        B[Command Spec]
        C[User Input]
        D[Session Context]
        E[Knowledge Base]
    end

    subgraph Assembly
        F[Template Engine]
        G[Variable Resolution]
        H[Context Injection]
    end

    subgraph Output
        I[Final Prompt]
    end

    A --> F
    B --> F
    C --> F
    D --> G
    E --> H
    F --> G
    G --> H
    H --> I
```

### Response Processing

```mermaid
flowchart TD
    subgraph Input
        A[LLM Response]
    end

    subgraph Processing
        B[Parse Response]
        C[Extract Structured Data]
        D[Validate Output]
        E[Transform Format]
    end

    subgraph Storage
        F[Update Session]
        G[Update Context]
    end

    subgraph Display
        H[Format for CLI]
        I[User Output]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    E --> G
    E --> H
    H --> I
```

## Caching Strategy

### Cache Layers

```mermaid
flowchart TD
    subgraph Request
        A[Incoming Request]
    end

    subgraph Caching
        B{Memory Cache}
        C{File Cache}
        D{No Cache}
    end

    subgraph Execution
        E[Execute Request]
    end

    A --> B
    B -->|Hit| F[Return Cached]
    B -->|Miss| C
    C -->|Hit| G[Load & Return]
    C -->|Miss| D
    D --> E
    E --> H[Cache Result]
    H --> F
```

### What's Cached

| Data Type         | Cache Location | TTL              |
| ----------------- | -------------- | ---------------- |
| Agent definitions | Memory         | Session lifetime |
| Command specs     | Memory         | Session lifetime |
| Prompt templates  | Memory         | Session lifetime |
| Configuration     | Memory         | Until reload     |
| Session data      | File           | Configurable     |
| LLM responses     | None           | Not cached       |

## Error Propagation

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

## Concurrency Patterns

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

## Data Persistence

### File Structure

```plaintext
.ai/
├── sessions/
│   ├── session-abc123.json
│   └── session-def456.json
├── logs/
│   ├── 2024-01-15.log
│   └── latest.log -> 2024-01-15.log
└── config.json
```

### Session File Format

```json
{
  "id": "session-abc123",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T11:30:00Z",
  "context": {
    "currentTask": { ... },
    "history": [ ... ]
  },
  "outputs": {
    "plan": { ... },
    "implement": { ... }
  },
  "metadata": {
    "commandCount": 5,
    "lastCommand": "review-code",
    "totalTokens": 15000
  }
}
```

## Metrics and Observability

### Collected Metrics

| Metric               | Type      | Description            |
| -------------------- | --------- | ---------------------- |
| command_duration     | Histogram | Command execution time |
| llm_request_duration | Histogram | LLM API latency        |
| session_count        | Gauge     | Active sessions        |
| error_count          | Counter   | Errors by type         |
| token_usage          | Counter   | Tokens consumed        |

### Log Structure

```json
{
  "timestamp": "2024-01-15T10:00:00Z",
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
