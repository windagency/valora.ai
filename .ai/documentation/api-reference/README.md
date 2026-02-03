# API Reference

Complete API reference for VALORA.

## Overview

VALORA provides three main APIs:

1. **CLI API** - Command-line interface for interactive use
2. **MCP Server API** - Model Context Protocol server for Cursor integration
3. **TypeScript API** - Programmatic access for custom integrations

## CLI API

### Command Structure

```bash
valora <command> [arguments] [flags]
```

### Global Flags

| Flag                | Description               | Example                                 |
| ------------------- | ------------------------- | --------------------------------------- |
| `--help, -h`        | Show help                 | `valora plan --help`                    |
| `--version, -v`     | Show version              | `valora --version`                      |
| `--verbose`         | Verbose output            | `valora plan --verbose`                 |
| `--dry-run`         | Preview without executing | `valora implement --dry-run`            |
| `--session <id>`    | Use specific session      | `valora --session abc123 plan`          |
| `--new-session`     | Start new session         | `valora --new-session plan`             |
| `--resume`          | Resume last session       | `valora --resume implement`             |
| `--model <name>`    | Override LLM model        | `valora plan --model claude-sonnet-4.5` |
| `--provider <name>` | Override LLM provider     | `valora plan --provider openai`         |
| `--mode <mode>`     | Execution mode            | `valora plan --mode api`                |

### Configuration Commands

```bash
# Setup configuration
valora config setup

# Validate configuration
valora config validate

# List available models
valora config list-models

# Show current config
valora config show

# Set configuration value
valora config set <key> <value>

# Get configuration value
valora config get <key>
```

### Session Commands

```bash
# List sessions
valora session list

# Show session details
valora session show <session-id>

# Resume session
valora session resume <session-id>

# Clear session context
valora session clear-context [session-id]

# Delete session
valora session delete <session-id>

# Cleanup old sessions
valora session cleanup --days <number>
```

### Development Lifecycle Commands

See [Commands Reference](../user-guide/commands.md) for detailed documentation.

## MCP Server API

### Starting the Server

```bash
# Development mode
pnpm dev:mcp

# Production mode
ai-mcp start
```

### MCP Tools

The server exposes tools via Model Context Protocol:

#### `execute_workflow`

Execute a complete workflow.

```json
{
  "name": "execute_workflow",
  "input": {
    "workflow": "feature-development",
    "task_description": "Add user authentication"
  }
}
```

#### `run_command`

Run a single orchestrator command.

```json
{
  "name": "run_command",
  "input": {
    "command": "plan",
    "args": ["Add API endpoint"],
    "flags": {
      "pattern": "rest-api"
    }
  }
}
```

#### `query_session`

Query session context.

```json
{
  "name": "query_session",
  "input": {
    "session_id": "abc123",
    "query": "What was the last command?"
  }
}
```

### MCP Resources

#### Sessions

```json
{
  "uri": "session://abc123",
  "name": "Session abc123",
  "mimeType": "application/json"
}
```

#### Plans

```json
{
  "uri": "plan://PLAN-BE001",
  "name": "Implementation Plan BE001",
  "mimeType": "text/markdown"
}
```

## TypeScript API

### Installation

```bash
pnpm add valora
```

### Basic Usage

```typescript
import { Orchestrator } from 'valora';

const orchestrator = new Orchestrator({
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4.5'
  }
});

// Execute command
const result = await orchestrator.execute('plan', {
  args: ['Add user authentication'],
  flags: {
    pattern: 'rest-api'
  }
});

console.log(result.outputs);
```

### Core Classes

#### Orchestrator

Main orchestrator class.

```typescript
class Orchestrator {
  constructor(config?: Partial<OrchestratorConfig>);

  async execute(
    command: string,
    options: CommandExecutionOptions
  ): Promise<CommandResult>;

  async executePipeline(
    pipeline: Pipeline,
    context: SessionContext
  ): Promise<PipelineResult>;

  getSession(sessionId?: string): Promise<Session>;

  listCommands(): CommandDefinition[];

  listAgents(): AgentDefinition[];
}
```

