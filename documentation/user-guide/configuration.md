# Configuration and Customization

This guide covers how to configure and customize VALORA for your specific needs.

## Configuration Overview

VALORA uses a multi-level configuration cascade. Settings are resolved in priority order (later wins):

1. **Package defaults** — `data/config.default.json` (shipped with VALORA, read-only)
2. **Global user config** — `~/.valora/config.json` (user preferences)
3. **Project config** — `.valora/config.json` (project-specific settings)
4. **Environment variables** — `VALORA_*` prefix (with `AI_*` as alias)
5. **CLI flags** — Command-line arguments

### Initialising Project Configuration

```bash
valora init          # Creates .valora/config.json with minimal defaults
valora init --full   # Also creates override directories for agents, commands, etc.
```

## Configuration File

The primary configuration file is located at `.valora/config.json` (project-level) or `~/.valora/config.json` (global).

### Basic Structure

```json
{
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"api_key_env": "ANTHROPIC_API_KEY",
				"default_model": "claude-sonnet-4.5",
				"timeout_ms": 300000
			},
			"openai": {
				"api_key_env": "OPENAI_API_KEY",
				"default_model": "gpt-5-thinking-high",
				"timeout_ms": 300000
			},
			"google": {
				"api_key_env": "GOOGLE_AI_API_KEY",
				"default_model": "gemini-2.0-flash-thinking-exp",
				"timeout_ms": 300000
			}
		}
	},
	"execution": {
		"default_mode": "guided",
		"enable_parallel_execution": true,
		"max_concurrent_stages": 4
	},
	"session": {
		"auto_save": true,
		"auto_save_interval_ms": 5000,
		"cleanup_days": 30,
		"encryption": true
	},
	"logging": {
		"level": "info",
		"file_enabled": true,
		"daily_file_max_size_mb": 100
	}
}
```

## LLM Configuration

### Provider Setup

Configure API keys via environment variables:

```bash
# ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
```

Or use the setup command:

```bash
valora config setup
```

### Model Selection

Override models per command:

```bash
# Use specific model
valora plan --model claude-sonnet-4.5 "Add auth"

# Use cheaper model for simple tasks
valora implement --model claude-haiku "Fix typo"
```

### Model Configuration

Customize model settings in `.valora/config.json`:

```json
{
	"llm": {
		"providers": {
			"anthropic": {
				"models": {
					"claude-sonnet-4.5": {
						"max_tokens": 8192,
						"temperature": 0.7,
						"top_p": 1.0
					}
				}
			}
		}
	}
}
```

## Execution Modes

### Guided Mode (Default)

No configuration needed. The engine generates prompts for Cursor AI.

**Characteristics**:

- Free (uses Cursor subscription)
- Interactive
- Best for learning and development

### API Mode

Requires API keys. The engine calls LLM APIs directly.

**Enable**:

```json
{
	"execution": {
		"default_mode": "api"
	}
}
```

**Characteristics**:

- Paid (API usage)
- Autonomous
- Best for automation

### MCP Sampling (Future)

Native Cursor integration via Model Context Protocol.

**Status**: Not yet available

## Session Configuration

### Auto-Save

Control how frequently sessions are saved:

```json
{
	"session": {
		"auto_save": true,
		"auto_save_interval_ms": 5000 // 5 seconds
	}
}
```

**Options**:

- `1000` - Aggressive (every 1 second)
- `5000` - Balanced (every 5 seconds, recommended)
- `10000` - Conservative (every 10 seconds)

### Session Cleanup

Automatically clean up old sessions:

```json
{
	"session": {
		"cleanup_days": 30, // Delete sessions older than 30 days
		"cleanup_enabled": true
	}
}
```

### Session Encryption

Enable/disable session encryption:

```json
{
	"session": {
		"encryption": true // Encrypt sensitive session data
	}
}
```

## Logging Configuration

### Log Levels

Set the logging verbosity:

```json
{
	"logging": {
		"level": "info" // debug | info | warn | error
	}
}
```

**Levels**:

- `debug` - Verbose logging for troubleshooting
- `info` - Standard operational logs (recommended)
- `warn` - Only warnings and errors
- `error` - Only errors

### File Logging

Configure log file rotation:

```json
{
	"logging": {
		"file_enabled": true,
		"daily_file_max_size_mb": 100, // Rotate when file exceeds 100MB
		"log_directory": ".valora/logs"
	}
}
```

### Console Output

Control console output:

```json
{
	"logging": {
		"console_enabled": true,
		"console_colors": true,
		"verbose": false
	}
}
```

## Agent Configuration

### Custom Agents

