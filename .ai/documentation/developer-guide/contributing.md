# Contributing Guidelines

> How to contribute to VALORA.

## Welcome

We welcome contributions to VALORA! This guide will help you get started with contributing code, documentation, or bug reports.

## Types of Contributions

| Type              | Description                                     |
| ----------------- | ----------------------------------------------- |
| **Bug Fixes**     | Fix issues in the codebase                      |
| **Features**      | Add new functionality                           |
| **Documentation** | Improve or add documentation                    |
| **Tests**         | Add or improve test coverage                    |
| **Refactoring**   | Improve code quality without changing behaviour |

## Getting Started

### 1. Fork the Repository

Fork the repository to your GitHub account.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR-USERNAME/valora.git
cd valora/.ai/.bin
```

### 3. Set Up Development Environment

```bash
pnpm install
pnpm build
pnpm test
```

See [Development Setup](./setup.md) for detailed instructions.

### 4. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

## Development Workflow

### Making Changes

1. **Write code** following our coding standards
2. **Add tests** for new functionality
3. **Update documentation** if needed
4. **Run quality checks** before committing

### CLI Tool Enforcement

VALORA enforces the use of modern CLI tools via a PreToolUse hook. Legacy commands like `grep`, `find`, `ls`, and `npm` are automatically blocked when run through `run_terminal_cmd`. Use the modern equivalents instead:

- `rg` instead of `grep` / `egrep` / `fgrep`
- `fd` instead of `find`
- `jq` / `yq` instead of `cat` on JSON/YAML files
- `eza` instead of `ls` or `tree`
- `pnpm` instead of `npm`

See the [Modern CLI Toolkit](./modern-cli-toolkit/README.md) for full details and the [ADR-008](../adr/008-pretooluse-cli-enforcement.md) for the architectural rationale.

### Quality Checks

Run these before every commit:

```bash
# Format and lint code
pnpm format

# Type check
pnpm tsc:check

# Run tests
pnpm test
```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```plaintext
<type>(<scope>): <description>

[optional body]

[optional footer]
```

#### Types

| Type       | Description                |
| ---------- | -------------------------- |
| `feat`     | New feature                |
| `fix`      | Bug fix                    |
| `docs`     | Documentation only         |
| `style`    | Formatting, no code change |
| `refactor` | Code refactoring           |
| `perf`     | Performance improvement    |
| `test`     | Adding tests               |
| `chore`    | Maintenance tasks          |

#### Examples

```bash
git commit -m "feat(cli): add verbose flag to plan command"
git commit -m "fix(llm): handle timeout in Anthropic provider"
git commit -m "docs(readme): update installation instructions"
git commit -m "test(executor): add pipeline integration tests"
```

## Coding Standards

### TypeScript Guidelines

#### Type Safety

- Use strict TypeScript settings
- Avoid `any` type; use `unknown` when needed
- Define interfaces for object shapes
- Use Zod for runtime validation

```typescript
// Good
interface UserInput {
  command: string;
  options: CommandOptions;
}

// Avoid
const input: any = {};
```

#### Imports

Use path aliases for internal imports:

```typescript
// Good
import { Logger } from 'utils/logger';

// Avoid
import { Logger } from '../../../utils/logger';
```

#### Async/Await

Prefer async/await over raw promises:

```typescript
// Good
async function fetchData() {
  const result = await api.call();
  return result;
}

// Avoid
function fetchData() {
  return api.call().then(result => result);
}
```

### Code Style

#### Naming Conventions

| Element    | Convention                          | Example                               |
| ---------- | ----------------------------------- | ------------------------------------- |
| Files      | kebab-case                          | `command-executor.ts`                 |
| Classes    | PascalCase                          | `CommandExecutor`                     |
| Functions  | camelCase                           | `executeCommand`                      |
| Constants  | UPPER_SNAKE_CASE                    | `MAX_RETRIES`                         |
| Interfaces | PascalCase with I prefix (optional) | `ICommandOptions` or `CommandOptions` |

#### Documentation

Document public APIs with JSDoc:

```typescript
/**
 * Executes a command pipeline.
 *
 * @param command - The command to execute
 * @param options - Execution options
 * @returns The execution result
 * @throws {ValidationError} If command is invalid
 */
async function execute(
  command: string,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  // implementation
}
```

### Testing Requirements

#### Test Coverage

- Aim for 80%+ code coverage
- All new features must have tests
- Bug fixes should include regression tests

#### Test Structure

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
      // Arrange
      const executor = new CommandExecutor();

      // Act & Assert
      await expect(executor.execute('invalid'))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

#### Test Types

| Type        | Location             | Purpose                   |
| ----------- | -------------------- | ------------------------- |
| Unit        | `src/**/*.test.ts`   | Test individual functions |
| Integration | `tests/integration/` | Test module interactions  |
| E2E         | `tests/e2e/`         | Test complete flows       |
| Security    | `tests/security/`    | Security validation       |
| Performance | `tests/performance/` | Performance benchmarks    |

## Pull Request Process

### 1. Prepare Your PR

- Ensure all tests pass
- Update documentation
- Add changelog entry if needed
- Rebase on latest main

### 2. Create Pull Request

Use this template:

```markdown
## Summary

Brief description of changes.

## Changes

- [ ] Feature/fix description
- [ ] Documentation updates
- [ ] Test additions

## Testing

Describe how you tested the changes.

## Checklist

- [ ] Code follows project style
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] Commit messages follow convention
```

### 3. Review Process

1. Automated checks must pass
2. At least one maintainer review
3. Address feedback promptly
4. Squash commits if requested

### 4. Merging

Maintainers will merge approved PRs using squash merge.

## Adding New Commands

### 1. Create Command Specification

Add a new file in `.ai/commands/`:

```markdown
---
name: my-command
description: Description of what it does
agent: lead
model: claude-sonnet-4.5
---

# My Command

## Purpose

Explain the command purpose.

## Inputs

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |

## Outputs

Describe expected outputs.

## Pipeline

Define execution stages.
```

### 2. Register the Command

Update `.ai/commands/registry.json`:

```json
{
  "commands": {
    "my-command": {
      "name": "my-command",
      "description": "...",
      "agent": "lead",
      "model": "claude-sonnet-4.5"
    }
  }
}
```

### 3. Add Tests

Create tests for the new command:

```typescript
describe('my-command', () => {
  it('should execute successfully', async () => {
    // test implementation
  });
});
```

## Adding New Agents

### 1. Create Agent Definition

Add a new file in `.ai/agents/`:

```markdown
---
name: my-agent
expertise:
  - Area 1
  - Area 2
domains:
  - domain1
  - domain2
---

# My Agent

## Role

Describe the agent's role.

## Expertise

Detail specific expertise areas.

## Constraints

Define operational constraints.
```

### 2. Register the Agent

Update `.ai/agents/registry.json` with the agent's capabilities and selection criteria.

## Reporting Issues

### Bug Reports

Include:

- Clear title
- Steps to reproduce
- Expected vs actual behaviour
- Environment details
- Logs if available

### Feature Requests

Include:

- Use case description
- Proposed solution
- Alternatives considered
- Impact assessment

## Getting Help

- Check existing documentation
- Search existing issues
- Ask in discussions
- Contact maintainers

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn
- Follow project guidelines

---

Thank you for contributing to VALORA!