#### Session Lifecycle

Manage sessions programmatically.

```typescript
import { SessionLifecycle } from 'valora/session';

const lifecycle = new SessionLifecycle(config);

// Create session
const session = await lifecycle.create({
  initialContext: { task: 'Add feature' }
});

// Resume session
const resumed = await lifecycle.resume({
  sessionId: 'abc123'
});

// Complete session
await lifecycle.complete();

// Fail session
await lifecycle.fail(error);
```

#### Pipeline Executor

Execute pipelines directly.

```typescript
import { PipelineExecutor } from 'valora/executor';

const executor = new PipelineExecutor(config);

const result = await executor.execute({
  stages: [
    {
      name: 'analyze',
      prompt: 'context.analyze-task-context',
      required: true
    }
  ]
}, context);
```

### Type Definitions

#### CommandExecutionOptions

```typescript
interface CommandExecutionOptions {
  args: string[];
  flags: Record<string, boolean | string | undefined>;
  sessionId?: string;
  dryRun?: boolean;
}
```

#### CommandResult

```typescript
interface CommandResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  duration_ms: number;
  tokens_used?: number;
}
```

#### SessionContext

```typescript
interface SessionContext {
  [key: string]: unknown;
}
```

#### OptimizationMetrics

```typescript
interface OptimizationMetrics {
  complexity_score?: number;
  early_exit_triggered?: boolean;
  initial_confidence?: number;
  pattern_detected?: string;
  pattern_confidence?: number;
  planning_mode?: 'express' | 'template' | 'standard';
  template_used?: string;
  time_saved_minutes?: number;
}
```

#### QualityMetrics

```typescript
interface QualityMetrics {
  auto_fixes_applied?: number;
  files_generated?: number;
  iterations?: number;
  lint_errors_assert?: number;
  lint_errors_realtime?: number;
  plan_approved?: boolean;
  review_score?: number;
  test_failures?: number;
  test_passes?: number;
}
```

### Advanced Usage

#### Custom Agents

```typescript
import { AgentRegistry } from 'valora/agents';

const registry = new AgentRegistry();

// Register custom agent
registry.register({
  name: 'custom-agent',
  role: 'Custom Specialist',
  expertise: ['Custom domain'],
  model: 'claude-sonnet-4.5',
  systemPrompt: 'You are a custom agent...'
});

// Use custom agent
const result = await orchestrator.execute('plan', {
  args: ['Task'],
  flags: { agent: 'custom-agent' }
});
```

#### Custom Commands

```typescript
import { CommandRegistry } from 'valora/commands';

const registry = new CommandRegistry();

// Register custom command
registry.register({
  name: 'custom-command',
  description: 'Custom workflow',
  agent: 'lead',
  pipeline: {
    stages: [/* ... */]
  }
});
```

#### Event Listeners

```typescript
import { PipelineEvents } from 'valora/executor';

const events = new PipelineEvents();

events.on('stage:start', (stage) => {
  console.log(`Starting stage: ${stage.name}`);
});

events.on('stage:complete', (stage, result) => {
  console.log(`Completed stage: ${stage.name}`);
});

events.on('pipeline:error', (error) => {
  console.error('Pipeline failed:', error);
});
```

## Configuration File Reference

### Structure

```typescript
interface Config {
  llm: LLMConfig;
  execution: ExecutionConfig;
  session: SessionConfig;
  logging: LoggingConfig;
  agents?: AgentsConfig;
  commands?: CommandsConfig;
  metrics?: MetricsConfig;
}
```

### LLM Configuration

```typescript
interface LLMConfig {
  default_provider: 'anthropic' | 'openai' | 'google';
  providers: {
    [provider: string]: {
      api_key_env: string;
      default_model: string;
      timeout_ms: number;
      models?: {
        [model: string]: {
          max_tokens?: number;
          temperature?: number;
          top_p?: number;
        };
      };
    };
  };
}
```