Add custom agents in `.valora/agents/` (project-level overrides) or `data/agents/` (built-in):

```markdown
---
name: custom-agent
role: 'Custom Specialist'
expertise:
  - 'Custom domain knowledge'
llm_model: claude-sonnet-4.5
---

# Custom Agent

You are a specialized agent for custom tasks...
```

### Agent Selection

Configure agent selection rules:

```json
{
	"agents": {
		"auto_select": true,
		"selection_strategy": "expertise_match",
		"fallback_agent": "lead"
	}
}
```

## Feature Flags

Feature flags control the phased rollout of the dynamic agent selection system. They are configured in the `features` section of the config file and can also be set via environment variables.

### Configuration

```json
{
	"features": {
		"dynamic_agent_selection": false,
		"dynamic_agent_selection_implement_only": true,
		"agent_selection_analytics": false,
		"agent_selection_monitoring": false,
		"agent_selection_fallback_reporting": false
	}
}
```

### Flag Reference

#### `dynamic_agent_selection`

|             |                                      |
| ----------- | ------------------------------------ |
| **Default** | `false`                              |
| **Status**  | Active                               |
| **Env var** | `AI_FEATURE_DYNAMIC_AGENT_SELECTION` |

Enables **system-wide dynamic agent selection** for all commands that declare `dynamic_agent_selection: true` in their metadata. When enabled, the system automatically picks the best agent for a task based on context analysis (file types, dependencies, complexity) instead of using the statically assigned agent from command metadata. Falls back to the command's `fallback_agent` when dynamic resolution fails.

Takes precedence over `dynamic_agent_selection_implement_only` — when this flag is `true`, the `implement_only` variant is ignored.

#### `dynamic_agent_selection_implement_only`

|             |                                                     |
| ----------- | --------------------------------------------------- |
| **Default** | `true`                                              |
| **Status**  | Active                                              |
| **Env var** | `AI_FEATURE_DYNAMIC_AGENT_SELECTION_IMPLEMENT_ONLY` |

**Phase 1 gradual rollout gate.** Restricts dynamic agent selection to only the `implement` command, limiting the blast radius while the system is being validated. This is the only flag enabled by default.

When `dynamic_agent_selection` is `true` (full mode), this flag is ignored.

#### `agent_selection_analytics`

|             |                                        |
| ----------- | -------------------------------------- |
| **Default** | `false`                                |
| **Status**  | Active                                 |
| **Env var** | `AI_FEATURE_AGENT_SELECTION_ANALYTICS` |

Enables **telemetry collection** on agent selection decisions. When active, the analytics service records:

- Agent and command distribution patterns
- Confidence scores for each selection
- Fallback rate (selections with confidence below 0.75)
- Manual override rates and reasons
- Task metadata (affected files, dependencies, complexity)

Collected data is used to calculate rollout success metrics such as accuracy percentage, completion rates, and user satisfaction scores.

#### `agent_selection_monitoring`

|             |                                         |
| ----------- | --------------------------------------- |
| **Default** | `false`                                 |
| **Status**  | Planned (not yet implemented)           |
| **Env var** | `AI_FEATURE_AGENT_SELECTION_MONITORING` |

**Reserved for future real-time monitoring and alerting.** The schema and environment variable mapping are in place, but no execution logic reads this flag yet. Intended for system health metrics such as agent resolution latency, error rates, and performance alerts.

#### `agent_selection_fallback_reporting`

|             |                                                 |
| ----------- | ----------------------------------------------- |
| **Default** | `false`                                         |
| **Status**  | Planned (not yet implemented)                   |
| **Env var** | `AI_FEATURE_AGENT_SELECTION_FALLBACK_REPORTING` |

**Reserved for future fallback diagnostics.** The schema and environment variable mapping are in place, but no execution logic reads this flag yet. Intended to produce detailed reports when dynamic agent selection fails or confidence drops below threshold, helping diagnose classification issues.

### Rollout Phases

The flags support a phased rollout strategy:

| Phase                         | Flags                                           | Scope                                                                |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| **Phase 1** (current default) | `dynamic_agent_selection_implement_only = true` | Dynamic selection for `implement` command only                       |
| **Phase 2**                   | `dynamic_agent_selection = true`                | Dynamic selection for all supported commands                         |
| **Full rollout**              | All flags `true`                                | Dynamic selection with analytics, monitoring, and fallback reporting |

### Environment Variable Override

All feature flags can be toggled at runtime via environment variables without changing config files:

```bash
# Enable full dynamic agent selection
export AI_FEATURE_DYNAMIC_AGENT_SELECTION=true

# Enable analytics collection
export AI_FEATURE_AGENT_SELECTION_ANALYTICS=true
```

