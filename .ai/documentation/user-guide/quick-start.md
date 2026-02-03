# Quick Start Guide

> Get up and running with VALORA in 5 minutes.

## Prerequisites

Ensure you have the following installed:

- **Docker**
- ou
  - **Node.js** 18.0.0 or higher
  - **pnpm** 10.x (package manager)
- **Cursor IDE** (recommended for best experience)

## Installation

### Step 1: Navigate to the Engine Directory

```bash
cd .ai/.bin
```

### Step 2: Install Dependencies

```bash
pnpm install
```

### Step 3: Build the Engine

```bash
pnpm build
```

### Step 4: Link globally

```bash
pnpm link
```

### Step 5: Verify Installation

```bash
valora --version
# Should output: 1.0.0
```

## First Command

Try running a simple command to verify everything works:

```bash
valora help
```

This displays all available commands and their descriptions.

## Configuration (Optional)

### Zero-Config Mode (Default)

The engine works immediately without any configuration using **Guided Completion Mode**. This mode:

- Uses your Cursor IDE subscription
- Generates structured prompts for you to execute
- Requires no API keys

### API Key Configuration

For autonomous execution, configure API keys:

```bash
valora config setup --quick
```

Or set environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
export OPENAI_API_KEY=sk-your-key
export GOOGLE_API_KEY=your-key
```

Verify your configuration:

```bash
valora config show
```

## Your First Workflow

Let's walk through a simple planning workflow:

### 1. Create an Implementation Plan

```bash
valora plan "Add a user profile page with avatar upload"
```

The engine will:

1. Select the `@lead` agent
2. Analyse your request
3. Generate a detailed implementation plan

### 2. Review the Plan

```bash
valora review-plan
```

This validates the plan for:

- Completeness
- Technical feasibility
- Risk assessment

### 3. Start Implementation

Based on the approved plan, implement the changes:

```bash
valora implement
```

The engine will:

1. Dynamically select the appropriate engineer agent
2. Guide you through the implementation
3. Provide code suggestions

## Understanding the Output

When you run a command, you'll see:

```plaintext
╭──────────────────────────────────────────────────────────────╮
│  VALORA v1.0.0                      │
├──────────────────────────────────────────────────────────────┤
│  Command: plan                                               │
│  Agent: @lead                                                │
│  Model: gpt-5-thinking-high                                  │
╰──────────────────────────────────────────────────────────────╯

[Planning Phase]
Analysing task requirements...
```

## Common First Commands

| Goal               | Command                                    |
| ------------------ | ------------------------------------------ |
| Get help           | `valora help`                              |
| View configuration | `valora config show`                       |
| Plan a feature     | `valora plan "<description>"`              |
| Plan (complex)     | `valora plan --mode=tiered`                |
| Plan (API pattern) | `valora plan "Add API" --pattern=rest-api` |
| Get next task      | `valora fetch-task`                        |
| Run tests          | `valora test`                              |
| Review code        | `valora review-code`                       |
| Quick review       | `valora review-code --checklist`           |
| Preview changes    | `valora implement -n`                      |

## Pattern Templates

Use pre-built templates for common architectural patterns:

| Pattern        | Command                                | Use When                             |
| -------------- | -------------------------------------- | ------------------------------------ |
| REST API       | `valora plan --pattern=rest-api`       | Adding API endpoints, CRUD resources |
| React Feature  | `valora plan --pattern=react-feature`  | Adding React features, pages         |
| Database       | `valora plan --pattern=database`       | Adding tables, migrations            |
| Auth           | `valora plan --pattern=auth`           | Adding login, JWT, OAuth             |
| Background Job | `valora plan --pattern=background-job` | Adding queues, workers               |

## Quick Validation Modes

For faster feedback during development, use quick validation modes:

| Command             | Quick Mode    | Time Savings                                  |
| ------------------- | ------------- | --------------------------------------------- |
| `validate-plan`     | (default)     | Pre-review ~2 min (saves ~9 min in review)    |
| `validate-coverage` | (default)     | Coverage validation gate with quality scoring |
| `review-plan`       | `--checklist` | ~14 min → ~3 min                              |
| `assert`            | `--quick=all` | ~9 min → ~5 min                               |
| `review-code`       | `--checklist` | ~10 min → ~3 min                              |
| `review-code`       | `--auto-only` | ~10 min → ~1 min                              |
| `validate-parallel` | (default)     | ~19 min → ~10 min                             |
| `validate-parallel` | `--quick`     | ~19 min → ~5 min                              |

## Dry Run Mode

Before running any command that makes changes, you can preview what it would do:

```bash
# Preview implementation without making changes
valora implement "Add user authentication" --dry-run

# Short form
valora implement "Add user authentication" -n
```

This shows:

- Files that would be created, modified, or deleted
- Diff previews of all changes
- Terminal commands that would be executed
- Estimated token usage and costs

See [Dry Run Mode](./dry-run-mode.md) for full documentation.

## Session Management

The engine maintains session state between commands:

```bash
# View active sessions
valora session list

# Resume a session
valora session resume <session-id>

# Clear session
valora session clean
```

## Troubleshooting

### Command Not Found

Ensure the engine is built:

```bash
cd .ai/.bin
pnpm build
pnpm link
```

### No Output

Check logs for details:

```bash
tail -f .ai/logs/latest.log
```

### API Errors

Verify API keys are set:

```bash
valora doctor
```

## Next Steps

Now that you're set up:

1. **Learn workflows**: Read [Workflows](./workflows.md) for common patterns
2. **Explore commands**: See [Commands](./commands.md) for the full reference
3. **Understand agents**: Review agent capabilities in the [Architecture](../architecture/README.md)

## Summary

| Step | Action                                          |
| ---- | ----------------------------------------------- |
| 1    | Install with `pnpm install`                     |
| 2    | Build with `pnpm build`                         |
| 3    | Link globally with `pnpm link`                  |
| 4    | Verify with `valora help`                       |
| 5    | Configure (optional) with `valora config setup` |
| 6    | Start using with `valora plan "<task>"`         |
