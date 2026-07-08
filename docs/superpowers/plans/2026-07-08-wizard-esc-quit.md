# Setup Wizard ESC-to-Quit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing ESC on any Setup Wizard question shows a confirm-before-quit dialog; confirming exits cleanly (code 0), declining re-asks the question.

**Architecture:** Add a library-agnostic `promptCancellable()` primitive to the shared `PromptAdapter` interface, implement it in `InquirerAdapter` using Inquirer's built-in prompt-abort handle (`.ui.close()`), then build a `promptWithEscToQuit()` wrapper (new file, scoped to `src/config/`) that listens for the ESC keypress and drives the confirm/retry loop. Swap every prompt call inside the two files that make up the Setup Wizard (`interactive-wizard.ts`, `validation-helpers.ts`) to use the wrapper. No other CLI flow is touched.

**Tech Stack:** TypeScript, Vitest, Inquirer.js v10 (via the existing `PromptAdapter` abstraction).

**Design doc:** `docs/superpowers/specs/2026-07-08-wizard-esc-quit-design.md`

## Global Constraints

- American English for code/identifiers, British English for documentation (repo `CLAUDE.md`).
- Every architectural decision must be validated via `arch-unit-ts` tests — this plan must not introduce new violations of `__tests__/architecture/architecture.test.ts` (in particular: `config` layer must not depend on `executor`/`services`/`session`/`mcp`; presentation libraries like `inquirer` must stay confined to files matching `adapter.ts` / `adapter.interface.ts` / `/ui/*.ts`).
- Strict TDD: write a failing test before implementation code, for every behavioural change.
- Tests must assert observable behaviour (return values, process exit, re-prompting), never internal call counts, except where a call **is** the contract (e.g. asserting `cancel()` was invoked).
- Use `pnpm` for all commands (repo already uses `pnpm`, confirmed via `pnpm-lock.yaml`).
- **Never commit without explicit human approval.** Each task below ends with "stop and show the diff for review" instead of an automatic `git commit` — only run `git commit` after the user explicitly approves that specific change.
- A `Stop` hook auto-runs ESLint `--fix`, Prettier, and `tsc --noEmit` after every turn. If it surfaces type errors, fix them before considering a task done.

---

## File Map

| File                                    | Change                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/ui/prompt-adapter.interface.ts`    | Add `PromptCancelledError` + `promptCancellable()` to the `PromptAdapter` interface |
| `src/ui/prompt-adapter.ts`              | Implement `promptCancellable()` on `InquirerAdapter`                                |
| `src/ui/prompt-adapter.test.ts`         | New — tests for `InquirerAdapter.promptCancellable()`                               |
| `src/config/wizard-esc-quit.ts`         | New — `promptWithEscToQuit()` wrapper                                               |
| `src/config/wizard-esc-quit.test.ts`    | New — tests for `promptWithEscToQuit()`                                             |
| `src/config/validation-helpers.ts`      | Swap 6 `prompt.prompt(...)` call sites to `promptWithEscToQuit(prompt, ...)`        |
| `src/config/validation-helpers.test.ts` | Update the fake `PromptAdapter` mock to add `promptCancellable`                     |
| `src/config/interactive-wizard.ts`      | Swap 4 `prompt.prompt(...)` call sites to `promptWithEscToQuit(prompt, ...)`        |
| `src/config/interactive-wizard.test.ts` | New — end-to-end behavioural test of ESC-to-quit through `quickSetup()`             |

---

### Task 1: `promptCancellable()` on the `PromptAdapter` interface + `InquirerAdapter`

**Files:**

- Modify: `src/ui/prompt-adapter.interface.ts`
- Modify: `src/ui/prompt-adapter.ts`
- Test: `src/ui/prompt-adapter.test.ts` (new)

**Interfaces:**

- Produces: `PromptCancelledError` (exported class, `src/ui/prompt-adapter.interface.ts`), `PromptAdapter.promptCancellable<T>(questions, initialAnswers?): { promise: Promise<T>; cancel: () => void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/prompt-adapter.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInquirerPrompt = vi.hoisted(() => vi.fn());

vi.mock('inquirer', () => ({
	default: {
		prompt: (...args: unknown[]) => mockInquirerPrompt(...args),
		Separator: class {}
	}
}));

import { InquirerAdapter } from './prompt-adapter';
import { PromptCancelledError } from './prompt-adapter.interface';

function makeCancellableInquirerPrompt<T>() {
	let resolveAnswer!: (value: T) => void;
	let rejectAnswer!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolveAnswer = res;
		rejectAnswer = rej;
	});
	const close = vi.fn(() => {
		const abortError = new Error('Prompt was aborted');
		abortError.name = 'AbortPromptError';
		rejectAnswer(abortError);
	});
	const promptResult = Object.assign(promise, { ui: { close } });
	return { close, promptResult, rejectAnswer, resolveAnswer };
}

