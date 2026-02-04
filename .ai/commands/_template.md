---
name:
description:
experimental:
deprecated:
argument-hint:
allowed-tools:
  # Built-in tools
  - read_file
  - run_terminal_cmd
  # MCP tools (mcp_<server-id> format, see external-mcp.json)
  # - mcp_playwright
  # - mcp_github
  # - mcp_chrome_devtools
model:
agent:
dynamic_agent_selection:
fallback_agent:
agent_selection_criteria:
  -
prompts:
  pipeline:
    - stage:
      prompt:
      required:
      conditional:
      inputs:
        $:
      outputs:
        - 
      parallel:
      timeout_ms:
  merge_strategy:
  rollback_on_failure:
  cache_strategy:
  retry_policy:
    max_attempts:
    backoff_ms:
    retry_on:
      - 
---

# Prompt Orchestration

## Role

Use the [agent] profile

## Goal

// TO COMPLETE

## Rules

// TO COMPLETE

## Context

```plaintext
$ARGUMENTS
```

## Process Steps

// TO COMPLETE
