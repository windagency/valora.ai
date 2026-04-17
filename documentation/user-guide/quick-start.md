# Quick Start

Get Valora installed and running your first command in 5 minutes.

## Prerequisites

- Node.js >=18.0.0
- Cursor IDE (recommended)

## Install

```bash
npm install -g @windagency/valora
# pnpm add -g @windagency/valora
# yarn global add @windagency/valora
valora --version  # 2.5.0
```

## Initialise your project

```bash
cd your-project
valora init         # minimal: creates .valora/config.json
valora init --full  # full: creates override directories
```

## Configuration

### Default (no API key needed)

Works immediately with **Guided Completion Mode** using your Cursor subscription. No setup required.

### API keys (for autonomous execution)

```bash
valora config setup --quick

# Or set directly
export ANTHROPIC_API_KEY=sk-ant-your-key
export OPENAI_API_KEY=sk-your-key
export GOOGLE_API_KEY=your-key
```

### Local models (fully offline)

```bash
ollama pull llama3.1 && ollama serve

export LOCAL_BASE_URL=http://localhost:11434/v1
export LOCAL_DEFAULT_MODEL=llama3.1

valora plan "Add feature" --provider local --model llama3.1
```

Compatible with LM Studio (`http://localhost:1234/v1`), vLLM, llama.cpp, LocalAI.

Verify your configuration:

```bash
valora config show
```

## First workflow

### 1. Create a plan

```bash
valora plan "Add a user profile page with avatar upload"
```

Valora selects the `@lead` agent, analyses your request, and generates an implementation plan.

### 2. Review the plan

```bash
valora review-plan
```

### 3. Implement

```bash
valora implement
```

Valora selects the appropriate engineer agent and guides the implementation.

## Common commands

| Goal               | Command                       |
| ------------------ | ----------------------------- |
| Get help           | `valora help`                 |
| View configuration | `valora config show`          |
| Plan a feature     | `valora plan "<description>"` |
| Get next task      | `valora fetch-task`           |
| Run tests          | `valora test`                 |
| Review code        | `valora review-code`          |
| Preview changes    | `valora implement --dry-run`  |

## Troubleshooting

**Command not found**: ensure the global install completed — `npm install -g @windagency/valora`

**No output**: check logs at `.valora/logs/` or run `valora doctor`

**API errors**: verify keys with `valora doctor`

## Next steps

- [Workflows](./workflows.md) — common development patterns
- [Commands](./commands.md) — full command reference
- [Configuration](./configuration.md) — providers, agents, external MCP
