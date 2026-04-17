# Configuration

> How to configure VALORA for your project, team, and environment.

## Config Quick Reference

| Setting                               | Default           | Description                                              |
| ------------------------------------- | ----------------- | -------------------------------------------------------- |
| `llm.default_provider`                | `"anthropic"`     | Active LLM provider                                      |
| `llm.providers.*.api_key_env`         | provider-specific | Environment variable holding the API key                 |
| `llm.providers.*.default_model`       | provider-specific | Model used when none is specified                        |
| `llm.providers.*.timeout_ms`          | `300000`          | Request timeout in milliseconds                          |
| `execution.default_mode`              | `"guided"`        | Execution mode: `guided` or `api`                        |
| `execution.enable_parallel_execution` | `true`            | Allow parallel pipeline stages                           |
| `execution.max_concurrent_stages`     | `4`               | Maximum stages running simultaneously                    |
| `session.auto_save`                   | `true`            | Save session state automatically                         |
| `session.auto_save_interval_ms`       | `5000`            | Auto-save interval                                       |
| `session.cleanup_days`                | `30`              | Delete sessions older than N days                        |
| `session.encryption`                  | `true`            | Encrypt session data at rest                             |
| `logging.level`                       | `"info"`          | Log verbosity: `debug`, `info`, `warn`, `error`          |
| `logging.file_enabled`                | `true`            | Write logs to file                                       |
| `logging.daily_file_max_size_mb`      | `100`             | Rotate log file at this size                             |
| `memory.enabled`                      | `true`            | Enable or disable the agent memory system                |
| `memory.episodic_half_life_days`      | `7`               | Decay half-life for episodic memory (events, errors)     |
| `memory.semantic_half_life_days`      | `30`              | Decay half-life for semantic memory (patterns, insights) |
| `memory.decision_half_life_days`      | `21`              | Decay half-life for decision memory (architecture)       |
| `memory.retrieval_boost_days`         | `2`               | Days added to half-life each time an entry is accessed   |
| `memory.prune_threshold`              | `0.05`            | Minimum strength below which an entry is pruned          |
| `memory.max_entries_per_store`        | `500`             | Maximum entries per JSON store before automatic pruning  |
| `memory.error_half_life_multiplier`   | `2`               | Half-life multiplier applied to error entries (isError)  |
| `memory.injection_token_budget`       | `2000`            | Maximum tokens allocated for injected agent memory       |
| `memory.injection_strength_threshold` | `0.2`             | Minimum entry strength required for prompt injection     |

## Configuration Cascade

Settings are resolved in priority order (later wins):

1. **Package defaults** — `data/config.default.json` (shipped with VALORA, read-only)
2. **Global user config** — `~/.valora/config.json` (personal preferences across all projects)
3. **Project config** — `.valora/config.json` (project-specific settings, committed to version control)
4. **Environment variables** — `VALORA_*` prefix (with `AI_*` as alias)
5. **CLI flags** — command-line arguments (highest priority)

## Initialising Project Configuration

```bash
valora init          # Creates .valora/config.json with minimal defaults
valora init --full   # Also creates override directories for agents, commands, prompts, etc.
```

---

## Provider Setup

The most common first step. Set your API key as an environment variable, then point VALORA at it in the config file.

### Step 1 — Export your API key

```bash
# ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."
```

### Step 2 — Set a default provider

```bash
valora config setup   # Interactive wizard (recommended)
```

Or edit `.valora/config.json` directly:

```json
{
	"llm": {
		"default_provider": "anthropic"
	}
}
```

### Step 3 — Test the connection

```bash
valora doctor
```

---

## Common Configuration Examples

### Minimal (guided mode, Anthropic)

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

### API mode for automation

```json
{
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"api_key_env": "ANTHROPIC_API_KEY",
				"default_model": "claude-sonnet-4.6"
			}
		}
	},
	"execution": {
		"default_mode": "api"
	}
}
```

### Team / shared project config

```json
{
	"team": "backend",
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"default_model": "claude-sonnet-4.6"
			}
		}
	},
	"agents": {
		"default": "software-engineer-typescript-backend"
	},
	"execution": {
		"enable_parallel_execution": true
	}
}
```

### Local model (no API key)

```json
{
	"llm": {
		"default_provider": "local",
		"providers": {
			"local": {
				"baseUrl": "http://localhost:11434/v1",
				"default_model": "llama3.1"
			}
		}
	}
}
```

