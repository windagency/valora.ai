---
updated: 2026-05-07
---

# Persistence

## Current Status

Valora is process-local at v2.5. All state is held in memory or on the local filesystem via the session and config layers. No database, cache, or message broker is in use.

Persistence infrastructure is therefore out of scope for the current release.

## When Persistence Is Introduced

When a database or cache consumer is added to `src/`, integration tests **must** use [Testcontainers](https://testcontainers.com/) behind a real adapter. Mock-based integration tests for persistence are forbidden per the project's CLAUDE.md engineering standards.

The helper class and related packages (`testcontainers`, `@testcontainers/postgresql`, `@testcontainers/redis`, `@testcontainers/localstack`) were removed from the repository on 2026-05-07 as part of the governance-debt remediation (task B7) because no production code consumed the environment variables they set.

## Verification Summary

| Evidence | Detail |
|---|---|
| `package.json` | No `testcontainers`, `@testcontainers/*` entries in `devDependencies` |
| `src/` | Zero references to `AI_TEST_DATABASE_URL`, `AI_TEST_REDIS_URL`, or `AI_TEST_LOCALSTACK` |

To reproduce the verification:

```sh
grep -rn 'AI_TEST_DATABASE_URL\|AI_TEST_REDIS_URL\|AI_TEST_LOCALSTACK' src/
# Expected: no output
```
