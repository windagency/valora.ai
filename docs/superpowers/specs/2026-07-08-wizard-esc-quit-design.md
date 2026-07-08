# Setup Wizard: ESC to quit (with confirmation)

## Problem

The Setup Wizard (`src/config/interactive-wizard.ts` and its helper module
`src/config/validation-helpers.ts`) has no way to bail out mid-flow other than
Ctrl+C. We want ESC to offer a safer, discoverable "quit" path, with a
confirmation so a stray keypress doesn't discard in-progress answers.

## Behaviour

- Pressing ESC on any wizard question shows a confirm prompt:
  `Quit setup? Progress will be discarded.` (default: No).
  - **Yes** → print a cancellation message and exit the process with code 0.
    All progress is discarded; re-running the wizard starts fresh.
  - **No** → the original question is re-asked and the wizard continues
    normally.
- This behaviour is uniform across every question in the wizard flow. It does
  **not** apply anywhere else in the CLI — the shared `PromptAdapter` used by
  ~20 other interactive flows (approvals, escalations, session browser, etc.)
  is unaffected.
- Existing Ctrl+C handling (`isPromptCancellation` /
  `handlePromptCancellation` in `src/utils/prompt-handler.ts`) is unchanged.
  ESC is fully resolved inside the new wrapper and never bubbles up as a
  cancellation error.

## Scope

Only two files contain wizard prompts:

- `src/config/interactive-wizard.ts`
- `src/config/validation-helpers.ts` (`configureProvider`, `configureDefaults`,
  and their private helpers `configureLocalProvider`,
  `configureAnthropicVertexOption`) — verified to have no callers outside the
  wizard.

Every `prompt.prompt(...)` call site in these two files switches to a new
`promptWithEscToQuit(prompt, ...)` wrapper with the same signature. No other
file changes behaviour.

## Architecture

### 1. `src/ui/prompt-adapter.interface.ts`

- New exported error class `PromptCancelledError extends Error`, thrown when
  a cancellable prompt is cancelled via `cancel()`.
- New method on `PromptAdapter`:
  ```ts
  promptCancellable<T = PromptAnswers>(
    questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
    initialAnswers?: Partial<T>
  ): { promise: Promise<T>; cancel: () => void };
  ```
  This is a library-agnostic "cancellable prompt" primitive — the interface
  stays free of Inquirer-specific concepts.

### 2. `src/ui/prompt-adapter.ts` (`InquirerAdapter`)

- Implement `promptCancellable()`:
  - Call `inquirer.prompt(questions, initialAnswers)` and keep a reference to
    the returned promise's `.ui` (Inquirer's built-in prompt-runner handle).
  - `cancel()` calls `.ui.close()`, which aborts the active question via
    Inquirer's internal `AbortController`/signal mechanism.
  - The returned `promise` catches Inquirer's `AbortPromptError` (raised when
    `cancel()` aborts the prompt) and re-throws `PromptCancelledError`
    instead, so no Inquirer-specific error type leaks past the adapter
    boundary.

### 3. `src/config/wizard-esc-quit.ts` (new)

Exports:

```ts
async function promptWithEscToQuit<T>(
	prompt: PromptAdapter,
	questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
	initialAnswers?: Partial<T>,
	stdin: NodeJS.ReadableStream = process.stdin
): Promise<T>;
```

Behaviour:

1. Call `prompt.promptCancellable(questions, initialAnswers)`.
2. Attach a `'keypress'` listener on `stdin` (defaulting to `process.stdin`,
   injectable for tests) that calls `cancel()` exactly once when
   `key?.name === 'escape'`.
3. Await `promise`:
   - **Resolves** → remove the listener, return the answers.
   - **Rejects with `PromptCancelledError`** → remove the listener, then ask
     a confirm question via `prompt.prompt([...])`:
     `Quit setup? Progress will be discarded.` (default `false`). - `true` → print `⚠️  Setup cancelled by user.` and call
     `process.exit(0)`. - `false` → recursively call `promptWithEscToQuit(prompt, questions,
initialAnswers, stdin)` to re-ask the same question(s).
   - **Rejects with anything else** (e.g. Ctrl+C's `ExitPromptError`) →
     remove the listener, rethrow unchanged.

### 4. Call-site changes

Replace `prompt.prompt([...])` with `promptWithEscToQuit(prompt, [...])` at
every call site in `interactive-wizard.ts` and `validation-helpers.ts`.

## Edge cases

- **Multi-question steps** (e.g. API key + default model asked together):
  declining the quit confirmation re-asks the _whole_ array from scratch, not
  a partial resume mid-array. Simplest option, consistent with "fully
  discard on quit".
- **ESC while the confirm dialog itself is showing**: no special handling —
  it behaves as an ordinary confirm prompt (Enter/y/n, or Ctrl+C). Avoids
  recursive-cancellation complexity for a rare double-press.
- **Ctrl+C**: unaffected, works exactly as today.
- **Listener lifecycle**: the ESC listener is added/removed around each
  individual question call — never leaks across calls or lingers after the
  wizard exits.

## Testing

Per repo convention (behavioural tests, no mock-based coupling to internals):

1. `src/config/wizard-esc-quit.test.ts` — fake `PromptAdapter` with a
   controllable `promptCancellable` and `prompt` (for the confirm step).
   Assert observable outcomes:
   - Normal resolution passes through untouched.
   - Cancel → confirm yes → process exits 0, cancellation message printed, no
     further prompts issued.
   - Cancel → confirm no → the same question is re-asked and the wizard
     proceeds to the eventual real answer.
2. Isolated ESC-keypress wiring test — inject a `PassThrough` stream and
   emit real `'keypress'` events (`{name: 'escape'}` triggers cancel, other
   keys don't). Exercises the true I/O boundary rather than mocking it away.
3. `InquirerAdapter.promptCancellable()` — mock only the `inquirer` module
   boundary; assert the adapter's observable contract: resolves normally on
   success, rejects with `PromptCancelledError` when cancelled, `cancel()`
   triggers that rejection.

## Out of scope

- Any other interactive CLI flow using the shared `PromptAdapter`
  (approvals, escalations, session browser, command palette, etc.).
- Persisting/resuming partial wizard progress across a quit.