### CI/CD

```json
{
	"logging": {
		"level": "info",
		"file_enabled": false
	},
	"execution": {
		"default_mode": "api",
		"enable_parallel_execution": true
	},
	"session": {
		"encryption": true
	}
}
```

---

## External MCP Configuration

VALORA can connect to external MCP servers with user approval workflows. Fifteen servers are pre-configured in the built-in registry.

| Category            | Servers                                   |
| ------------------- | ----------------------------------------- |
| **Browser/Testing** | Playwright, Chrome DevTools, BrowserStack |
| **Design**          | Figma, Storybook                          |
| **Development**     | GitHub, Serena, Context7                  |
| **Infrastructure**  | Terraform, Firebase, Google Cloud         |
| **Data**            | MongoDB, Elastic                          |
| **Observability**   | Grafana                                   |
| **Research**        | DeepResearch                              |

### Enable external MCP

In `.valora/config.json`:

```json
{
	"external_mcp_servers": {
		"enabled": true,
		"registry_path": ".valora/external-mcp.json"
	}
}
```

### Approval prompt

When a command requires an external MCP server, VALORA shows:

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

All external MCP operations are logged to `.valora/logs/mcp-audit.jsonl`.

<details>
<summary><strong>Registry format, server configuration options, and declaring MCP requirements in commands</strong></summary>

**Registry files:** `data/external-mcp.default.json` (built-in) and `.valora/external-mcp.json` (project override).

**Example server entry:**

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
				"command": "npx",
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

**Server configuration options:**

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
| `security.max_execution_ms` | Maximum execution time in milliseconds                 |
| `security.tool_blocklist`   | Tools to block                                         |
| `requires_approval`         | Require user approval before connecting                |
| `remember_approval`         | Approval memory: `always_ask`, `session`, `persistent` |

**Declaring MCP requirements in commands:**

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

</details>

---

## Feature Flags

Feature flags control the phased rollout of the dynamic agent selection system.

| Flag                                     | Default | Status  | Description                                                    |
| ---------------------------------------- | ------- | ------- | -------------------------------------------------------------- |
| `dynamic_agent_selection`                | `false` | Active  | System-wide dynamic agent selection for all supported commands |
| `dynamic_agent_selection_implement_only` | `true`  | Active  | Restrict dynamic selection to `implement` only (Phase 1 gate)  |
| `agent_selection_analytics`              | `false` | Active  | Telemetry on agent selection decisions                         |
| `agent_selection_monitoring`             | `false` | Planned | Real-time monitoring and alerting (not yet implemented)        |
| `agent_selection_fallback_reporting`     | `false` | Planned | Fallback diagnostics reporting (not yet implemented)           |

Configure in `.valora/config.json`:

```json
{
	"features": {
		"dynamic_agent_selection": false,
		"dynamic_agent_selection_implement_only": true,
		"agent_selection_analytics": false
	}
}
```

Override at runtime via environment variables:

```bash
export AI_FEATURE_DYNAMIC_AGENT_SELECTION=true
export AI_FEATURE_AGENT_SELECTION_ANALYTICS=true
```

<details>
<summary><strong>Flag details, rollout phases, and environment variable reference</strong></summary>

#### `dynamic_agent_selection`

**Env var:** `AI_FEATURE_DYNAMIC_AGENT_SELECTION`

Enables system-wide dynamic agent selection for all commands that declare `dynamic_agent_selection: true` in their metadata. The system picks the best agent based on file types, dependencies, and task complexity instead of using the statically assigned agent. Falls back to the command's `fallback_agent` when dynamic resolution fails.

When this flag is `true`, `dynamic_agent_selection_implement_only` is ignored.

#### `dynamic_agent_selection_implement_only`

**Env var:** `AI_FEATURE_DYNAMIC_AGENT_SELECTION_IMPLEMENT_ONLY`

Phase 1 gradual rollout gate. Restricts dynamic agent selection to the `implement` command only, limiting blast radius while the system is being validated. This is the only flag enabled by default.

Ignored when `dynamic_agent_selection` is `true`.

#### `agent_selection_analytics`

**Env var:** `AI_FEATURE_AGENT_SELECTION_ANALYTICS`

