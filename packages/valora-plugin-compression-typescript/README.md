# @windagency/valora-plugin-compression-typescript

Output-compression strategies for the TypeScript / JavaScript ecosystem.

## Install

```bash
valora plugin add compression-typescript
```

Depends on `valora-plugin-compression-universal` (declared via `requires`).

## What it contributes

Registers 12 compression strategies via `api.compression.registerStrategy`: `tsc`, `eslint`, `jest`, `vitest`, `pnpm`, `npm`, `npx`, `yarn`, `prettier`, `bun`, `bunx`, `biome`.

Each strategy is a pure string-transform that strips redundant lines (e.g. tsc's repeated file paths, eslint's per-rule headers) before output is added to the LLM context.

## Permissions

`code-exec` — required by the loader to register a `code` contribution.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
- [Writing plugins](../../documentation/developer-guide/writing-plugins.md)
