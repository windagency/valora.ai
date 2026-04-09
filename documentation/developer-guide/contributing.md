# Contributing Guidelines

> How to contribute to VALORA. Naming conventions and commit format are defined here; `code-quality.md` defers to this file on those topics.

## Contribution Steps

1. **Fork** the repository to your GitHub account.

2. **Clone** your fork and install dependencies:

   ```bash
   git clone https://github.com/YOUR-USERNAME/valora.git
   cd valora
   pnpm install
   ```

3. **Create a branch** from `main`:

   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/the-bug-description
   ```

4. **Make changes** — write code, add tests, update documentation as needed.

5. **Run quality checks** before committing:

   ```bash
   pnpm format        # format and lint
   pnpm tsc:check     # type check
   pnpm test:quick    # unit + integration tests
   ```

6. **Commit** using [Conventional Commits](#commit-messages).

7. **Push** and open a pull request against `main`.

---

## Pre-commit Checklist

- [ ] `pnpm format` passes without changes
- [ ] `pnpm tsc:check` reports no errors
- [ ] `pnpm test:quick` passes
- [ ] New functionality has unit tests
- [ ] Bug fixes include a regression test
- [ ] Public APIs have JSDoc comments
- [ ] Documentation updated if behaviour changed
- [ ] No new `any` types without explicit justification

---

## Pull Request Template

```markdown
## Summary

Brief description of the change and why it was made.

## Changes

- [ ] Feature / fix description
- [ ] Test additions
- [ ] Documentation updates

## Testing

How were the changes tested? Which test suites cover this?

## Checklist

- [ ] Code follows naming conventions
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] Commit messages follow Conventional Commits
```

---

## Commit Messages

VALORA uses [Conventional Commits](https://www.conventionalcommits.org/):

```plaintext
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | When to use                           |
| ---------- | ------------------------------------- |
| `feat`     | New feature                           |
| `fix`      | Bug fix                               |
| `docs`     | Documentation only                    |
| `style`    | Formatting, no logic change           |
| `refactor` | Code restructure, no behaviour change |
| `perf`     | Performance improvement               |
| `test`     | Adding or updating tests              |
| `chore`    | Maintenance (deps, build scripts)     |

### Examples

```bash
git commit -m "feat(cli): add --verbose flag to plan command"
git commit -m "fix(llm): handle timeout in Anthropic provider"
git commit -m "docs(setup): clarify Node.js version requirement"
git commit -m "test(executor): add pipeline integration tests"
```

---

## Naming Conventions

These are authoritative — `code-quality.md` references this section.

| Element                 | Convention                      | Example               |
| ----------------------- | ------------------------------- | --------------------- |
| Files                   | kebab-case                      | `command-executor.ts` |
| Classes                 | PascalCase noun                 | `CommandExecutor`     |
| Interfaces              | PascalCase noun (no `I` prefix) | `LLMProvider`         |
| Functions               | camelCase verb                  | `executeCommand()`    |
| Constants               | UPPER_SNAKE_CASE                | `MAX_RETRIES`         |
| Types (union/primitive) | PascalCase                      | `LogLevel`            |

---

## TypeScript Standards

### Type safety

- Use strict TypeScript settings (already enforced by `tsconfig.json`)
- Avoid `any`; use `unknown` when the type is genuinely unknown
- Use Zod for all runtime validation of external input

```typescript
// Good
interface CommandInput {
	command: string;
	options: CommandOptions;
}

// Avoid
const input: any = {};
```

### Imports

Use path aliases for all internal imports — never relative parent paths:

```typescript
// Good
import { Logger } from 'utils/logger';

// Avoid
import { Logger } from '../../../utils/logger';
```

### Async/await

Prefer `async/await` over raw Promise chains:

```typescript
// Good
async function fetchData() {
	const result = await api.call();
	return result;
}

// Avoid
function fetchData() {
	return api.call().then((result) => result);
}
```

---

## Dependency Management

The project enforces supply chain security. See [ADR-009](../adr/009-supply-chain-hardening.md) for full rationale.

- **Never delete `pnpm-lock.yaml`** — the lockfile is frozen to prevent drift.
- **Adding a dependency**: `pnpm add <package> --config.frozen-lockfile=false`, then commit the updated lockfile.
- **Updating a dependency**: `pnpm update <package> --config.frozen-lockfile=false`.
- **After any dependency change**: run `pnpm audit:prod` to catch new vulnerabilities.
- **Native build dependencies**: add to `pnpm.onlyBuiltDependencies` in `package.json`.

---

## Testing Requirements