Environment variables follow the standard configuration cascade and take precedence over file-based settings.

## Command Configuration

### Default Arguments

Set default arguments for commands:

```json
{
	"commands": {
		"plan": {
			"default_args": {
				"complexity_threshold": 5,
				"mode": "auto"
			}
		},
		"review-plan": {
			"default_args": {
				"threshold": 7.0
			}
		}
	}
}
```

### Command Aliases

Create command aliases:

```json
{
	"commands": {
		"aliases": {
			"p": "plan",
			"i": "implement",
			"r": "review-plan",
			"c": "commit"
		}
	}
}
```

Usage:

```bash
# Use alias
valora p "Add feature"

# Instead of
valora plan "Add feature"
```

## Pipeline Configuration

### Parallel Execution

Enable parallel stage execution:

```json
{
	"execution": {
		"enable_parallel_execution": true,
		"max_concurrent_stages": 4
	}
}
```

### Stage Caching

Configure stage output caching:

```json
{
	"pipeline": {
		"cache_strategy": "stage", // none | stage | pipeline
		"cache_ttl_seconds": 3600 // Cache for 1 hour
	}
}
```

### Retry Policy

Configure automatic retries:

```json
{
	"pipeline": {
		"retry": {
			"max_attempts": 3,
			"backoff_ms": 1000,
			"retry_on": ["error", "timeout"]
		}
	}
}
```

### Per-Stage Tool Loop Tuning

For stages that involve many files (test generation, documentation, large refactors),
the default tool loop limits may be too tight. Override them per stage in the command's
pipeline YAML:

```yaml
pipeline:
  - stage: test
    prompt: code.implement-tests
    required: true
    max_tool_iterations: 40 # iterations before forcing final output (default: 20)

  - stage: documentation
    prompt: documentation.update-inline-docs
    required: true
    max_tool_iterations: 30
    max_tool_failures: 10 # genuine failures before hard-stop (default: 5)
```

| Field                 | Default | When to raise                                           |
| --------------------- | ------- | ------------------------------------------------------- |
| `max_tool_iterations` | 20      | Stage writes many files or has many steps               |
| `max_tool_failures`   | 5       | Stage involves heavy file navigation (many large files) |

**What counts as a failure:** only tool results whose content starts with `"Error:"`.
Guidance responses — file-not-found hints, "file too large" redirects, "no matches
found" from `rg`/`grep` — do **not** count and will not trigger the hard-stop.

See [Pipeline Resilience](../operations/pipeline-resilience.md) for detailed
diagnostics guidance.

## Metrics Configuration

### Baseline Times

Customize baseline times for your team:

```typescript
// scripts/extract-metrics.ts
const BASELINE_TIMES = {
	avgWorkflowTime: 192, // Your team's average (minutes)
	avgIterations: 2.3,
	avgClarifications: 8.2,
	phases: {
		plan: 24.8,
		'review-plan': 39.6
		// ... customize per phase
	}
};
```

### Optimization Targets

Adjust adoption targets:

```typescript
// scripts/generate-dashboard.ts
const TARGETS = {
	templateUsage: 40, // 40% target
	earlyExitRate: 30, // 30% target
	expressPlanningRate: 15 // 15% target
};
```

## Environment-Specific Configuration

### Development

```json
{
	"environment": "development",
	"logging": {
		"level": "debug"
	},
	"execution": {
		"default_mode": "guided"
	}
}
```

### Production

```json
{
	"environment": "production",
	"logging": {
		"level": "warn"
	},
	"execution": {
		"default_mode": "api"
	},
	"session": {
		"encryption": true
	}
}
```

### CI/CD

```json
{
	"environment": "ci",
	"logging": {
		"level": "info",
		"file_enabled": false
	},
	"execution": {
		"default_mode": "api",
		"enable_parallel_execution": true
	}
}
```

## External MCP Configuration

VALORA can connect to external MCP servers with user approval workflows. The registry includes 15 pre-configured servers across various categories:

| Category            | Servers                                   |
| ------------------- | ----------------------------------------- |
| **Browser/Testing** | Playwright, Chrome DevTools, BrowserStack |
| **Design**          | Figma, Storybook                          |
| **Development**     | GitHub, Serena, Context7                  |
| **Infrastructure**  | Terraform, Firebase, Google Cloud         |
| **Data**            | MongoDB, Elastic                          |
| **Observability**   | Grafana                                   |
| **Research**        | DeepResearch                              |

### External MCP Registry

The external MCP servers are defined in `data/external-mcp.default.json` (built-in) and can be overridden in `.valora/external-mcp.json` (project-level):

