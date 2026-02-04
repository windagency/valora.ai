# User Guide

> Getting started with VALORA for everyday development tasks.

## Overview

This guide is designed for developers who want to use VALORA to automate and enhance their software development workflow. You will learn how to execute commands, understand workflows, and leverage AI agents for various development tasks.

## Contents

1. [Quick Start](./quick-start.md) - Get up and running in 5 minutes
2. [Workflows](./workflows.md) - Common development patterns
3. [Commands](./commands.md) - Complete command reference
4. [Dry Run Mode](./dry-run-mode.md) - Preview changes before execution
5. [Metrics and Optimization](./metrics.md) - Track and improve workflow efficiency
   - [Metrics Quick Start](./metrics-quickstart.md) - 5-minute metrics setup
   - [Workflow Optimizations](./workflow-optimizations.md) - Detailed optimization reference
6. [Configuration](./configuration.md) - Configure and customize the engine
7. [Best Practices](./best-practices.md) - Recommended usage patterns
8. [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## What You Can Do

VALORA helps you with:

| Task Category       | Commands                                      | Description                                       |
| ------------------- | --------------------------------------------- | ------------------------------------------------- |
| **Planning**        | `refine-specs`, `create-prd`, `plan`          | Define requirements and implementation strategies |
| **Task Management** | `create-backlog`, `fetch-task`, `refine-task` | Manage and prioritise work                        |
| **Implementation**  | `implement`, `gather-knowledge`               | Execute code changes with AI assistance           |
| **Quality**         | `assert`, `test`, `review-code`               | Validate and review your work                     |
| **Delivery**        | `commit`, `create-pr`                         | Create commits and pull requests                  |

## Execution Modes

The engine supports three execution modes:

### Tier 1: MCP Sampling (Future)

- **Status**: Not yet available
- **Cost**: Free (Cursor subscription)
- **Use Case**: Native Cursor integration

### Tier 2: Guided Completion Mode (Current Default)

- **Status**: Active
- **Cost**: Free (Cursor subscription)
- **Setup**: Zero configuration
- **How It Works**: VALORA generates structured prompts for Cursor AI to process

### Tier 3: API Key Fallback

- **Status**: Available when configured
- **Cost**: Pay per API call
- **Setup**: Configure API keys via `valora config setup`
- **Use Case**: Autonomous execution

## External MCP Integration

VALORA can connect to external MCP servers to extend capabilities:

| Server              | Risk   | Capabilities                                     |
| ------------------- | ------ | ------------------------------------------------ |
| **Playwright**      | Medium | Browser automation, screenshots, E2E testing    |
| **Figma**           | Low    | Design tool integration for UI/UX workflows     |
| **GitHub**          | Medium | Repository, issues, and PR management            |
| **Chrome DevTools** | Medium | Browser debugging and inspection                 |
| **Context7**        | Low    | Semantic search and context management           |
| **Serena**          | Medium | AI-powered code analysis and refactoring         |
| **Terraform**       | High   | Infrastructure as code management                |
| **MongoDB**         | Medium | Document database operations and queries         |
| **Elastic**         | Medium | Search and analytics operations                  |
| **BrowserStack**    | Medium | Cross-browser testing automation                 |
| **DeepResearch**    | Low    | Comprehensive information gathering              |
| **Firebase**        | High   | Google Firebase app development services         |
| **Google Cloud**    | High   | Cloud resource management                        |
| **Grafana**         | Low    | Observability and monitoring dashboards          |
| **Storybook**       | Low    | Component documentation and testing              |

### Security Features

- **User Approval**: Interactive prompt before connecting to external servers
- **Risk Assessment**: Automatic risk scoring based on server capabilities
- **Tool Filtering**: Configure allowlist/blocklist for sensitive operations
- **Audit Logging**: Complete operation trail in `.ai/logs/mcp-audit.jsonl`

See [Configuration](./configuration.md#external-mcp-configuration) for setup details.

## Prerequisites

Before using the engine:

1. **Node.js 18+** installed
2. **pnpm** package manager
3. **Cursor IDE** (recommended) or compatible editor
4. **API keys** (optional, for Tier 3 execution)

## Quick Example

```bash
# Navigate to the engine directory
cd .ai/.bin

# Run a planning command
valora plan "Add user authentication with OAuth"
```

The engine will:

1. Analyse your request
2. Select the appropriate agent (`@lead`)
3. Generate a structured implementation plan
4. Provide step-by-step guidance

## Next Steps

- **New to the engine?** Start with [Quick Start](./quick-start.md)
- **Know the basics?** Explore [Workflows](./workflows.md)
- **Need command details?** See [Commands](./commands.md)

## Getting Help

- Check the [Developer Guide](../developer-guide/README.md) for technical details
- Review [Architecture Documentation](../architecture/README.md) for system design
- View logs at `.ai/logs/` for troubleshooting