| Type        | Location             | Minimum requirement           |
| ----------- | -------------------- | ----------------------------- |
| Unit        | `src/**/*.test.ts`   | All new functions and classes |
| Integration | `tests/integration/` | Module interaction paths      |
| E2E         | `tests/e2e/`         | Complete user-facing flows    |
| Security    | `tests/security/`    | Any security-relevant change  |

Aim for 80 % coverage on new code. All bug fixes must include a regression test.

```typescript
describe('CommandExecutor', () => {
	describe('execute', () => {
		it('should execute a valid command', async () => {
			// Arrange
			const executor = new CommandExecutor();

			// Act
			const result = await executor.execute('plan');

			// Assert
			expect(result.success).toBe(true);
		});

		it('should throw on invalid command', async () => {
			const executor = new CommandExecutor();
			await expect(executor.execute('invalid')).rejects.toThrow(ValidationError);
		});
	});
});
```

---

## Adding New Commands

### 1. Create the command specification

Add a Markdown file with YAML frontmatter in `data/commands/` (built-in) or `.valora/commands/` (project-level override):

```markdown
---
name: my-command
description: What this command does
agent: lead
model: claude-sonnet-4.6
---

# My Command

## Purpose

Describe the command purpose.

## Inputs

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |

## Outputs

Describe expected outputs.

## Pipeline

Define execution stages.
```

### 2. Register the command

Update `data/commands/registry.json`:

```json
{
	"commands": {
		"my-command": {
			"name": "my-command",
			"description": "...",
			"agent": "lead",
			"model": "claude-sonnet-4.6"
		}
	}
}
```

### 3. Add tests

```typescript
describe('my-command', () => {
	it('should execute successfully', async () => {
		// test implementation
	});
});
```

---

## Adding New Agents

### 1. Create the agent definition

Add a Markdown file with YAML frontmatter in `data/agents/` (built-in) or `.valora/agents/` (project-level override):

```markdown
---
name: my-agent
expertise:
  - Area 1
  - Area 2
domains:
  - domain1
---

# My Agent

## Role

Describe the agent's role and responsibilities.

## Expertise

Detail specific expertise areas.

## Constraints

Define operational constraints and boundaries.
```

### 2. Register the agent

Update `data/agents/registry.json` with capabilities and selection criteria.

---

## CLI Tool Enforcement

The project enforces modern CLI tools via a PreToolUse hook (see [ADR-008](../adr/008-pretooluse-cli-enforcement.md)). Legacy commands are blocked when run through `run_terminal_cmd`:

| Blocked            | Use instead |
| ------------------ | ----------- |
| `grep`             | `rg`        |
| `find`             | `fd`        |
| `ls`, `tree`       | `eza`       |
| `cat` on JSON/YAML | `jq` / `yq` |
| `npm`              | `pnpm`      |

See the [Modern CLI Toolkit](./modern-cli-toolkit/README.md) for installation and usage.

---

## Review Process

1. Automated CI checks must pass (lint, type check, tests).
2. At least one maintainer review is required.
3. Address feedback promptly; maintainers may request changes or a squash.
4. Maintainers merge approved PRs using squash merge.

---

## Reporting Issues

**Bug reports** — include:

- Clear title and steps to reproduce
- Expected vs actual behaviour
- Environment details (OS, Node.js version, VALORA version)
- Relevant log output

**Feature requests** — include:

- Use case description
- Proposed solution
- Alternatives considered

---

<details>
<summary><strong>Branch strategy rationale</strong></summary>

VALORA uses a trunk-based development model:

- `main` is always deployable.
- Feature branches are short-lived (ideally less than two days).
- Branch naming follows `<type>/<short-description>` to mirror Conventional Commits types.

This is intentionally simple — there are no `develop`, `release/*`, or `hotfix/*` branches. Releases are tagged from `main` directly.

</details>

<details>
<summary><strong>Commit message format rationale</strong></summary>

Conventional Commits enables:

- Automated changelog generation (`feat` and `fix` entries appear automatically)
- Semantic version bumping (breaking changes → major, `feat` → minor, `fix` → patch)
- Clear PR titles and git log readability

The scope is optional but recommended for larger codebases. Use the module name or the `src/` subdirectory name (e.g., `cli`, `executor`, `llm`, `batch`).

</details>

<details>
<summary><strong>Naming convention rationale</strong></summary>

The `I` prefix for interfaces (e.g., `IPaymentGateway`) is common in C# and older TypeScript codebases but adds noise without value in modern TypeScript. TypeScript already distinguishes interfaces structurally. The no-`I`-prefix convention is enforced by ESLint (`@typescript-eslint/naming-convention`).

File naming in `kebab-case` ensures consistency across case-insensitive (macOS) and case-sensitive (Linux) filesystems, avoiding import errors when moving between platforms.

</details>