describe('InquirerAdapter.promptCancellable', () => {
	beforeEach(() => {
		mockInquirerPrompt.mockReset();
	});

	it('resolves with the answers when the prompt is answered normally', async () => {
		const { promptResult, resolveAnswer } = makeCancellableInquirerPrompt<{ name: string }>();
		mockInquirerPrompt.mockReturnValueOnce(promptResult);

		const adapter = new InquirerAdapter();
		const { promise } = adapter.promptCancellable([{ type: 'input', name: 'name', message: 'Name?' }]);
		resolveAnswer({ name: 'Ada' });

		await expect(promise).resolves.toEqual({ name: 'Ada' });
	});

	it('rejects with PromptCancelledError when cancel() is called', async () => {
		const { close, promptResult } = makeCancellableInquirerPrompt<{ name: string }>();
		mockInquirerPrompt.mockReturnValueOnce(promptResult);

		const adapter = new InquirerAdapter();
		const { cancel, promise } = adapter.promptCancellable([{ type: 'input', name: 'name', message: 'Name?' }]);
		cancel();

		await expect(promise).rejects.toBeInstanceOf(PromptCancelledError);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('propagates non-abort errors unchanged', async () => {
		const { promptResult, rejectAnswer } = makeCancellableInquirerPrompt<{ name: string }>();
		mockInquirerPrompt.mockReturnValueOnce(promptResult);

		const adapter = new InquirerAdapter();
		const { promise } = adapter.promptCancellable([{ type: 'input', name: 'name', message: 'Name?' }]);
		const exitError = new Error('User force closed the prompt');
		exitError.name = 'ExitPromptError';
		rejectAnswer(exitError);

		await expect(promise).rejects.toBe(exitError);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts src/ui/prompt-adapter.test.ts`
Expected: FAIL — `adapter.promptCancellable is not a function`

- [ ] **Step 3: Add `PromptCancelledError` and the interface method**

In `src/ui/prompt-adapter.interface.ts`, insert after the imports (after line 13, before `export type QuestionType`):

```ts
/**
 * Thrown when a cancellable prompt (see `PromptAdapter.promptCancellable`) is
 * cancelled via its `cancel()` handle, instead of being answered normally.
 */
export class PromptCancelledError extends Error {
	constructor() {
		super('Prompt was cancelled');
		this.name = 'PromptCancelledError';
	}
}
```

Then, inside the `PromptAdapter` interface, immediately after the closing brace of the `prompt<T>(...)` method and before `createSeparator`, add:

```ts
	/**
	 * Prompt user with questions, returning a handle that can cancel the
	 * in-flight prompt from outside the caller awaiting it.
	 *
	 * @param questions - Question or array of questions
	 * @param initialAnswers - Initial answers to pre-fill
	 * @returns An object containing the prompt's `promise` (rejects with
	 * `PromptCancelledError` if `cancel()` is invoked before the user
	 * answers) and a `cancel` function that aborts the prompt.
	 *
	 * @example
	 * const { promise, cancel } = adapter.promptCancellable([
	 *   { type: 'confirm', name: 'proceed', message: 'Continue?' }
	 * ]);
	 * setTimeout(cancel, 5000); // abort if unanswered after 5s
	 */
	promptCancellable<T = PromptAnswers>(
		questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
		initialAnswers?: Partial<T>
	): { cancel: () => void; promise: Promise<T> };
```

- [ ] **Step 4: Implement `promptCancellable()` on `InquirerAdapter`**

In `src/ui/prompt-adapter.ts`, change the import line to also bring in `PromptCancelledError` as a value:

```ts
import type { PromptAdapter, PromptAnswers, PromptQuestion, PromptSeparator } from './prompt-adapter.interface';

import { PromptCancelledError } from './prompt-adapter.interface';
```

Then add this method to the `InquirerAdapter` class, after the existing `prompt()` method and before `createSeparator()`:

```ts
	/**
	 * Prompt user with questions, returning a handle that can cancel the
	 * in-flight prompt from outside.
	 */
	promptCancellable<T = PromptAnswers>(
		questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
		initialAnswers?: Partial<T>
	): { cancel: () => void; promise: Promise<T> } {
		const runningPrompt = inquirer.prompt(
			questions as Parameters<typeof inquirer.prompt>[0],
			initialAnswers as Record<string, unknown>
		);

		const promise = runningPrompt.then(
			(answer) => answer as T,
			(error: unknown) => {
				if (error instanceof Error && error.name === 'AbortPromptError') {
					throw new PromptCancelledError();
				}
				throw error;
			}
		);

		return {
			cancel: () => runningPrompt.ui.close(),
			promise
		};
	}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts src/ui/prompt-adapter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run full type check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Stop and show the diff for review**

Do not commit. Show `git diff -- src/ui/prompt-adapter.interface.ts src/ui/prompt-adapter.ts src/ui/prompt-adapter.test.ts` and wait for explicit approval before committing.

---

### Task 2: `promptWithEscToQuit()` wrapper

**Files:**

- Create: `src/config/wizard-esc-quit.ts`
- Test: `src/config/wizard-esc-quit.test.ts` (new)

**Interfaces:**

- Consumes: `PromptAdapter.promptCancellable<T>(questions, initialAnswers?)` and `PromptAdapter.prompt<T>(questions, initialAnswers?)` (Task 1), `PromptCancelledError` (Task 1), `handlePromptCancellation()` from `src/utils/prompt-handler.ts` (existing — prints `⚠️  Setup cancelled by user.` and calls `process.exit(0)`).
- Produces: `promptWithEscToQuit<T>(prompt: PromptAdapter, questions, initialAnswers?, stdin?: NodeJS.ReadableStream): Promise<T>` — used by Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Create `src/config/wizard-esc-quit.test.ts`:

```ts
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptAdapter } from 'ui/prompt-adapter.interface';

import { PromptCancelledError } from 'ui/prompt-adapter.interface';

import { promptWithEscToQuit } from './wizard-esc-quit';

/**
 * Marker thrown by the mocked `process.exit` so real code paths that assume
 * `process.exit` never returns (its return type is `never`) actually halt
 * during the test, instead of falling through into unintended retries.
 */
class ProcessExitCalled extends Error {}

describe('promptWithEscToQuit', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new ProcessExitCalled('process.exit called');
		});
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves with the answers when the prompt is answered normally', async () => {
		const adapter = {
			prompt: vi.fn(),
			promptCancellable: vi.fn().mockReturnValue({ cancel: vi.fn(), promise: Promise.resolve({ name: 'Ada' }) })
		} as unknown as PromptAdapter;

		const answer = await promptWithEscToQuit(adapter, [{ type: 'input', name: 'name', message: 'Name?' }]);

		expect(answer).toEqual({ name: 'Ada' });
	});

	it('exits the process when the user confirms quitting after cancellation', async () => {
		let rejectCancellable!: (reason: unknown) => void;
		const cancellablePromise = new Promise((_resolve, reject) => {
			rejectCancellable = reject;
		});
		const cancel = vi.fn(() => rejectCancellable(new PromptCancelledError()));

		const adapter = {
			prompt: vi.fn().mockResolvedValueOnce({ confirmQuit: true }),
			promptCancellable: vi.fn().mockReturnValue({ cancel, promise: cancellablePromise })
		} as unknown as PromptAdapter;

		const stdin = new PassThrough();
		const resultPromise = promptWithEscToQuit(
			adapter,
			[{ type: 'input', name: 'name', message: 'Name?' }],
			undefined,
			stdin
		);

		stdin.emit('keypress', undefined, { name: 'escape' });

		await expect(resultPromise).rejects.toThrow(ProcessExitCalled);
		expect(exitSpy).toHaveBeenCalledWith(0);
		expect(adapter.prompt).toHaveBeenCalledTimes(1);
	});

	it('re-asks the same question when the user declines quitting after cancellation', async () => {
		let rejectFirst!: (reason: unknown) => void;
		const firstPromise = new Promise((_resolve, reject) => {
			rejectFirst = reject;
		});
		const firstCancel = vi.fn(() => rejectFirst(new PromptCancelledError()));

		const adapter = {
			prompt: vi.fn().mockResolvedValueOnce({ confirmQuit: false }),
			promptCancellable: vi
				.fn()
				.mockReturnValueOnce({ cancel: firstCancel, promise: firstPromise })
				.mockReturnValueOnce({ cancel: vi.fn(), promise: Promise.resolve({ name: 'Ada' }) })
		} as unknown as PromptAdapter;

		const stdin = new PassThrough();
		const questions = [{ type: 'input' as const, name: 'name', message: 'Name?' }];
		const resultPromise = promptWithEscToQuit(adapter, questions, undefined, stdin);

		stdin.emit('keypress', undefined, { name: 'escape' });
		const answer = await resultPromise;

		expect(answer).toEqual({ name: 'Ada' });
		expect(adapter.promptCancellable).toHaveBeenCalledTimes(2);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('ignores non-escape keys', async () => {
		const adapter = {
			prompt: vi.fn(),
			promptCancellable: vi.fn().mockReturnValue({ cancel: vi.fn(), promise: Promise.resolve({ name: 'Ada' }) })
		} as unknown as PromptAdapter;

		const stdin = new PassThrough();
		const resultPromise = promptWithEscToQuit(
			adapter,
			[{ type: 'input', name: 'name', message: 'Name?' }],
			undefined,
			stdin
		);

		stdin.emit('keypress', undefined, { name: 'a' });
		const answer = await resultPromise;

		expect(answer).toEqual({ name: 'Ada' });
		expect(adapter.prompt).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts src/config/wizard-esc-quit.test.ts`
Expected: FAIL — cannot find module `./wizard-esc-quit`

- [ ] **Step 3: Implement `promptWithEscToQuit()`**

Create `src/config/wizard-esc-quit.ts`:

```ts
/**
 * ESC-to-quit wrapper for Setup Wizard prompts.
 *
 * Wraps a wizard prompt so pressing ESC shows a confirm-before-quit dialog
 * instead of silently discarding input. Declining the dialog re-asks the
 * original question(s).
 */

import { getColorAdapter } from 'output/color-adapter.interface';
// eslint-disable-next-line valora-local/import-layer-remedy
import {
	PromptCancelledError,
	type PromptAdapter,
	type PromptAnswers,
	type PromptQuestion
} from 'ui/prompt-adapter.interface';
import { handlePromptCancellation } from 'utils/prompt-handler';

export async function promptWithEscToQuit<T = PromptAnswers>(
	prompt: PromptAdapter,
	questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
	initialAnswers?: Partial<T>,
	stdin: NodeJS.ReadableStream = process.stdin
): Promise<T> {
	const { cancel, promise } = prompt.promptCancellable(questions, initialAnswers);

	const onKeypress = (_input: string, key?: { name?: string }): void => {
		if (key?.name === 'escape') {
			cancel();
		}
	};

	stdin.on('keypress', onKeypress);

	try {
		return await promise;
	} catch (error) {
		if (!(error instanceof PromptCancelledError)) {
			throw error;
		}

		const color = getColorAdapter();
		const { confirmQuit } = await prompt.prompt<{ confirmQuit: boolean }>([
			{
				default: false,
				message: color.yellow('Quit setup? Progress will be discarded.'),
				name: 'confirmQuit',
				type: 'confirm'
			}
		]);

		if (confirmQuit) {
			handlePromptCancellation();
		}

		return promptWithEscToQuit(prompt, questions, initialAnswers, stdin);
	} finally {
		stdin.removeListener('keypress', onKeypress);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts src/config/wizard-esc-quit.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full type check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Stop and show the diff for review**

Do not commit. Show `git diff -- src/config/wizard-esc-quit.ts src/config/wizard-esc-quit.test.ts` and wait for explicit approval before committing.

---

### Task 3: Wire `promptWithEscToQuit` into `validation-helpers.ts`

**Files:**

- Modify: `src/config/validation-helpers.ts`
- Modify: `src/config/validation-helpers.test.ts`

**Interfaces:**

- Consumes: `promptWithEscToQuit` from Task 2.

- [ ] **Step 1: Update the test's fake adapter first, confirm existing tests still pass**

In `src/config/validation-helpers.test.ts`, change the `vi.mock('ui/prompt-adapter.interface', ...)` block (currently `getPromptAdapter: () => ({ prompt: mockPromptFn })`) to:

```ts
vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({
		prompt: mockPromptFn,
		promptCancellable: (questions: unknown, initialAnswers?: unknown) => ({
			cancel: () => {},
			promise: mockPromptFn(questions, initialAnswers)
		})
	})
}));
```

Run: `pnpm exec vitest run --config vitest.config.ts src/config/validation-helpers.test.ts`
Expected: PASS (unchanged — `configureProvider`/`configureDefaults` still call `prompt.prompt` directly at this point, so `promptCancellable` isn't exercised yet, but adding it to the mock is harmless).

- [ ] **Step 2: Swap the call sites in `validation-helpers.ts`**

Add the import (after the existing `import { isPromptCancellation } from 'utils/prompt-handler';` line):

```ts
import { promptWithEscToQuit } from './wizard-esc-quit';
```

Then replace each of the following 6 call sites (`prompt.prompt(` → `promptWithEscToQuit(prompt, `), keeping every question/config argument identical:

In `configureLocalProvider`:

```ts
	const { baseUrl, defaultModel } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `configureAnthropicVertexOption` (first call):

```ts
	const { useVertex } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `configureAnthropicVertexOption` (second call):

```ts
	const vertexAnswers = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `configureProvider` (no-API-key branch):

```ts
			const { defaultModel } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `configureProvider` (standard API-key branch):

```ts
		const { apiKey, defaultModel } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `configureDefaults`:

```ts
		const answers = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

- [ ] **Step 3: Run tests to verify they still pass**

Run: `pnpm exec vitest run --config vitest.config.ts src/config/validation-helpers.test.ts`
Expected: PASS — same test count and assertions as before the refactor, proving it's behaviour-preserving.

- [ ] **Step 4: Run full type check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Stop and show the diff for review**

Do not commit. Show `git diff -- src/config/validation-helpers.ts src/config/validation-helpers.test.ts` and wait for explicit approval before committing.

---

### Task 4: Wire `promptWithEscToQuit` into `interactive-wizard.ts` + end-to-end test

**Files:**

- Modify: `src/config/interactive-wizard.ts`
- Test: `src/config/interactive-wizard.test.ts` (new)

**Interfaces:**

- Consumes: `promptWithEscToQuit` from Task 2.

- [ ] **Step 1: Write the failing end-to-end test**

Create `src/config/interactive-wizard.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptFn = vi.hoisted(() => vi.fn());
const mockCancel = vi.hoisted(() => vi.fn());
const mockGetProviderMetadata = vi.hoisted(() => vi.fn());
const mockGetAllProviderKeys = vi.hoisted(() => vi.fn());

vi.mock('config/provider-catalog', () => ({
	getProviderCatalog: () => ({
		getAllProviderKeys: mockGetAllProviderKeys,
		getProviderMetadata: mockGetProviderMetadata
	})
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		colorModifier: (_c: string, _m: string, s: string) => s,
		cyan: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		yellow: (s: string) => s
	})
}));

// Keep the real PromptCancelledError class (so `instanceof` checks inside
// wizard-esc-quit.ts still work) and only override getPromptAdapter().
vi.mock('ui/prompt-adapter.interface', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ui/prompt-adapter.interface')>();
	return {
		...actual,
		getPromptAdapter: () => ({
			prompt: mockPromptFn,
			promptCancellable: (questions: unknown, initialAnswers?: unknown) => ({
				cancel: mockCancel,
				promise: mockPromptFn(questions, initialAnswers)
			})
		})
	};
});

import { PromptCancelledError } from 'ui/prompt-adapter.interface';

import { SetupWizard } from './interactive-wizard';

function makeFakeConfigLoader() {
	return {
		exists: () => true,
		getConfigPath: () => '/tmp/valora-test-config.json',
		load: vi.fn().mockResolvedValue({ defaults: {}, providers: {} }),
		loadRaw: vi.fn().mockResolvedValue({ defaults: {}, providers: {} }),
		save: vi.fn().mockResolvedValue(undefined)
	};
}

describe('SetupWizard ESC-to-quit', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env['CI'];
		delete process.env['AI_INTERACTIVE'];
		delete process.env['AI_ANTHROPIC_API_KEY'];
		delete process.env['AI_GOOGLE_API_KEY'];
		delete process.env['AI_OPENAI_API_KEY'];
		vi.spyOn(console, 'group').mockImplementation(() => undefined);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);

		mockGetAllProviderKeys.mockReturnValue(['anthropic']);
		mockGetProviderMetadata.mockReturnValue({
			defaultModel: 'claude-fable-5',
			label: 'Anthropic',
			requiresApiKey: true
		});
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	it('quickSetup continues to completion when the user declines the ESC quit confirmation', async () => {
		// wizard-esc-quit.ts's stdin parameter defaults to process.stdin at
		// every call site in interactive-wizard.ts (none of them inject a
		// custom stream), so the escape keypress must be emitted there —
		// the listener is attached synchronously before quickSetup()'s
		// first real await, so it is already registered by the time this
		// test emits the event.
		let rejectFirstCancellable!: (reason: unknown) => void;
		const firstCancellablePromise = new Promise((_resolve, reject) => {
			rejectFirstCancellable = reject;
		});
		mockCancel.mockImplementationOnce(() => rejectFirstCancellable(new PromptCancelledError()));

		mockPromptFn
			.mockReturnValueOnce(firstCancellablePromise) // provider-choice question (via promptCancellable)
			.mockResolvedValueOnce({ confirmQuit: false }) // confirm-quit dialog (via prompt.prompt)
			.mockResolvedValueOnce({ providerChoice: 'anthropic' }) // retried provider-choice question
			.mockResolvedValueOnce({ apiKey: 'sk-test-123' }); // API key question

		const wizard = new SetupWizard(makeFakeConfigLoader() as never);
		const resultPromise = wizard.quickSetup();

		process.stdin.emit('keypress', undefined, { name: 'escape' });

		const config = await resultPromise;

		expect(config.defaults.default_provider).toBe('anthropic');
		expect(config.providers['anthropic']).toEqual({ apiKey: 'sk-test-123' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.config.ts src/config/interactive-wizard.test.ts`
Expected: FAIL — the wizard currently calls `prompt.prompt` directly (not `promptCancellable`), so `mockPromptFn` is never driven through the cancellable path and the test hangs/times out or resolves with the wrong shape.

- [ ] **Step 3: Swap the call sites in `interactive-wizard.ts`**

Add the import (after `import { isPromptCancellation } from 'utils/prompt-handler';`):

```ts
import { promptWithEscToQuit } from './wizard-esc-quit';
```

Replace each of the following 4 call sites:

In `run()` (provider-selection question):

```ts
			const { providers } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `selectDefaultProvider`:

```ts
		const { defaultProvider } = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `promptForProvider` (provider list question):

```ts
		const providerAnswer = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

In `promptForProvider` (API key question):

```ts
		const apiKeyAnswer = await promptWithEscToQuit(prompt, [
```

(was `await prompt.prompt([`)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config vitest.config.ts src/config/interactive-wizard.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite and type check**

Run: `pnpm test:suite:unit`
Run: `pnpm exec tsc --noEmit`
Expected: all pass, no errors — this also re-confirms `config.command.test.ts` and `dynamic.test.ts` (which mock the whole `SetupWizard`/`config/wizard` module) are unaffected.

- [ ] **Step 6: Stop and show the diff for review**

Do not commit. Show `git diff -- src/config/interactive-wizard.ts src/config/interactive-wizard.test.ts` and wait for explicit approval before committing.

---

## Final Verification (after all 4 tasks are approved)

- [ ] Run `pnpm test:suite:unit` — full unit suite green.
- [ ] Run `__tests__/architecture/architecture.test.ts` specifically (`pnpm exec vitest run --config vitest.config.ts __tests__/architecture/architecture.test.ts`) to confirm no layering/adapter-isolation violations were introduced.
- [ ] Run `pnpm exec tsc --noEmit` — no type errors.
- [ ] Re-read `docs/superpowers/specs/2026-07-08-wizard-esc-quit-design.md` against the final code and confirm no drift (per CLAUDE.md's Documentation Accuracy rule).
- [ ] Present the full combined diff to the user and ask whether to commit (single commit or one per task) — do not commit without that explicit go-ahead.
