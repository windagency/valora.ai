# System Architecture

> High-level architectural design of VALORA.

## Overview

VALORA is a TypeScript-based platform that orchestrates AI agents to automate software development workflows. It provides a CLI interface, MCP server integration, and multi-provider LLM support.

## System Context

```mermaid
C4Context
    title System Context - VALORA

    Person(developer, "Developer", "Software developer using AI-assisted workflows")
    Person(reviewer, "Code Reviewer", "Reviews AI-generated code and PRs")

    Enterprise_Boundary(b0, "AI Orchestration Platform") {
        System(orchestrator, "VALORA", "Core orchestration system")
    }

    Enterprise_Boundary(b1, "Development Environment") {
        System_Ext(cursor, "Cursor IDE", "AI-enabled IDE")
        System_Ext(vscode, "VS Code", "Alternative IDE")
        System_Ext(terminal, "Terminal", "Command line interface")
    }

    Enterprise_Boundary(b2, "AI Services") {
        System_Ext(anthropic, "Anthropic API", "Claude models")
        System_Ext(openai, "OpenAI API", "GPT models")
        System_Ext(google, "Google AI", "Gemini models")
    }

    Enterprise_Boundary(b3, "Development Services") {
        System_Ext(github, "GitHub", "Version control & PRs")
        System_Ext(filesystem, "File System", "Project files")
    }

    Rel(developer, terminal, "Executes commands")
    Rel(developer, cursor, "Develops code")
    Rel(terminal, orchestrator, "CLI commands")
    Rel(cursor, orchestrator, "MCP integration")
    Rel(orchestrator, anthropic, "API calls")
    Rel(orchestrator, openai, "API calls")
    Rel(orchestrator, google, "API calls")
    Rel(orchestrator, github, "PR operations")
    Rel(orchestrator, filesystem, "Read/Write files")
    Rel(reviewer, github, "Reviews PRs")
```

## Container Architecture

```mermaid
C4Container
    title Container Diagram - VALORA

    Person(developer, "Developer")

    Container_Boundary(engine, "VALORA") {
        Container(cli, "CLI Layer", "Node.js/TypeScript", "Command parsing, user interaction, output formatting")

        Container(orch, "Orchestration Layer", "TypeScript", "Pipeline execution, stage management, coordination")

        Container(agent, "Agent Layer", "TypeScript", "Agent registry, selection, prompt assembly")

        Container(llm, "LLM Layer", "TypeScript", "Provider abstraction, request handling, response processing")

        Container(mcp, "MCP Server", "TypeScript", "Model Context Protocol, tool handling")

        Container(session, "Session Layer", "TypeScript", "State persistence, context management")

        Container(config, "Config Layer", "TypeScript", "Configuration loading, validation")

        ContainerDb(session_store, "Session Store", "JSON Files", "Persistent session data")
        ContainerDb(config_store, "Config Store", "JSON Files", "Configuration files")
        ContainerDb(logs, "Log Store", "Files", "Execution logs")
    }

    System_Ext(cursor, "Cursor IDE")
    System_Ext(llm_api, "LLM APIs")
    System_Ext(github, "GitHub")

    Rel(developer, cli, "Uses", "Terminal")
    Rel(cursor, mcp, "Connects", "MCP")
    Rel(cli, orch, "Executes")
    Rel(mcp, orch, "Executes")
    Rel(orch, agent, "Selects")
    Rel(orch, llm, "Invokes")
    Rel(orch, session, "Manages")
    Rel(agent, config, "Loads")
    Rel(llm, llm_api, "Calls")
    Rel(session, session_store, "Persists")
    Rel(config, config_store, "Reads")
    Rel(orch, logs, "Writes")
    Rel(cli, github, "PR ops")
```

## Layer Responsibilities

### CLI Layer

**Purpose**: User interaction and command handling

| Component        | Responsibility                 |
| ---------------- | ------------------------------ |
| Command Parser   | Parse CLI arguments and flags  |
| Command Resolver | Resolve command specifications |
| Wizard           | Interactive configuration      |
| Output Formatter | Format and display results     |
| Error Handler    | User-friendly error messages   |

### Orchestration Layer

**Purpose**: Workflow execution and coordination

