---
updated: 2026-05-07
---

# Branch protection policy

The CI workflow at [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) defines the gates Valora must pass on every push and pull request. CI enforces what runs; **branch protection** enforces that those runs actually block merges. CI alone is not sufficient — without protection settings, anyone with write access can merge a PR with red checks, or push directly to `main` and bypass the workflow entirely.

This document records the protection settings to apply to `main` and `dev` so they cannot drift unnoticed.

## What CI runs today

`ci.yml` triggers on every `push` and `pull_request` to `main` and `dev`. It produces seven jobs:

1. `Lint and typecheck` — `pnpm lint && pnpm tsc:check`
2. `Unit tests` — `pnpm test:suite:unit`
3. `Architecture tests` — `pnpm test:suite:architecture`
4. `Security tests` — `pnpm test:suite:security`
5. `Documentation validator` — `pnpm docs:validate`
6. `Dependency review` (PRs only) — `actions/dependency-review-action@v4` failing on severity ≥ high
7. `CodeQL` — `github/codeql-action/analyze@v3` with `security-and-quality` queries

The `prepublishOnly` script in `package.json` mirrors these same gates locally for anyone running `npm publish`: it runs `pnpm lint && pnpm tsc:check && pnpm test:suite:unit && pnpm test:suite:architecture && pnpm test:suite:security && pnpm docs:validate` before a package is published, ensuring the same quality bar applies outside CI.

## Required settings

Apply these on GitHub under **Settings → Branches → Branch protection rules** for both `main` and `dev`.

| Setting                                        | Required value                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Require a pull request before merging          | **On**. Require **1** approving review (more if the team grows). Dismiss stale approvals on new commits.                                         |
| Require status checks to pass before merging   | **On**. Require branches up-to-date before merging.                                                                                              |
| Required status checks                         | `Lint and typecheck`, `Unit tests`, `Architecture tests`, `Security tests`, `Documentation validator`, `CodeQL`. (Dependency review is PR-only.) |
| Require conversation resolution before merging | **On**.                                                                                                                                          |
| Require linear history                         | **On**. Forces squash or rebase, prevents merge-commit churn.                                                                                    |
| Require signed commits                         | Recommended **on** for `main`. Optional for `dev`.                                                                                               |
| Do not allow bypassing the above settings      | **On**. No admin override.                                                                                                                       |
| Restrict who can push to matching branches     | Only the merge queue / CODEOWNERS, not direct pushes from individual humans.                                                                     |
| Block force pushes                             | **On**.                                                                                                                                          |
| Allow deletions                                | **Off**.                                                                                                                                         |

## `--no-verify` policy

The local Husky pre-commit hook (`.husky/pre-commit`) runs `lint-staged` on staged files. Developers can bypass it with `git commit --no-verify`.

CI re-runs the same checks server-side, so a `--no-verify` commit cannot be merged via PR — but it **can** be pushed directly to `dev` or `main` if those branches are not protected by the rules above. The branch-protection settings in this document are therefore the authoritative gate. `--no-verify` is acceptable as a developer escape hatch (e.g. while bisecting) but never as a path into a protected branch.

## Verification Summary

Verified 2026-05-07 against `.github/workflows/ci.yml`, `.husky/pre-commit`, and `package.json` script names.

- Claims checked: 8 (workflow file path; seven required job names; `--no-verify` bypasses Husky; CI re-runs server-side)
- Confirmed: 8 — all job names match `ci.yml`; the Husky hook executes `lint-staged` per `.husky/pre-commit` and is opt-out via `--no-verify` (standard Git behaviour).
- Unverifiable: 0