```json
{
	"schema_version": "1.0.0",
	"servers": [
		{
			"id": "playwright",
			"name": "Playwright MCP",
			"description": "Browser automation for web testing and interaction",
			"connection": {
				"type": "stdio",
				"command": "pnpm exec",
				"args": ["@playwright/mcp@latest"]
			},
			"security": {
				"risk_level": "medium",
				"capabilities": ["browser_automation", "screen_capture", "network_requests"],
				"audit_logging": true,
				"max_execution_ms": 60000
			},
			"requires_approval": true,
			"remember_approval": "session",
			"enabled": true,
			"tags": ["browser", "testing", "automation"]
		}
	]
}
```

### External MCP in Config

Configure external MCP integration in `.valora/config.json`:

```json
{
	"external_mcp_servers": {
		"enabled": true,
		"registry_path": ".valora/external-mcp.json"
	}
}
```

### Server Configuration Options

| Option                      | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `id`                        | Unique server identifier                               |
| `name`                      | Display name for approval UI                           |
| `description`               | Server description                                     |
| `connection.type`           | Connection type: `stdio`, `sse`, or `websocket`        |
| `connection.command`        | Command to execute (for stdio)                         |
| `connection.args`           | Command arguments                                      |
| `security.risk_level`       | Risk level: `low`, `medium`, `high`, `critical`        |
| `security.capabilities`     | Capability tags for risk assessment                    |
| `security.audit_logging`    | Enable audit logging                                   |
| `security.max_execution_ms` | Maximum execution time                                 |
| `security.tool_blocklist`   | Tools to block                                         |
| `requires_approval`         | Require user approval before connecting                |
| `remember_approval`         | Approval memory: `always_ask`, `session`, `persistent` |

### Approval Options

When a command requires an external MCP, users see an approval prompt:

```
┌─────────────────────────────────────────────────────────┐
│         External MCP Server Request                     │
│                 Playwright MCP                          │
└─────────────────────────────────────────────────────────┘

Security Assessment:
  Risk Level:   MEDIUM
  Capabilities: browser_automation, screen_capture

? Allow connection to Playwright MCP?
  [A]pprove - Connect and remember for future sessions
  [S]ession - Approve for this session only
  [C]onfigure - Review and filter tools
  [D]eny - Block this connection
```

### Declaring MCP Requirements in Commands

Commands can declare external MCP requirements in their definition:

```json
{
	"external_mcp": [
		{
			"serverId": "playwright",
			"reason": "E2E testing requires browser automation",
			"optional": false
		}
	]
}
```

### Audit Logging

All external MCP operations are logged to `.valora/logs/mcp-audit.jsonl`:

```json
{"operation":"approval","serverId":"playwright","success":true,"timestamp":"2024-01-15T10:30:00Z"}
{"operation":"connect","serverId":"playwright","success":true,"timestamp":"2024-01-15T10:30:01Z"}
{"operation":"tool_call","serverId":"playwright","toolName":"navigate","success":true,"duration_ms":1500}
```

## Hooks Configuration

VALORA supports PreToolUse hooks that intercept tool calls before execution. Hooks are configured in `data/hooks.default.json` (built-in defaults) and can be overridden in `.valora/hooks.json` (project-level). This ensures that `valora config setup` does not overwrite hook configuration.

### PreToolUse Hooks

PreToolUse hooks run before a tool is executed. Each hook has a `matcher` (regex against the tool name) and a list of hook commands.

**`.valora/hooks.json`:**

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "^run_terminal_cmd$",
				"hooks": [
					{
						"type": "command",
						"command": "bash data/hooks/enforce-modern-cli.sh",
						"timeout": 5000
					}
				]
			}
		]
	},
	"enforcement": {
		"package_manager": {
			"enabled": true,
			"blocked": "npm",
			"replacement": "pnpm"
		}
	}
}
```

| Field             | Description                                 |
| ----------------- | ------------------------------------------- |
| `matcher`         | Regex pattern matched against the tool name |
| `hooks[].type`    | Hook type (`command`)                       |
| `hooks[].command` | Shell command to execute                    |
| `hooks[].timeout` | Maximum execution time in milliseconds      |

Hook scripts receive the tool call JSON on stdin and can:

- **Allow** the call by exiting with code 0
- **Block** the call by outputting a JSON object with `hookSpecificOutput` containing `permissionDecision` and `permissionDecisionReason` fields, then exiting with code 2

If a hook errors or times out, the tool call is allowed (fail-open).

### CLI Enforcement Rules

The built-in `enforce-modern-cli.sh` hook blocks legacy CLI commands and suggests modern alternatives. See the [Modern CLI Toolkit](../developer-guide/modern-cli-toolkit/README.md) for the full list of enforced rules.

The package manager enforcement is configurable in `.valora/hooks.json`:

```json
{
	"enforcement": {
		"package_manager": {
			"enabled": true,
			"blocked": "npm",
			"replacement": "pnpm"
		}
	}
}
```

| Field         | Description                             | Default  |
| ------------- | --------------------------------------- | -------- |
| `enabled`     | Enable/disable the package manager rule | `true`   |
| `blocked`     | Package manager command to block        | `"npm"`  |
| `replacement` | Suggested replacement                   | `"pnpm"` |

For the architectural rationale, see [ADR-008: PreToolUse CLI Enforcement](../adr/008-pretooluse-cli-enforcement.md).

## Advanced Customization

### Custom Templates

Create custom plan templates in your project's `.valora/templates/` directory:

```bash
# Initialise full project structure
valora init --full