| Component           | Responsibility             |
| ------------------- | -------------------------- |
| Pipeline            | Execute command pipelines  |
| Stage Executor      | Execute individual stages  |
| Execution Context   | Maintain execution state   |
| Variable Resolution | Resolve template variables |
| Coordinator         | Multi-step coordination    |

### Agent Layer

**Purpose**: AI agent management and selection

| Component        | Responsibility             |
| ---------------- | -------------------------- |
| Agent Registry   | Store agent definitions    |
| Agent Loader     | Load agent configurations  |
| Agent Selector   | Dynamic agent selection    |
| Prompt Assembler | Build prompts with context |

### LLM Layer

**Purpose**: Multi-provider AI integration

| Component          | Responsibility               |
| ------------------ | ---------------------------- |
| Provider Registry  | Register LLM providers       |
| Provider Interface | Abstract provider operations |
| Anthropic Provider | Claude integration           |
| OpenAI Provider    | GPT integration              |
| Google Provider    | Gemini integration           |
| Cursor Provider    | Cursor subscription          |

### MCP Server Layer

**Purpose**: IDE integration via MCP

| Component       | Responsibility         |
| --------------- | ---------------------- |
| Server          | Handle MCP connections |
| Tool Handler    | Execute tool requests  |
| Prompt Handler  | Handle prompt requests |
| Session Service | MCP session management |

### Session Layer

**Purpose**: Persistent state management

| Component          | Responsibility      |
| ------------------ | ------------------- |
| Session Service    | CRUD operations     |
| Session Repository | File persistence    |
| Context Manager    | Context aggregation |

### Configuration Layer

**Purpose**: Application configuration

| Component        | Responsibility           |
| ---------------- | ------------------------ |
| Config Loader    | Load configuration files |
| Schema Validator | Validate with Zod        |
| Provider Config  | LLM provider settings    |

## Execution Flow

### Command Execution

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

### MCP Integration

```mermaid
sequenceDiagram
    participant Cursor
    participant MCP
    participant Handler
    participant Pipeline
    participant LLM

    Cursor->>MCP: tool request
    MCP->>Handler: handleTool(request)
    Handler->>Pipeline: execute(command)
    Pipeline->>LLM: sendPrompt()
    LLM-->>Pipeline: response
    Pipeline-->>Handler: result
    Handler-->>MCP: tool response
    MCP-->>Cursor: result
```

## Deployment Architecture

The engine runs locally on the developer's machine:

```mermaid
graph TB
    subgraph "Developer Machine"
        subgraph "Runtime"
            NODE[Node.js Runtime]
            CLI[CLI Process]
            MCP[MCP Server]
        end

        subgraph "Storage"
            CONFIG[Config Files]
            SESSIONS[Session Files]
            LOGS[Log Files]
        end

        subgraph "IDE"
            CURSOR[Cursor IDE]
        end
    end

    subgraph "Cloud Services"
        ANTHROPIC[Anthropic API]
        OPENAI[OpenAI API]
        GOOGLE[Google AI API]
        GITHUB[GitHub API]
    end

    CLI --> CONFIG
    CLI --> SESSIONS
    CLI --> LOGS
    MCP --> CLI
    CURSOR --> MCP
    CLI --> ANTHROPIC
    CLI --> OPENAI
    CLI --> GOOGLE
    CLI --> GITHUB
```

## Security Architecture

### Authentication Flow

```mermaid
flowchart TD
    A[Command Execution] --> B{Provider Type}
    B -->|Cursor| C[Use Cursor Session]
    B -->|API| D{API Key Configured?}
    D -->|Yes| E[Use API Key from Environment]
    D -->|No| F[Prompt for Configuration]
    C --> G[Execute with Provider]
    E --> G
    F --> G
```

### Security Boundaries

| Boundary      | Protection                           |
| ------------- | ------------------------------------ |
| API Keys      | Environment variables, never in code |
| Configuration | Local file, gitignored               |
| Sessions      | Local storage, no sensitive data     |
| Network       | HTTPS only for API calls             |

## Scalability Considerations

### Current Design

- Single-user, local execution
- Sequential command processing
- File-based session storage

### Future Considerations

- Multi-user support
- Parallel agent execution
- Database-backed sessions
- Remote execution capability
