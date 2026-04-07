# System Architecture

> High-level architectural design of VALORA — a TypeScript CLI that orchestrates 11 AI agents across 24 commands for software development automation.

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

| Layer             | Purpose                                           | Key Components                                         |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------ |
| CLI               | User interaction and command handling             | Command Parser, Resolver, Wizard, Result Presenter     |
| Orchestration     | Workflow execution and coordination               | Pipeline, Stage Executor, Variable Resolver            |
| Code Intelligence | AST-based codebase understanding, LSP integration | AST Parser, Symbol Index, Smart Context, LSP Client    |
| Agent             | AI agent management and selection                 | Agent Registry, Loader, Selector, Prompt Assembler     |
| LLM               | Multi-provider AI integration                     | Provider Registry, Anthropic/OpenAI/Google/Cursor      |
| MCP Server        | IDE integration via Model Context Protocol        | Server, Tool Handler, Prompt Handler, Session Service  |
| Session           | Persistent state management                       | Session Service, Repository, Context Manager           |
| Configuration     | Application configuration                         | Config Loader, Schema Validator (Zod), Provider Config |

## Key Design Decisions

| Decision                  | Choice                                                | Rationale                                                            |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Execution model           | Local, single-user, sequential                        | Simplicity; no infrastructure dependencies                           |
| Provider abstraction      | Normalised `LLMUsage` across all providers            | Cache metrics and cost tracking work identically regardless of model |
| Session storage           | File-based JSON with dual snapshot/full               | Zero infrastructure; fast resume via lightweight snapshot            |
| Context window management | Automatic flush + summarisation at 80%                | Prevents hard context-limit failures during long pipelines           |
| Security perimeter        | Credential Guard + Command Guard + Injection Detector | Defence-in-depth for local-execution threat model                    |
| Codebase intelligence     | tree-sitter WASM + LSP (spawn-on-demand)              | Language-agnostic parsing; rich type info without bundling a server  |

<details>
<summary><strong>Non-Functional Requirement Mapping</strong></summary>

| NFR             | Mechanism                                                                |
| --------------- | ------------------------------------------------------------------------ |
| Performance     | Prompt caching (up to 90% input token savings); AST symbol index on disk |
| Reliability     | Retry logic on transient LLM errors; session snapshots for fast recovery |
| Security        | Credential Guard, Command Guard, Injection Detector, Tool Validator      |
| Observability   | Structured JSON logs; per-request spending ledger (`spending.jsonl`)     |
| Extensibility   | Provider registry pattern; file-driven command/agent definitions         |
| Maintainability | Dependency injection container; typed pipeline events                    |

</details>

<details>
<summary><strong>Security Architecture</strong></summary>

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

### Security Component Summary

| Component          | Vulnerability Class                        | Severity |
| ------------------ | ------------------------------------------ | -------- |
| Credential Guard   | Credential leakage via env/output/files    | Critical |
| Command Guard      | Command injection and data exfiltration    | Critical |
| Injection Detector | Indirect prompt injection via tool results | High     |
| Tool Validator     | MCP tool poisoning via descriptions        | High     |
| Integrity Monitor  | Rug pull attacks via tool-set drift        | High     |

</details>
