# @windagency/valora-plugin-compression-universal

Output-compression strategies for universal CLI tools used across most engineering workflows.

## Install

```bash
valora plugin add compression-universal
```

Or via npm:

```bash
pnpm add @windagency/valora-plugin-compression-universal
```

## What it contributes

Registers 17 compression strategies via `api.compression.registerStrategy`: `git`, `grep`, `rg`, `docker`, `make`, `ls`, `find`, `tree`, `cat`, `diff`, `curl`, `wget`, `jq`, `yq`, `tail`, `journalctl`, `gh`.

Each strategy is a pure string-transform that filters noise from the tool's output before it reaches the LLM context. No state, no I/O.

## Permissions

`code-exec` — required by the loader to register a `code` contribution.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
- [Writing plugins](../../documentation/developer-guide/writing-plugins.md)
