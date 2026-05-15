# `valora-core-generators`

A built-in Valora plugin that contributes prompt templates used when generating new agents and commands. It has no code, no hooks, and no MCP servers — it is prompts only.

---

## What it generates

| Prompt ID                      | Generates                             |
| ------------------------------ | ------------------------------------- |
| `generator.agent_definition`   | A structured agent configuration file |
| `generator.command_definition` | A new Valora command definition       |

---

## Generating a new agent

Invoke the generator with a YAML description of the agent you want:

```
valora generate agent "
  name: secops-reviewer
  purpose: Reviews pull requests for OWASP Top 10 vulnerabilities
  expertise:
    - OWASP Top 10
    - TypeScript security patterns
    - SQL injection, XSS, CSRF
"
```

The generator produces a Markdown file with twelve sections:

1. Mission Statement
2. Expertise Scope
3. Responsibilities
4. Capabilities
5. Constraints
6. Decision-Making Model
7. Context and Information Requirements
8. Operating Principles
9. Tool Use Strategy
10. Communication Pattern
11. Output Format
12. Related Templates

Place the output in your plugin's `agents/` directory and declare `"agents"` in your manifest's `contributes` array.

---

## Generating a new command

```
valora generate command "
  purpose: Validate all Terraform configurations in the monorepo
  inputs:
    - path: directory to scan (default: .)
  output: summary table of pass/fail per module
"
```

The generator produces a Markdown file whose YAML front-matter conforms to the commands schema (`commands/_meta/schema.json`). If the purpose implies multiple stages, it is defined as a compound command that references sub-commands.

Place the output in your plugin's `commands/` directory and declare `"commands"` in `contributes`.

---

## Writing prompts manually

Use `_template.md` as a scaffold for new generator prompts:

```yaml
---
id: generator.<your-id>
version: 1.0.0
category: generator
experimental: true
name: Human-readable name
description: One-line description of what this generates
tags: []
model_requirements:
  min_context: 8192
  recommended: []
  forbidden: []
inputs:
  - name: input_name
    description: What this input contains
    type: string
    required: true
---
Your prompt body here. Reference inputs with {{input_name}} or $ARGUMENTS.
```

Place custom prompt files in your plugin's `prompts/` directory and declare `"prompts"` in `contributes`. No permission is required for prompt-only plugins.

---

## Manifest

```json
{
	"name": "valora-core-generators",
	"version": "1.0.0",
	"contributes": ["prompts"],
	"engines": { "valora": ">=0.1.0" }
}
```

Prompt-only plugins require no `permissions` entry.