### Execution Configuration

```typescript
interface ExecutionConfig {
  default_mode: 'guided' | 'api' | 'mcp';
  enable_parallel_execution: boolean;
  max_concurrent_stages: number;
  timeout_ms?: number;
}
```

### Session Configuration

```typescript
interface SessionConfig {
  auto_save: boolean;
  auto_save_interval_ms: number;
  cleanup_days: number;
  cleanup_enabled: boolean;
  encryption: boolean;
  encryption_key_env?: string;
}
```

### Logging Configuration

```typescript
interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file_enabled: boolean;
  console_enabled: boolean;
  daily_file_max_size_mb: number;
  log_directory: string;
}
```

## Error Handling

### Error Types

```typescript
class OrchestratorError extends Error {
  code: string;
  details?: Record<string, unknown>;
}

class CommandNotFoundError extends OrchestratorError {}
class SessionError extends OrchestratorError {}
class PipelineError extends OrchestratorError {}
class LLMError extends OrchestratorError {}
```

### Error Codes

| Code                | Description                          |
| ------------------- | ------------------------------------ |
| `COMMAND_NOT_FOUND` | Command does not exist               |
| `SESSION_NOT_FOUND` | Session ID not found                 |
| `SESSION_LOCKED`    | Session is locked by another process |
| `PIPELINE_FAILED`   | Pipeline execution failed            |
| `LLM_TIMEOUT`       | LLM request timed out                |
| `LLM_RATE_LIMIT`    | Rate limit exceeded                  |
| `CONFIG_INVALID`    | Configuration is invalid             |
| `VALIDATION_FAILED` | Validation check failed              |

### Error Handling Example

```typescript
try {
  const result = await orchestrator.execute('plan', options);
} catch (error) {
  if (error instanceof CommandNotFoundError) {
    console.error('Command not found:', error.message);
  } else if (error instanceof LLMError) {
    console.error('LLM error:', error.code, error.details);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Examples

### Complete Workflow

```typescript
import { Orchestrator } from 'valora';

const orchestrator = new Orchestrator();

// 1. Plan
const planResult = await orchestrator.execute('plan', {
  args: ['Add user authentication'],
  flags: { pattern: 'rest-api' }
});

// 2. Review plan
const reviewResult = await orchestrator.execute('review-plan', {
  args: [planResult.outputs.plan_document]
});

if (reviewResult.outputs.go_no_go_decision === 'GO') {
  // 3. Implement
  await orchestrator.execute('implement', { args: [], flags: {} });

  // 4. Assert
  await orchestrator.execute('assert', { args: [], flags: {} });

  // 5. Commit
  await orchestrator.execute('commit', { args: [], flags: {} });
}
```

### Custom Integration

```typescript
import { Orchestrator, SessionLifecycle } from 'valora';

class CustomWorkflow {
  private orchestrator: Orchestrator;
  private lifecycle: SessionLifecycle;

  constructor() {
    this.orchestrator = new Orchestrator();
    this.lifecycle = new SessionLifecycle();
  }

  async executeFeatureDevelopment(feature: string) {
    // Create session
    const session = await this.lifecycle.create({
      initialContext: { feature }
    });

    try {
      // Execute workflow
      await this.orchestrator.execute('plan', {
        args: [feature],
        flags: {},
        sessionId: session.session_id
      });

      await this.orchestrator.execute('implement', {
        args: [],
        flags: {},
        sessionId: session.session_id
      });

      // Complete session
      await this.lifecycle.complete();

      return { success: true };
    } catch (error) {
      await this.lifecycle.fail(error);
      throw error;
    }
  }
}
```

## Related Documentation

- [User Guide](../user-guide/README.md) - Getting started
- [Developer Guide](../developer-guide/README.md) - Implementation details
- [Architecture](../architecture/README.md) - System design

---

*For the latest API updates, see the [TypeScript source code](../../.bin/src/).*
