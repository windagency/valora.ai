---
updated: 2026-05-11
---

# Persistence

## Current Status

Valora is process-local at v2.5. All state is held in memory or on the local filesystem via the session and config layers. No database, cache, or message broker is in use.

Persistence infrastructure is therefore out of scope for the current release.

## Local-filesystem state: memory vault

The largest local-filesystem footprint Valora maintains is the memory store. Since [ADR-016](../adr/016-memory-as-plugin.md) the store is **owned by whichever memory plugin is active**, not by core. The bundled default `'vault'` provider writes to `.valora/memory/vault/` (or `~/.valora/memory/vault/` outside a project) using one Markdown file per entry plus a packed `embeddings.bin` index — that layout is specific to `@windagency/valora-plugin-memory-vault`. If a site swaps in a different memory plugin via `memory.provider`, its on-disk layout, backup story, and migration semantics are defined by that plugin, not by this document.

Operations runbooks targeting "the Valora memory directory" should therefore assume the bundled vault. For non-default providers, consult the relevant plugin's documentation for backup, retention, and disaster-recovery guidance.

## When Persistence Is Introduced

When a database or cache consumer is added to `src/`, integration tests **must** use [Testcontainers](https://testcontainers.com/) behind a real adapter. Mock-based integration tests for persistence are forbidden per the project's CLAUDE.md engineering standards.

The helper class and related packages (`testcontainers`, `@testcontainers/postgresql`, `@testcontainers/redis`, `@testcontainers/localstack`) were removed from the repository on 2026-05-07 as part of the governance-debt remediation (task B7) because no production code consumed the environment variables they set.

## Verification Summary

| Evidence       | Detail                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| `package.json` | No `testcontainers`, `@testcontainers/*` entries in `devDependencies`                   |
| `src/`         | Zero references to `AI_TEST_DATABASE_URL`, `AI_TEST_REDIS_URL`, or `AI_TEST_LOCALSTACK` |

To reproduce the verification:

```sh
grep -rn 'AI_TEST_DATABASE_URL\|AI_TEST_REDIS_URL\|AI_TEST_LOCALSTACK' src/
# Expected: no output
```
