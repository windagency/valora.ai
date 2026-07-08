import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptFn = vi.hoisted(() => vi.fn());
const mockCancel = vi.hoisted(() => vi.fn());
const mockGetProviderMetadata = vi.hoisted(() => vi.fn());
const mockGetAllProviderKeys = vi.hoisted(() => vi.fn());

vi.mock('config/provider-catalog', () => ({
	getProviderCatalog: () => ({
		descriptors: () => [][Symbol.iterator](),
		getAllProviderKeys: mockGetAllProviderKeys,
		getProviderMetadata: mockGetProviderMetadata,
		// The only provider configured for this test (anthropic) requires an
		// API key, so there is nothing to surface as a no-key quick-setup choice.
		getProvidersWithoutApiKey: () => []
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
