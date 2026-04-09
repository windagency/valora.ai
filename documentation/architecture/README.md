# Architecture

Valora follows a modular, layered architecture built on five core principles:

| Principle         | Description                                     |
| ----------------- | ----------------------------------------------- |
| **Modularity**    | Loosely coupled modules with clear interfaces   |
| **Extensibility** | Easy to add new agents, commands, and providers |
| **Testability**   | All components designed for testing             |
| **Observability** | Comprehensive logging and metrics               |
| **Resilience**    | Graceful error handling and recovery            |

## Contents

| Document                                          | Purpose                                   |
| ------------------------------------------------- | ----------------------------------------- |
| [System Architecture](./system-architecture.md)   | High-level system design — start here     |
| [Component Architecture](./components.md)         | Module-level design                       |
| [Data Flow](./data-flow.md)                       | Data and control flow diagrams            |
| [Session Optimisation](./session-optimization.md) | Session-based performance optimisations   |
| [Metrics System](./metrics-system.md)             | Workflow metrics collection and reporting |
| [Metrics Dashboard](./metrics-dashboard.md)       | Metrics tracking reference                |
| [ADRs](../adr/README.md)                          | Architecture decisions and rationale      |

---

## System Context

```mermaid
C4Context
    title System Context — VALORA

    Person(developer, "Developer", "Uses the engine for AI-assisted development")

    Enterprise_Boundary(b0, "AI Orchestration System") {
        System(orchestrator, "VALORA", "Orchestrates AI agents for development workflows")
    }

    System_Ext(cursor, "Cursor IDE", "Development environment")
    System_Ext(llm_api, "LLM APIs", "Anthropic, OpenAI, Google")
    System_Ext(github, "GitHub", "Version control")
    System_Ext(filesystem, "File System", "Local storage")

    Rel(developer, orchestrator, "Uses", "CLI / MCP")
    Rel(orchestrator, cursor, "Integrates", "MCP")
    Rel(orchestrator, llm_api, "Sends prompts", "HTTPS")
    Rel(orchestrator, github, "Creates PRs", "API")
    Rel(orchestrator, filesystem, "Reads/Writes", "FS")
```

## Container Architecture

```mermaid
C4Container
    title Container Diagram — VALORA

    Person(developer, "Developer", "Uses CLI or IDE")

    Container_Boundary(engine, "VALORA") {
        Container(cli, "CLI Application", "Node.js", "Parses commands, manages interaction")
        Container(mcp_server, "MCP Server", "Node.js", "Model Context Protocol server")
        Container(executor, "Executor", "TypeScript", "Pipeline orchestration")
        Container(llm_layer, "LLM Layer", "TypeScript", "Multi-provider integration")
        Container(session_store, "Session Store", "File System", "Persistent state")
    }

    System_Ext(cursor, "Cursor IDE")
    System_Ext(llm_api, "LLM APIs")

    Rel(developer, cli, "Uses", "Terminal")
    Rel(cursor, mcp_server, "Connects", "MCP Protocol")
    Rel(cli, executor, "Invokes")
    Rel(mcp_server, executor, "Invokes")
    Rel(executor, llm_layer, "Uses")
    Rel(executor, session_store, "Reads/Writes")
    Rel(llm_layer, llm_api, "Calls", "HTTPS")
```

---

<details>
<summary><strong>External MCP client architecture</strong></summary>

Valora connects to 15 external MCP servers as a client, with user approval for each connection.

```mermaid
flowchart LR
    subgraph VALORA["VALORA Engine"]
        Command["Command Executor"]
        Integrator["MCP Integrator"]
        Approval["Approval Workflow"]
        ClientMgr["Client Manager"]
        AuditLog["Audit Logger"]
    end

    subgraph External["External MCP Servers"]
        Browser["Browser: Playwright, Chrome DevTools, BrowserStack"]
        Dev["Dev: GitHub, Serena, Context7"]
        Infra["Infra: Terraform, Firebase, GCP"]
        Data["Data: MongoDB, Elastic"]
    end

    User["User"]

    Command --> Integrator
    Integrator --> Approval
    Approval --> User
    User --> Approval
    Integrator --> ClientMgr
    ClientMgr --> Browser
    ClientMgr --> Dev
    ClientMgr --> Infra
    ClientMgr --> Data
    ClientMgr --> AuditLog
```

| Component              | Responsibility                                       |
| ---------------------- | ---------------------------------------------------- |
| **MCP Client Manager** | Connection lifecycle, tool discovery, caching        |
| **Approval Workflow**  | Interactive user approval with risk assessment       |
| **Approval Cache**     | Session/persistent approval memory                   |
| **Audit Logger**       | Security logging of all MCP operations               |
| **Tool Proxy**         | Timeout enforcement, risk assessment, error handling |

</details>

<details>
<summary><strong>Key architectural decisions</strong></summary>

| Decision                   | Rationale                                       |
| -------------------------- | ----------------------------------------------- |
| Multi-agent architecture   | Specialisation improves output quality          |
| Three-tier execution       | Flexibility for different use cases and budgets |
| Session-based state        | Context preservation across commands            |
| Pipeline-based execution   | Composable, testable workflows                  |
| Provider abstraction       | LLM vendor independence                         |
| External MCP with approval | Security-first external tool integration        |

See [Architecture Decision Records](../adr/README.md) for the full rationale behind each decision.

</details>

<details>
<summary><strong>Technology stack</strong></summary>

| Component       | Technology | Version  |
| --------------- | ---------- | -------- |
| Runtime         | Node.js    | >=18.0.0 |
| Language        | TypeScript | 5.x      |
| Package manager | npm / pnpm | 10.x     |

| Category        | Library                   | Purpose                 |
| --------------- | ------------------------- | ----------------------- |
| CLI             | Commander                 | Command parsing         |
| UI              | Ink, Chalk                | Terminal UI             |
| Validation      | Zod                       | Schema validation       |
| LLM — Anthropic | @anthropic-ai/sdk         | Claude integration      |
| LLM — OpenAI    | openai                    | GPT integration         |
| LLM — Google    | @google/generative-ai     | Gemini integration      |
| MCP             | @modelcontextprotocol/sdk | Protocol implementation |
| Testing         | Vitest                    | Unit/integration        |
| E2E testing     | Playwright                | End-to-end              |

</details>

<details>
<summary><strong>Quality attributes</strong></summary>

### Performance

- Sub-second CLI response time
- Streaming LLM responses
- Efficient session serialisation
- Persistent stage output caching (2–3 min savings per context load)

### Reliability

- Graceful provider fallback
- Session recovery on restart
- Comprehensive error handling

### Maintainability

- Modular architecture
- High test coverage

### Security

- No credential storage in code
- Environment-based configuration
- Input validation with Zod

</details>
