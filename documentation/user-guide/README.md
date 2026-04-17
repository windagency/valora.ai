# User Guide

Getting started with Valora for everyday development tasks.

## Contents

| Document                                       | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| [Quick Start](./quick-start.md)                | Install and run your first command in 5 minutes       |
| [Workflows](./workflows.md)                    | Common development patterns end-to-end                |
| [Commands](./commands.md)                      | Complete command reference                            |
| [Dry Run Mode](./dry-run-mode.md)              | Preview changes before execution                      |
| [Metrics and Optimisation](./metrics.md)       | Track and improve workflow efficiency                 |
| [Metrics Quick Start](./metrics-quickstart.md) | 5-minute metrics setup                                |
| [Plugins](./plugins.md)                        | Install and manage plugins                            |
| [Configuration](./configuration.md)            | Configure providers, agents, and external MCP servers |
| [Best Practices](./best-practices.md)          | Recommended usage patterns                            |
| [Troubleshooting](./troubleshooting.md)        | Common issues and solutions                           |

**New to Valora?** Start with [Quick Start](./quick-start.md).

---

## What You Can Do

| Category            | Commands                                      | Description                                       |
| ------------------- | --------------------------------------------- | ------------------------------------------------- |
| **Planning**        | `refine-specs`, `create-prd`, `plan`          | Define requirements and implementation strategies |
| **Task management** | `create-backlog`, `fetch-task`, `refine-task` | Manage and prioritise work                        |
| **Implementation**  | `implement`, `gather-knowledge`               | Execute code changes with AI assistance           |
| **Quality**         | `assert`, `test`, `review-code`               | Validate and review your work                     |
| **Delivery**        | `commit`, `create-pr`                         | Create commits and pull requests                  |

## Prerequisites

- Node.js >=18.0.0
- Cursor IDE (recommended) or a compatible editor
- API keys (optional — Tier 2 works without them)

---

<details>
<summary><strong>Execution modes</strong></summary>

Valora supports three execution tiers:

### Tier 2: Guided Completion (default)

- **Status**: Active
- **Cost**: Free (Cursor subscription)
- **Setup**: Zero configuration
- **How it works**: Valora generates structured prompts for Cursor AI to process

### Tier 3: API Key Fallback

- **Status**: Available when configured
- **Cost**: Pay per API call
- **Setup**: `valora config setup` or set environment variables
- **Use case**: Autonomous execution without IDE

### Tier 1: MCP Sampling

- **Status**: Not yet available
- **Cost**: Free (Cursor subscription)
- **Use case**: Native Cursor integration (future)

</details>

<details>
<summary><strong>External MCP servers</strong></summary>

Valora can connect to 15 external MCP servers. Each connection requires user approval.

| Server              | Risk   | Capabilities                                 |
| ------------------- | ------ | -------------------------------------------- |
| **Playwright**      | Medium | Browser automation, screenshots, E2E testing |
| **Figma**           | Low    | Design tool integration for UI/UX workflows  |
| **GitHub**          | Medium | Repository, issues, and PR management        |
| **Chrome DevTools** | Medium | Browser debugging and inspection             |
| **Context7**        | Low    | Semantic search and context management       |
| **Serena**          | Medium | AI-powered code analysis and refactoring     |
| **Terraform**       | High   | Infrastructure as code management            |
| **MongoDB**         | Medium | Document database operations and queries     |
| **Elastic**         | Medium | Search and analytics operations              |
| **BrowserStack**    | Medium | Cross-browser testing automation             |
| **DeepResearch**    | Low    | Comprehensive information gathering          |
| **Firebase**        | High   | Google Firebase app development services     |
| **Google Cloud**    | High   | Cloud resource management                    |
| **Grafana**         | Low    | Observability and monitoring dashboards      |
| **Storybook**       | Low    | Component documentation and testing          |

Security features: user approval prompt, risk assessment, tool allowlist/blocklist, audit logging at `.valora/logs/mcp-audit.jsonl`.

See [Configuration](./configuration.md#external-mcp-configuration) for setup details.

</details>
