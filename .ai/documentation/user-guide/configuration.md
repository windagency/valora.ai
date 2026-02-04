# Configuration and Customization

This guide covers how to configure and customize VALORA for your specific needs.

## Configuration File

The primary configuration file is located at `.ai/config.json`.

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

Customize model settings in `.ai/config.json`:

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
    "auto_save_interval_ms": 5000  // 5 seconds
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
    "cleanup_days": 30,  // Delete sessions older than 30 days
    "cleanup_enabled": true
  }
}
```

### Session Encryption

Enable/disable session encryption:

```json
{
  "session": {
    "encryption": true  // Encrypt sensitive session data
  }
}
```

## Logging Configuration

### Log Levels

Set the logging verbosity:

```json
{
  "logging": {
    "level": "info"  // debug | info | warn | error
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
    "daily_file_max_size_mb": 100,  // Rotate when file exceeds 100MB
    "log_directory": ".ai/logs"
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

Add custom agents in `.ai/agents/`:

```markdown
---
name: custom-agent
role: "Custom Specialist"
expertise:
  - "Custom domain knowledge"
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
    "cache_strategy": "stage",  // none | stage | pipeline
    "cache_ttl_seconds": 3600   // Cache for 1 hour
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

## Metrics Configuration

### Baseline Times

Customize baseline times for your team:

```typescript
// .ai/scripts/extract-metrics.ts
const BASELINE_TIMES = {
  avgWorkflowTime: 192,  // Your team's average (minutes)
  avgIterations: 2.3,
  avgClarifications: 8.2,
  phases: {
    'plan': 24.8,
    'review-plan': 39.6,
    // ... customize per phase
  }
};
```

### Optimization Targets

Adjust adoption targets:

```typescript
// .ai/scripts/generate-dashboard.ts
const TARGETS = {
  templateUsage: 40,      // 40% target
  earlyExitRate: 30,      // 30% target
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

The external MCP servers are defined in `.ai/external-mcp.json`:

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

Configure external MCP integration in `.ai/config.json`:

```json
{
  "external_mcp_servers": {
    "enabled": true,
    "registry_path": ".ai/external-mcp.json"
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

All external MCP operations are logged to `.ai/logs/mcp-audit.jsonl`:

```json
{"operation":"approval","serverId":"playwright","success":true,"timestamp":"2024-01-15T10:30:00Z"}
{"operation":"connect","serverId":"playwright","success":true,"timestamp":"2024-01-15T10:30:01Z"}
{"operation":"tool_call","serverId":"playwright","toolName":"navigate","success":true,"duration_ms":1500}
```

## Advanced Customization

### Custom Templates

Create custom plan templates:

```bash
# Create template directory
mkdir -p .ai/templates/plans

# Copy existing template
cp .ai/templates/plans/PATTERN_REST_API.md \
   .ai/templates/plans/PATTERN_CUSTOM.md

# Edit template
code .ai/templates/plans/PATTERN_CUSTOM.md
```

### Custom Prompts

Override default prompts:

```bash
# Copy default prompt
cp .ai/prompts/03_plan/assess-complexity.md \
   .ai/prompts/custom/assess-complexity.md

# Edit prompt
code .ai/prompts/custom/assess-complexity.md
```

### Custom Commands

Add custom commands in `.ai/commands/`:

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

**DO** commit `.ai/config.json` to version control.

**DON'T** commit API keys (use environment variables).

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
      "avgWorkflowTime": 180  // Team-specific baseline
    },
    "default_agent": "software-engineer-typescript-backend",
    "preferred_model": "claude-sonnet-4.5"
  }
}
```

### 4. Local Overrides

Use local configuration for personal preferences:

```json
// .ai/config.local.json (gitignored)
{
  "logging": {
    "level": "debug"
  },
  "execution": {
    "default_mode": "api"
  }
}
```

Merge in code:

```typescript
const config = {
  ...defaultConfig,
  ...localConfig
};
```

## Troubleshooting Configuration

### Configuration Not Loading

**Check**:

1. File exists: `ls .ai/config.json`
2. Valid JSON: `jq '.' .ai/config.json`
3. Correct path: Run from project root

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
2. Permissions on `.ai/sessions/`
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

See `.ai/config.example.json` for a complete example with all options documented.

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

*For programmatic configuration, see the TypeScript API documentation.*