Enables telemetry collection on agent selection decisions. Records: agent and command distribution patterns, confidence scores, fallback rate (confidence below 0.75), manual override rates and reasons, and task metadata (affected files, dependencies, complexity).

#### `agent_selection_monitoring`

**Env var:** `AI_FEATURE_AGENT_SELECTION_MONITORING`

Reserved for future real-time monitoring and alerting. The schema and environment variable mapping are in place, but no execution logic reads this flag yet.

#### `agent_selection_fallback_reporting`

**Env var:** `AI_FEATURE_AGENT_SELECTION_FALLBACK_REPORTING`

Reserved for future fallback diagnostics. The schema and environment variable mapping are in place, but no execution logic reads this flag yet.

**Rollout phases:**

| Phase                         | Flags                                           | Scope                                                                |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| **Phase 1** (current default) | `dynamic_agent_selection_implement_only = true` | Dynamic selection for `implement` only                               |
| **Phase 2**                   | `dynamic_agent_selection = true`                | Dynamic selection for all supported commands                         |
| **Full rollout**              | All flags `true`                                | Dynamic selection with analytics, monitoring, and fallback reporting |

</details>

---

## Plugin Configuration

Plugins are opt-in. List the plugins you want active under `plugins.enabled`.

```json
{
	"plugins": {
		"enabled": ["valora-plugin-rtk", "acme-react-agents"]
	}
}
```

| Key               | Type       | Default | Description                                               |
| ----------------- | ---------- | ------- | --------------------------------------------------------- |
| `plugins.enabled` | `string[]` | `[]`    | Plugin names to load; plugins not listed here are skipped |

Run `valora doctor` to see which plugins are loaded, their version, and what they contribute.

See [Plugins](./plugins.md) for installation instructions and `valora-plugin.json` manifest details.

---

## Hooks Configuration

VALORA supports PreToolUse hooks that intercept tool calls before execution. Built-in defaults are in `data/hooks.default.json`; project overrides go in `.valora/hooks.json`.

### PreToolUse hooks

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
	}
}
```

| Field             | Description                            |
| ----------------- | -------------------------------------- |
| `matcher`         | Regex matched against the tool name    |
| `hooks[].type`    | Hook type (`command`)                  |
| `hooks[].command` | Shell command to execute               |
| `hooks[].timeout` | Maximum execution time in milliseconds |

Hook scripts receive the tool call JSON on stdin and can:

- **Allow** by exiting with code 0
- **Block** by outputting a JSON object with `hookSpecificOutput` containing `permissionDecision` and `permissionDecisionReason`, then exiting with code 2

If a hook errors or times out, the tool call is allowed (fail-open).

<details>
<summary><strong>Package manager enforcement and CLI enforcement rules</strong></summary>

The built-in `enforce-modern-cli.sh` hook blocks legacy CLI commands and suggests modern alternatives. See the [Modern CLI Toolkit](../developer-guide/modern-cli-toolkit/README.md) for the full list of enforced rules.

**Package manager enforcement** is configurable in `.valora/hooks.json`:

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

</details>

---

## Advanced Customisation

### Custom templates

```bash
# Initialise full project structure
valora init --full

# Copy a built-in template to your project overrides
cp data/templates/plans/PATTERN_REST_API.md \
   .valora/templates/plans/PATTERN_CUSTOM.md

# Edit the template
code .valora/templates/plans/PATTERN_CUSTOM.md
```

### Custom prompts

```bash
# Copy a built-in prompt to your project overrides
cp data/prompts/03_plan/assess-complexity.md \
   .valora/prompts/03_plan/assess-complexity.md

# Edit — project overrides take precedence over built-ins
code .valora/prompts/03_plan/assess-complexity.md
```

### Custom commands

Add a Markdown file with YAML front matter to `.valora/commands/`:

```markdown
---
name: custom-command
description: Custom workflow command
agent: lead
model: claude-sonnet-4.6
prompts:
  pipeline:
    - stage: step1
      prompt: custom.step1
      required: true
---

# Custom Command

Custom command implementation...
```

### Custom agents

Add agent definitions to `.valora/agents/` (project-level) or `data/agents/` (built-in):

```markdown
---
name: custom-agent
role: 'Custom Specialist'
expertise:
  - 'Custom domain knowledge'
llm_model: claude-sonnet-4.6
---

# Custom Agent