# Copy a built-in template to your project overrides
cp data/templates/plans/PATTERN_REST_API.md \
   .valora/templates/plans/PATTERN_CUSTOM.md

# Edit template
code .valora/templates/plans/PATTERN_CUSTOM.md
```

### Custom Prompts

Override default prompts by placing them in `.valora/prompts/`:

```bash
# Copy a built-in prompt to your project overrides
cp data/prompts/03_plan/assess-complexity.md \
   .valora/prompts/03_plan/assess-complexity.md

# Edit prompt — project overrides take precedence over built-ins
code .valora/prompts/03_plan/assess-complexity.md
```

### Custom Commands

Add custom commands in `.valora/commands/`:

```markdown
---
name: custom-command
description: Custom workflow command
agent: lead
model: claude-sonnet-4.5
prompts:
  pipeline:
    - stage: step1
      prompt: custom.step1
      required: true
---

# Custom Command

Custom command implementation...
```

## Configuration Best Practices

### 1. Version Control

**DO** commit shared `.valora/` settings to version control (hooks, commands, agents).

**DON'T** commit `.valora/config.json` (contains API keys). The generated `.valora/.gitignore` handles this by default.

### 2. Environment Variables

Store sensitive data in environment variables:

```bash
# .env (not committed)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Load in shell:

```bash
source .env
```

### 3. Team Configuration

Create team-specific configuration:

```json
{
	"team": {
		"name": "backend-team",
		"baseline_times": {
			"avgWorkflowTime": 180 // Team-specific baseline
		},
		"default_agent": "software-engineer-typescript-backend",
		"preferred_model": "claude-sonnet-4.5"
	}
}
```

### 4. Local Overrides

Use the global config for personal preferences that apply across all projects:

```json
// ~/.valora/config.json
{
	"logging": {
		"level": "debug"
	},
	"execution": {
		"default_mode": "api"
	}
}
```

This is automatically merged into the configuration cascade (global < project < env vars < CLI flags).

## Troubleshooting Configuration

### Configuration Not Loading

**Check**:

1. File exists: `ls .valora/config.json` or `ls ~/.valora/config.json`
2. Valid JSON: `jq '.' .valora/config.json`
3. Run diagnostics: `valora doctor`

### API Keys Not Found

**Check**:

1. Environment variables set: `echo $ANTHROPIC_API_KEY`
2. Correct variable names in config
3. Keys not expired

### Model Not Available

**Check**:

1. Model name spelling
2. Provider configuration
3. API access to model

### Sessions Not Saving

**Check**:

1. `auto_save` enabled
2. Permissions on `.valora/sessions/` (or `~/.valora/sessions/`)
3. Disk space available

## Configuration Examples

### Minimal Configuration

```json
{
	"llm": {
		"default_provider": "anthropic"
	},
	"execution": {
		"default_mode": "guided"
	}
}
```

### Full Configuration

See `data/config.default.json` for the full default configuration with all options documented.

### Team Configuration

```json
{
	"team": "backend",
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"default_model": "claude-sonnet-4.5"
			}
		}
	},
	"agents": {
		"default": "software-engineer-typescript-backend"
	},
	"execution": {
		"enable_parallel_execution": true
	},
	"metrics": {
		"baseline_workflow_time": 180,
		"targets": {
			"template_usage": 45,
			"early_exit_rate": 35
		}
	}
}
```

## Related Documentation

- [Quick Start](./quick-start.md) - Getting started guide
- [Commands](./commands.md) - Command reference
- [Developer Guide: Setup](../developer-guide/setup.md) - Development environment
- [Architecture: Components](../architecture/components.md) - System components

---

_For programmatic configuration, see the TypeScript API documentation._
