# Code Quality Standards

> Quick reference for code quality rules enforced in VALORA. For naming conventions and commit format, see [Contributing Guidelines](./contributing.md). For deep rationale and extended examples, see [CODE-QUALITY-GUIDELINES.md](./CODE-QUALITY-GUIDELINES.md).

## Quick Reference

| Rule                         | Requirement                                                        | Enforcement                                         |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Naming: classes / interfaces | PascalCase nouns, no `I` prefix                                    | ESLint `@typescript-eslint/naming-convention`       |
| Naming: functions            | camelCase verbs                                                    | ESLint                                              |
| Naming: constants            | UPPER_SNAKE_CASE                                                   | ESLint                                              |
| Naming: files                | kebab-case                                                         | `eslint-plugin-check-file`                          |
| Imports                      | Absolute path aliases only — no `../..`                            | `import/no-relative-parent-imports`                 |
| Types                        | `interface` for extensible objects; `type` for unions / primitives | ESLint                                              |
| `any`                        | Forbidden without explicit comment justification                   | `@typescript-eslint/no-explicit-any`                |
| Return types                 | Required on all exported functions                                 | `@typescript-eslint/explicit-module-boundary-types` |
| Object literal lookups       | Prefer over `switch` / `if-else` for simple mappings               | Code review                                         |
| Complexity                   | Max cyclomatic complexity: 10                                      | ESLint `complexity`                                 |
| Error handling               | All async paths must handle errors                                 | Code review                                         |
| Validation                   | All external input validated with Zod                              | Code review                                         |
| Tests                        | All new logic must have unit tests                                 | Code review                                         |
| Architecture                 | Dependency rules validated with `arch-unit-ts`                     | `tests/architecture/`                               |

---

## TypeScript Standards

### Interfaces vs types

```typescript
// Use interfaces for extensible objects
interface LLMProvider {
	name: string;
	sendPrompt(prompt: string): Promise<LLMResponse>;
}

interface BatchableProvider extends LLMProvider {
	submitBatch(requests: BatchRequest[]): Promise<BatchSubmission>;
}

// Use types for unions and primitives
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type ID = string | number;
```

### Path aliases

```typescript
// Correct — absolute alias
import { Logger } from 'utils/logger';
import { LLMProvider } from 'llm/provider.interface';

// Incorrect — relative parent import
import { Logger } from '../../../utils/logger';
```

### Object literal lookups over switch statements

```typescript
// Correct
const logLevelColours = {
	debug: 'gray',
	info: 'blue',
	warn: 'yellow',
	error: 'red'
} as const;

function getColour(level: keyof typeof logLevelColours) {
	return logLevelColours[level];
}

// Incorrect
function getColour(level: string) {
	switch (level) {
		case 'debug':
			return 'gray';
		case 'info':
			return 'blue';
		default:
			return 'white';
	}
}
```

### Conditional object construction

```typescript
// Correct — single-expression object, no partial-state window
const config = {
	required: 'value',
	...(optional && { key: optional }),
	...(another && { other: another })
};

// Incorrect — post-construction mutation
const config = { required: 'value' };
if (optional) config.key = optional;
```

### Functional iteration

```typescript
// Correct
const activeProviders = providers.filter((p) => p.isConfigured());
const names = activeProviders.map((p) => p.name);
const hasAny = providers.some((p) => p.isConfigured());

// Avoid imperative loops for simple transformations
```

---

## Architectural Patterns

### Dependency injection

```typescript
// Correct — injected dependencies, testable
class StageExecutor {
	constructor(
		private llmRegistry: LLMRegistry,
		private logger: Logger,
		private securityGuard: CommandGuard
	) {}
}

// Incorrect — hard-coded dependencies
class StageExecutor {
	private logger = new Logger();
}
```

### Adapter pattern for third-party libraries

