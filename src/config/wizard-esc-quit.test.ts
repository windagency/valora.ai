import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PromptAdapter, PromptCancelledError } from 'ui/prompt-adapter.interface';

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

	it('removes the previous call listener before the retried prompt settles, without leaking listeners', async () => {
		let rejectFirst!: (reason: unknown) => void;
		const firstPromise = new Promise((_resolve, reject) => {
			rejectFirst = reject;
		});
		const firstCancel = vi.fn(() => rejectFirst(new PromptCancelledError()));

		let resolveSecond!: (value: { name: string }) => void;
		const secondPromise = new Promise<{ name: string }>((resolve) => {
			resolveSecond = resolve;
		});
		const secondCancel = vi.fn();

		const adapter = {
			prompt: vi.fn().mockResolvedValueOnce({ confirmQuit: false }),
			promptCancellable: vi
				.fn()
				.mockReturnValueOnce({ cancel: firstCancel, promise: firstPromise })
				.mockReturnValueOnce({ cancel: secondCancel, promise: secondPromise })
		} as unknown as PromptAdapter;

		const stdin = new PassThrough();
		const questions = [{ type: 'input' as const, name: 'name', message: 'Name?' }];
		const resultPromise = promptWithEscToQuit(adapter, questions, undefined, stdin);

		expect(stdin.listenerCount('keypress')).toBe(1);

		stdin.emit('keypress', undefined, { name: 'escape' });

		// Wait for the decline-and-retry chain (reject -> await prompt.prompt() -> recursive call)
		// to reach its steady state, while the retried (second) prompt is still pending.
		await vi.waitFor(() => {
			expect(adapter.promptCancellable).toHaveBeenCalledTimes(2);
		});

		// Exactly one listener should remain registered: the retried call's own. If the first
		// call's `finally` (listener cleanup) were delayed until the whole recursive retry chain
		// settles, instead of running right after the retry is kicked off, this would be 2.
		expect(stdin.listenerCount('keypress')).toBe(1);

		// A fresh ESC press must reach the retried call's cancel — not a stale listener from the
		// original (already-settled) call.
		stdin.emit('keypress', undefined, { name: 'escape' });
		expect(secondCancel).toHaveBeenCalledTimes(1);
		expect(firstCancel).toHaveBeenCalledTimes(1);

		resolveSecond({ name: 'Ada' });
		const answer = await resultPromise;

		expect(answer).toEqual({ name: 'Ada' });
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