You are a specialised agent for custom tasks...
```

---

## Detailed Provider Configuration

<details>
<summary><strong>Full configuration for each provider</strong></summary>

### Anthropic

```json
{
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"api_key_env": "ANTHROPIC_API_KEY",
				"default_model": "claude-sonnet-4.6",
				"timeout_ms": 300000,
				"prompt_caching": true,
				"models": {
					"claude-sonnet-4.6": {
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

### OpenAI

```json
{
	"llm": {
		"providers": {
			"openai": {
				"api_key_env": "OPENAI_API_KEY",
				"default_model": "gpt-5-thinking-high",
				"timeout_ms": 300000
			}
		}
	}
}
```

### Google

```json
{
	"llm": {
		"providers": {
			"google": {
				"api_key_env": "GOOGLE_AI_API_KEY",
				"default_model": "gemini-2.0-flash-thinking-exp",
				"timeout_ms": 300000
			}
		}
	}
}
```

### Local (Ollama, LM Studio, vLLM, llama.cpp, LocalAI, etc.)

No API key required. Any OpenAI-compatible local server is supported.

```json
{
	"llm": {
		"providers": {
			"local": {
				"baseUrl": "http://localhost:11434/v1",
				"default_model": "llama3.1"
			}
		}
	}
}
```

Or via environment variables:

```bash
export LOCAL_BASE_URL=http://localhost:11434/v1
export LOCAL_DEFAULT_MODEL=llama3.1
```

Or via CLI flags:

```bash
valora plan "Add auth" --provider local --model llama3.1
valora commit --model deepseek-coder    # keyword 'deepseek' → local
```

Model names containing `llama`, `mistral`, `phi`, `qwen`, `codellama`, `deepseek`, or `yi` automatically route to the local provider when no `--provider` flag is given.

If the server is unreachable, VALORA shows:

```
Cannot connect to local model server at http://localhost:11434/v1.
Is your server running? For Ollama: `ollama serve`
```

</details>

---

## Execution Modes

<details>
<summary><strong>Guided mode vs API mode vs MCP Sampling</strong></summary>

### Guided mode (default)

No configuration needed. VALORA generates prompts for Cursor AI.

- Free (uses Cursor subscription)
- Interactive
- Best for learning and development

### API mode

Requires API keys. VALORA calls LLM APIs directly.

```json
{
	"execution": {
		"default_mode": "api"
	}
}
```

- Paid (API usage)
- Autonomous
- Best for automation and CI/CD

### MCP Sampling (future)

Native Cursor integration via Model Context Protocol. **Status:** Not yet available.

</details>

---

## Prompt Caching

<details>
<summary><strong>Provider behaviour, configuration, and token usage display</strong></summary>

Prompt caching reduces input token costs by reusing previously sent content across tool-loop iterations.

| Provider      | Behaviour                  | Configuration                           |
| ------------- | -------------------------- | --------------------------------------- |
| **Anthropic** | Explicit cache breakpoints | Enable with `prompt_caching: true`      |
| **OpenAI**    | Automatic                  | No configuration needed — always active |
| **Google**    | Automatic                  | No configuration needed — always active |
| **Cursor**    | Not applicable             | N/A (MCP protocol)                      |
| **Local**     | Server-dependent           | Depends on the local server             |

To enable Anthropic prompt caching:

```json
{
	"llm": {
		"providers": {
			"anthropic": {
				"prompt_caching": true
			}
		}
	}
}
```

When enabled, the system injects cache breakpoints on the system prompt, tool definitions, and conversation history. Subsequent iterations in a tool loop reuse cached content at a 90% discount. The CLI displays cache hit rates in the token usage summary:

```
📊 Token Usage:
   • This interaction: 15,432 tokens
     └─ Context: 12,100 tokens (78%)
     └─ Generation: 3,332 tokens (22%)
     └─ Cache read: 10,500 tokens (87% hit rate)
     └─ Cache write: 1,600 tokens
```

For OpenAI and Google, cache metrics are extracted from API responses automatically and displayed when present.

</details>

---

## Pipeline Resilience Configuration

<details>
<summary><strong>Per-stage tool loop tuning, failure policies, and what counts as a failure</strong></summary>

For stages that involve many files (test generation, documentation, large refactors), the default tool loop limits may be too tight. Override them per stage in the command's pipeline YAML:

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

  - stage: context
    prompt: context.load-implementation-context
    required: true
    failure_policy: tolerant # only fatal (mutating) failures trigger hard-stop
```

| Field                 | Default        | When to change                                                              |
| --------------------- | -------------- | --------------------------------------------------------------------------- |
| `max_tool_iterations` | 20             | Stage writes many files or has many steps                                   |
| `max_tool_failures`   | 5              | Stage involves heavy file navigation                                        |
| `failure_policy`      | per stage type | Stage is read-only/exploratory (`tolerant`) or must never block (`lenient`) |

**What counts as a failure:** only tool results whose content starts with `"Error:"`. Guidance responses — file-not-found hints, "file too large" redirects, "no matches found" from `rg`/`grep`, and exploratory commands (`which`, `test`, `cd`, `fd`) exiting with code 1 — do **not** count.

**Failure policy:**

- `strict` — all failures count (default for `code`, `test`, `refactor`, `deployment`, `maintenance`)
- `tolerant` — only fatal failures from mutating tools (`write`, `search_replace`, `delete_file`) count (default for `context`, `review`, `plan`, `breakdown`, `onboard`, `documentation`)
- `lenient` — never hard-stops regardless of failures

See [Pipeline Resilience](../operations/pipeline-resilience.md) for detailed diagnostics guidance.

</details>

---

## Environment Variable Reference

<details>
<summary><strong>All VALORA_* and AI_* environment variables</strong></summary>

### LLM provider keys

| Variable              | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`   | Anthropic API key                                             |
| `OPENAI_API_KEY`      | OpenAI API key                                                |
| `GOOGLE_AI_API_KEY`   | Google AI API key                                             |
| `LOCAL_BASE_URL`      | Local model server URL (default: `http://localhost:11434/v1`) |
| `LOCAL_DEFAULT_MODEL` | Default local model name                                      |

### Feature flags

| Variable                                            | Config key                                        |
| --------------------------------------------------- | ------------------------------------------------- |
| `AI_FEATURE_DYNAMIC_AGENT_SELECTION`                | `features.dynamic_agent_selection`                |
| `AI_FEATURE_DYNAMIC_AGENT_SELECTION_IMPLEMENT_ONLY` | `features.dynamic_agent_selection_implement_only` |
| `AI_FEATURE_AGENT_SELECTION_ANALYTICS`              | `features.agent_selection_analytics`              |
| `AI_FEATURE_AGENT_SELECTION_MONITORING`             | `features.agent_selection_monitoring`             |
| `AI_FEATURE_AGENT_SELECTION_FALLBACK_REPORTING`     | `features.agent_selection_fallback_reporting`     |

### Keeping secrets safe

Store sensitive values in a `.env` file (not committed to version control):

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Load into your shell:

```bash
source .env
```

The generated `.valora/.gitignore` excludes `config.json` by default. **Do not commit `.valora/config.json`** if it contains API keys. Commit hooks, commands, agents, and prompt overrides — these contain no secrets.

</details>

---

## Full Config Schema Reference

<details>
<summary><strong>Complete .valora/config.json schema with all fields</strong></summary>

```json
{
	"llm": {
		"default_provider": "anthropic",
		"providers": {
			"anthropic": {
				"api_key_env": "ANTHROPIC_API_KEY",
				"default_model": "claude-sonnet-4.6",
				"timeout_ms": 300000,
				"prompt_caching": true,
				"models": {
					"<model-name>": {
						"max_tokens": 8192,
						"temperature": 0.7,
						"top_p": 1.0
					}
				}
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
			},
			"local": {
				"baseUrl": "http://localhost:11434/v1",
				"default_model": "llama3.1"
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
		"cleanup_enabled": true,
		"encryption": true
	},
	"logging": {
		"level": "info",
		"file_enabled": true,
		"daily_file_max_size_mb": 100,
		"log_directory": ".valora/logs",
		"console_enabled": true,
		"console_colors": true,
		"verbose": false
	},
	"agents": {
		"auto_select": true,
		"selection_strategy": "expertise_match",
		"fallback_agent": "lead",
		"default": "lead"
	},
	"pipeline": {
		"cache_strategy": "stage",
		"cache_ttl_seconds": 3600,
		"retry": {
			"max_attempts": 3,
			"backoff_ms": 1000,
			"retry_on": ["error", "timeout"]
		}
	},
	"features": {
		"dynamic_agent_selection": false,
		"dynamic_agent_selection_implement_only": true,
		"agent_selection_analytics": false,
		"agent_selection_monitoring": false,
		"agent_selection_fallback_reporting": false
	},
	"external_mcp_servers": {
		"enabled": true,
		"registry_path": ".valora/external-mcp.json"
	},
	"memory": {
		"enabled": true,
		"episodic_half_life_days": 7,
		"semantic_half_life_days": 30,
		"decision_half_life_days": 21,
		"retrieval_boost_days": 2,
		"prune_threshold": 0.05,
		"max_entries_per_store": 500,
		"error_half_life_multiplier": 2,
		"injection_token_budget": 2000,
		"injection_strength_threshold": 0.2
	},
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
		},
		"aliases": {
			"p": "plan",
			"i": "implement",
			"r": "review-plan",
			"c": "commit"
		}
	},
	"team": {
		"name": "backend-team",
		"default_agent": "software-engineer-typescript-backend",
		"preferred_model": "claude-sonnet-4.6"
	}
}
```

See `data/config.default.json` for the full default configuration shipped with VALORA.

</details>

---

## Memory System Configuration

The memory system stores three classes of agent learning across sessions, each with exponential-decay retention. Every access to an entry extends its half-life by `retrieval_boost_days`. Entries flagged as errors (`isError: true`) receive `error_half_life_multiplier ×` their base half-life, ensuring repeated mistakes are remembered longer.

<details>
<summary><strong>Memory categories, confidence tiers, and consolidation phases</strong></summary>

**Memory categories:**

| Category  | Half-life | Use case                                                     | Default half-life |
| --------- | --------- | ------------------------------------------------------------ | ----------------- |
| Episodic  | 7 days    | Session events, test failures, transient observations        | 7 days            |
| Semantic  | 30 days   | Extracted patterns, team conventions, cross-session insights | 30 days           |
| Decisions | 21 days   | Architectural decisions, tool selections, design rationale   | 21 days           |

**Confidence tiers** (injected into agent prompts in this order):

| Tier       | Source                                            |
| ---------- | ------------------------------------------------- |
| `verified` | Confirmed by user feedback (satisfaction ≥ 8)     |
| `observed` | Drawn from pipeline errors and bottlenecks        |
| `inferred` | Extracted from improvement patterns               |
| `stale`    | Demoted by git invalidation or superseded entries |

**Consolidation phases** (triggered by `valora consolidate` or automatically after `feedback`):

1. **Prune** — Remove entries whose computed strength falls below `prune_threshold`
2. **Git-invalidate** — Cross-reference recent git commits; weaken entries tied to changed or reverted paths
3. **Jaccard-merge** — Combine episodic entries with tag-set overlap ≥ 0.6 into semantic entries
4. **Auto-promote** — Move verified episodic entries with ≥ 5 accesses into the semantic store

**Tuning injection:**

- `injection_token_budget` — Caps the `AGENT MEMORY` context block inserted into agent prompts (default: 2000 tokens). Reduce if you observe context budget pressure.
- `injection_strength_threshold` — Only entries with computed strength ≥ this value are injected (default: 0.2). Increase to inject fewer, higher-confidence memories.

</details>

---

## Troubleshooting

**Configuration not loading**

1. Check the file exists: `ls .valora/config.json` or `ls ~/.valora/config.json`
2. Validate JSON syntax: `cat .valora/config.json | python3 -m json.tool`
3. Run diagnostics: `valora doctor`

**API key not found**

1. Check the variable is exported: `echo $ANTHROPIC_API_KEY`
2. Confirm the variable name matches `api_key_env` in the config
3. Verify the key has not expired

**Model not available**

1. Check the model name spelling
2. Confirm provider configuration is correct
3. Verify API access to that model tier

**Sessions not saving**

1. Confirm `session.auto_save` is `true`
2. Check write permissions on `.valora/sessions/` (or `~/.valora/sessions/`)
3. Check available disk space

---

## Related Documentation

- [Quick Start](./quick-start.md) — Getting started guide
- [Commands](./commands.md) — Command reference
- [Pipeline Resilience](../operations/pipeline-resilience.md) — Tool loop diagnostics
- [Modern CLI Toolkit](../developer-guide/modern-cli-toolkit/README.md) — Enforced CLI rules
- [ADR-008](../adr/008-pretooluse-cli-enforcement.md) — PreToolUse CLI enforcement rationale