```typescript
// Correct — internal code depends only on the interface
interface LLMProvider {
  sendPrompt(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
}

class AnthropicProvider implements LLMProvider {
  constructor(private client: Anthropic) {}

  async sendPrompt(prompt: string): Promise<LLMResponse> {
    const response = await this.client.messages.create({ ... });
    return normalise(response);
  }
}

// Incorrect — internal code imports Anthropic SDK directly
import Anthropic from '@anthropic-ai/sdk';
class SomeService {
  private sdk = new Anthropic();
}
```

---

## Error Handling

```typescript
// All async operations must handle errors explicitly
async function executeStage(stage: Stage): Promise<StageResult> {
	try {
		const result = await provider.sendPrompt(stage.prompt);
		logger.info('Stage completed', { stageId: stage.id });
		return result;
	} catch (error) {
		logger.error('Stage failed', { stageId: stage.id, error });
		throw new StageExecutionError(`Stage ${stage.id} failed`, { cause: error });
	}
}
```

---

## Logging Standards

```typescript
import { logger } from 'utils/logger';

// Structured logging — always include context
logger.info('Pipeline started', { commandName, sessionId, provider: provider.name });
logger.warn('Provider fallback triggered', { attempted: primary, fallback: secondary });
logger.error('Stage execution failed', { stageId, error, commandName });

// Never use console.log in production code
```

---

## Violation Severity

| Severity     | Action           | Examples                                                                          |
| ------------ | ---------------- | --------------------------------------------------------------------------------- |
| **CRITICAL** | Block PR         | Security vulnerabilities, unvalidated external input, `any` without justification |
| **HIGH**     | Fix before merge | Missing error handling, missing structured logging, no tests                      |
| **MEDIUM**   | Fix in follow-up | Code duplication, complexity > 10, relative imports                               |
| **LOW**      | Nice to have     | Missing JSDoc on internal helpers, suboptimal patterns                            |

---

## Enforcement Tools

| Tool           | What it enforces                         |
| -------------- | ---------------------------------------- |
| ESLint         | Naming, imports, complexity, `any` usage |
| TypeScript     | Type safety, return types                |
| Prettier       | Formatting                               |
| `arch-unit-ts` | Dependency rules between layers          |
| Husky          | Runs lint + type check on pre-commit     |
| Vitest         | Test coverage                            |

---

<details>
<summary><strong>ESLint configuration context</strong></summary>

The project uses ESLint v9 with flat config (`eslint.config.js`). Key plugins:

- `@typescript-eslint` — TypeScript-specific rules
- `eslint-plugin-import` — import ordering and path validation
- `eslint-plugin-perfectionist` — object key and import sorting
- `eslint-plugin-unused-imports` — removes unused imports automatically
- `eslint-plugin-check-file` — enforces kebab-case file naming
- `eslint-plugin-sort` — enforces consistent sort order

Run `pnpm lint:fix` to apply all auto-fixable rules. Non-fixable violations must be resolved manually.

</details>

<details>
<summary><strong>Architecture testing with arch-unit-ts</strong></summary>

Architectural rules are validated in `tests/architecture/`. Every dependency direction enforced at the module level must have a corresponding arch-unit-ts test. Example:

```typescript
import { filesOfProject } from 'arch-unit-ts';

describe('Architecture Rules', () => {
	it('cli layer should not import from executor internals directly', async () => {
		const files = await filesOfProject();
		files.inFolder('cli').shouldNotDependOnFilesMatching(/executor\/stage-executor/);
	});

	it('services should have correct naming', async () => {
		const files = await filesOfProject();
		files.inFolder('services').shouldHaveNameMatching(/.*\.service\.ts$/);
	});
});
```

Architecture tests run as part of `pnpm test:suite:architecture`.

</details>

<details>
<summary><strong>Rationale: object literal lookups over switch statements</strong></summary>

Switch statements for simple value mappings violate the expression-based principle: they describe a sequence of steps rather than declaring the final value. Object literal lookups:

- Express the complete mapping declaratively
- Are type-safe via `keyof typeof`
- Eliminate the `default` fallthrough ambiguity
- Are trivially testable (test the map, not the branch paths)

Switch statements remain appropriate when cases have side effects, multiple conditions, or require complex flow control — not for key-to-value lookups.

</details>
