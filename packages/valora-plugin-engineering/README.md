# @windagency/valora-plugin-engineering

Engineering workflow agent and command set — the canonical content plugin many other plugins depend on.

## Install

```bash
valora plugin add engineering
```

## What it contributes

- **1 agent**: `lead` — the orchestrating senior engineer used by most workflow commands.
- **11 commands**: `commit`, `create-pr`, `gather-knowledge`, `plan`, `plan-architecture`, `plan-implementation`, `review-code`, `review-functional`, `review-plan`, `validate-parallel`, `validate-plan`.

Several other first-party plugins reference the `lead` agent (notably `valora-plugin-docs` declares this via `requires`).

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
