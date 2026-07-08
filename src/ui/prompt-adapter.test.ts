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
