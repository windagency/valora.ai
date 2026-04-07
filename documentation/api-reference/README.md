# API Reference

> VALORA exposes two specialised APIs beyond the CLI: an MCP server for IDE integration and a TypeScript API for programmatic use. CLI flags and configuration schema are documented separately.

## APIs at a Glance

| API        | Audience            | Entry Point                                         |
| ---------- | ------------------- | --------------------------------------------------- |
| CLI        | Interactive use     | See [Commands Reference](../user-guide/commands.md) |
| MCP Server | Cursor / IDE agents | `pnpm dev:mcp` or `valora-mcp start`                |
| TypeScript | Programmatic access | `import { Orchestrator } from 'valora'`             |

For global CLI flags, see [Commands Reference](../user-guide/commands.md).  
For configuration schema, see [Configuration Reference](../user-guide/configuration.md).

---

## MCP Server API

### Starting the Server

```bash
# Development mode
pnpm dev:mcp

# Production mode
valora-mcp start
```

### MCP Tools

| Tool               | Purpose                             |
| ------------------ | ----------------------------------- |
| `execute_workflow` | Execute a named workflow end-to-end |
| `run_command`      | Run a single VALORA command         |
| `query_session`    | Query session context by ID         |

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

---

## TypeScript API

### Installation

```bash
pnpm add @windagency/valora
npm install @windagency/valora
yarn add @windagency/valora
```

### Basic Usage

```typescript
import { Orchestrator } from 'valora';

const orchestrator = new Orchestrator({
	llm: {
		provider: 'anthropic',
		model: 'claude-sonnet-4.6'
	}
});

const result = await orchestrator.execute('plan', {
	args: ['Add user authentication'],
	flags: { pattern: 'rest-api' }
});

console.log(result.outputs);
```

### Core Classes

#### `Orchestrator`

```typescript
class Orchestrator {
	constructor(config?: Partial<OrchestratorConfig>);

	async execute(command: string, options: CommandExecutionOptions): Promise<CommandResult>;
	async executePipeline(pipeline: Pipeline, context: SessionContext): Promise<PipelineResult>;

	getSession(sessionId?: string): Promise<Session>;
	listCommands(): CommandDefinition[];
	listAgents(): AgentDefinition[];
}
```

#### `SessionLifecycle`

```typescript
import { SessionLifecycle } from 'valora/session';

const lifecycle = new SessionLifecycle(config);

const session = await lifecycle.create({ initialContext: { task: 'Add feature' } });
const resumed = await lifecycle.resume({ sessionId: 'abc123' });
await lifecycle.complete();
await lifecycle.fail(error);
```

#### `PipelineExecutor`

```typescript
import { PipelineExecutor } from 'valora/executor';

const executor = new PipelineExecutor(config);

const result = await executor.execute(
	{
		stages: [{ name: 'analyze', prompt: 'context.analyze-task-context', required: true }]
	},
	context
);
```

### Type Definitions

```typescript
interface CommandExecutionOptions {
	args: string[];
	flags: Record<string, boolean | string | undefined>;
	sessionId?: string;
	dryRun?: boolean;
}

interface CommandResult {
	success: boolean;
	outputs: Record<string, unknown>;
	error?: string;
	duration_ms: number;
	tokens_used?: number;
}

interface SessionContext {
	[key: string]: unknown;
}

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

### Error Handling

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

---

## Programmatic Usage Examples

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

### Custom Integration with Session Management

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
		const session = await this.lifecycle.create({
			initialContext: { feature }
		});

		try {
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

			await this.lifecycle.complete();
			return { success: true };
		} catch (error) {
			await this.lifecycle.fail(error);
			throw error;
		}
	}
}
```

<details>
<summary><strong>Extension Points: Custom Agents and Commands</strong></summary>

### Custom Agents

```typescript
import { AgentRegistry } from 'valora/agents';

const registry = new AgentRegistry();

registry.register({
	name: 'custom-agent',
	role: 'Custom Specialist',
	expertise: ['Custom domain'],
	model: 'claude-sonnet-4.6',
	systemPrompt: 'You are a custom agent...'
});

const result = await orchestrator.execute('plan', {
	args: ['Task'],
	flags: { agent: 'custom-agent' }
});
```

### Custom Commands

```typescript
import { CommandRegistry } from 'valora/commands';

const registry = new CommandRegistry();

registry.register({
	name: 'custom-command',
	description: 'Custom workflow',
	agent: 'lead',
	pipeline: {
		stages: [
			/* ... */
		]
	}
});
```

### Event Listeners

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

</details>

---

## Related Documentation

- [Commands Reference](../user-guide/commands.md) — CLI flags and all 24 commands
- [Configuration Reference](../user-guide/configuration.md) — Full configuration schema
- [Architecture](../architecture/README.md) — System design
- [TypeScript source](../../src/) — Source code
