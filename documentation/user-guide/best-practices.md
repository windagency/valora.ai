# Best Practices

A quick-reference summary of recommended practices for VALORA. For command sequences and detailed rationale, see the [Workflows guide](./workflows.md).

## Rules at a glance

| Rule                                                                    | When                                   | Why                                                                               | More info                                                                |
| ----------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Always plan before implementing                                         | Every task                             | Unplanned implementations produce inconsistent results and waste review cycles    | [Workflow 1, step 8](./workflows.md#workflow-1-new-feature-development)  |
| Run `review-plan` before `implement`                                    | After every `plan`                     | Catches architectural and logic issues before code is written                     | [Workflow 1, step 9](./workflows.md#workflow-1-new-feature-development)  |
| Use `--pattern` for common tasks                                        | REST API, React, DB, auth, jobs        | Reduces planning time from 13–15 min to 4–6 min                                   | [Speed-Up Options](./workflows.md#speed-up-options)                      |
| Use express mode for trivial tasks                                      | Complexity < 3                         | Saves ~10–12 min on minor changes                                                 | [Workflow 6](./workflows.md#workflow-6-quick-task)                       |
| Use tiered planning for complex features                                | Complexity > 5                         | Catches architectural issues in ~5 min before committing to detailed planning     | [Workflow 5](./workflows.md#workflow-5-tiered-planning-complex-features) |
| Run `assert` immediately after `implement`                              | After every implementation             | Catches completeness issues early, before test and review phases                  | [Workflow 1, step 11](./workflows.md#workflow-1-new-feature-development) |
| Use `validate-parallel` instead of sequential assert + review           | Post-implementation                    | Runs both concurrently, saving ~9 min                                             | [Speed-Up Options](./workflows.md#speed-up-options)                      |
| Use `pre-check` before `review-code`                                    | Before every code review               | Automated checks (~1.5 min) eliminate obvious issues before manual review         | [Workflow 4](./workflows.md#workflow-4-code-review)                      |
| Enforce coverage gates                                                  | After every test run                   | Prevents test quality from quietly degrading                                      | [Coverage validation](./workflows.md#coverage-validation-gates)          |
| Use `--mode=step-by-step` for large refactors                           | Refactoring tasks                      | Breaks changes into verifiable steps, reducing regression risk                    | [Workflow 3](./workflows.md#workflow-3-refactoring)                      |
| Commit after each task, not after multiple                              | Every completed task                   | Keeps commits focused and reversible                                              | —                                                                        |
| Write specific task descriptions                                        | Every `plan` call                      | Vague descriptions produce vague plans                                            | —                                                                        |
| Break large tasks into smaller ones                                     | Complexity ≥ 5                         | Enables express planning and reduces planning overhead                            | [Workflow 5](./workflows.md#workflow-5-tiered-planning-complex-features) |
| Answer P0 clarification questions                                       | During interactive stages              | P0 questions block core functionality; skipping them introduces gaps              | [Interactive Clarification](./workflows.md#interactive-clarification)    |
| Run `feedback` after every workflow                                     | After commit / PR                      | Feeds the metrics system for continuous improvement                               | [Workflow 1, step 14](./workflows.md#workflow-1-new-feature-development) |
| Review metrics weekly                                                   | Ongoing                                | Identifies optimisation opportunities and prevents quality drift                  | [Metrics guide](./metrics.md)                                            |
| Store API keys in environment variables, not config files               | Setup                                  | Config files can be accidentally committed                                        | —                                                                        |
| Never commit `pnpm-lock.yaml` modifications outside a dependency update | Dependency management                  | The lockfile is the source of truth for reproducible installs                     | —                                                                        |
| Run `pnpm audit:prod` regularly                                         | Ongoing                                | Catches known vulnerabilities in production dependencies                          | —                                                                        |
| Do not delete sessions with errors                                      | Debugging                              | Failed sessions contain diagnostic context                                        | [Troubleshooting](./troubleshooting.md)                                  |
| Share custom templates via git                                          | Team projects                          | Ensures consistency across the team                                               | —                                                                        |
| Run `valora consolidate` after decision-heavy sessions                  | After architecture or refactoring work | Prevents memory store bloat and ensures git-invalidation removes stale context    | [Memory configuration](./configuration.md#memory-system-configuration)   |
| Review `AGENT MEMORY` in debug logs before trusting injected context    | Before acting on AI recommendations    | Injected memories may reference outdated code paths; verify against current state | —                                                                        |

## Anti-patterns

| Anti-pattern                                  | Problem                                                            | Correct approach                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `valora implement` without `valora plan`      | No structured plan; agent guesses intent                           | Always run `plan` first                                                                       |
| `valora plan "build entire auth system"`      | Overwhelming complexity in one task                                | Break into `plan "Add User model"`, `plan "Add password hashing"`, etc.                       |
| Skipping `review-plan`                        | Architectural issues discovered during implementation              | Always validate the plan before writing code                                                  |
| Skipping `assert`                             | Issues surface later in test or review phases                      | Run `assert` immediately after `implement`                                                    |
| Not using `--pattern` for REST/React/DB tasks | 13–15 min planning instead of 4–6 min                              | Add `--pattern=rest-api`, `--pattern=react-feature`, or `--pattern=database`                  |
| Ignoring weekly metrics recommendations       | Optimisation opportunities missed                                  | Act on low template-usage and early-exit recommendations                                      |
| Committing API keys to config files           | Security exposure                                                  | Use `export ANTHROPIC_API_KEY=...` or a gitignored `.env` file                                |
| Never running `valora consolidate`            | Memory stores grow unbounded; stale patterns injected into prompts | Run `valora consolidate --dry-run` periodically to inspect, then without `--dry-run` to prune |

## Session and configuration tips

**Aliases** — define short aliases in `.valora/config.json` to speed up common commands:

```json
{
	"commands": {
		"aliases": {
			"p": "plan",
			"i": "implement",
			"r": "review-plan",
			"a": "assert",
			"c": "commit"
		}
	}
}
```

**Session context** — VALORA preserves context across commands in the same session. There is no need to re-specify the task after `plan`; `implement`, `test`, and `review-code` all pick it up automatically.

**Resume sessions** — if a session was interrupted:

```bash
valora --resume plan "Continue previous work"
valora --session <session-id> implement
```

**Custom templates** — copy an existing pattern and adapt it for your codebase:

```bash
cp data/templates/plans/PATTERN_REST_API.md .valora/templates/plans/PATTERN_CUSTOM.md
code .valora/templates/plans/PATTERN_CUSTOM.md
valora plan "Custom task" --pattern=custom
```

## Security summary

- Store API keys in environment variables or a gitignored `.env` file — never in `.valora/config.json`
- The project enforces `frozen-lockfile=true` and `ignore-scripts=true` in `.npmrc`. Add packages that legitimately need build scripts to `pnpm.onlyBuiltDependencies`
- Enable session encryption: `{ "session": { "encryption": true } }`
- Always review AI-generated code for input validation, error handling, and authentication logic
- Run `pnpm audit:prod` regularly; see [ADR-009](../adr/009-supply-chain-hardening.md) for full supply chain rationale

---

For command sequences, full rationale, and edge cases, see the [Workflows guide](./workflows.md).
