import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveProviderConflict } from './conflict-resolver';

const mockPrompt = vi.fn();

vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: vi.fn(() => ({ prompt: mockPrompt }))
}));

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('./conflict-resolver-config', () => ({
	getResolvedConflict: vi.fn().mockReturnValue(undefined),
	preloadConflictResolutions: vi.fn().mockResolvedValue(undefined),
	saveResolvedConflict: vi.fn().mockResolvedValue(undefined)
}));

describe('resolveProviderConflict', () => {
	const originalStdoutIsTTY = process.stdout.isTTY;
	const originalStdinIsTTY = process.stdin.isTTY;
	const originalCI = process.env['CI'];
	const originalConflictEnv = process.env['VALORA_PLUGIN_CONFLICT'];

	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env['CI'];
		delete process.env['VALORA_PLUGIN_CONFLICT'];
	});

	afterEach(() => {
		Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, configurable: true });
		Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
		if (originalCI !== undefined) process.env['CI'] = originalCI;
		else delete process.env['CI'];
		if (originalConflictEnv !== undefined) process.env['VALORA_PLUGIN_CONFLICT'] = originalConflictEnv;
		else delete process.env['VALORA_PLUGIN_CONFLICT'];
	});

	function setTTY(isTTY: boolean) {
		Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
		Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
	}

	describe('cached decisions bypass TTY check', () => {
		it('returns cached winner without prompting even in CI', async () => {
			process.env['CI'] = 'true';
			setTTY(false);
			const { getResolvedConflict } = await import('./conflict-resolver-config');
			vi.mocked(getResolvedConflict).mockReturnValueOnce('plugin-a');

			const winner = await resolveProviderConflict({
				existingOwner: 'plugin-a',
				incomingOwner: 'plugin-b',
				key: 'ollama'
			});

			expect(winner).toBe('plugin-a');
			expect(mockPrompt).not.toHaveBeenCalled();
		});
	});

	describe('non-TTY / CI environment', () => {
		it('throws when stdout is not a TTY', async () => {
			setTTY(false);

			await expect(
				resolveProviderConflict({ existingOwner: 'plugin-a', incomingOwner: 'plugin-b', key: 'ollama' })
			).rejects.toThrow(/plugin-a.*plugin-b|plugin-b.*plugin-a/i);
		});

		it('throws when stdin is not a TTY even if stdout is', async () => {
			Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
			Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

			await expect(
				resolveProviderConflict({ existingOwner: 'plugin-a', incomingOwner: 'plugin-b', key: 'ollama' })
			).rejects.toThrow();
		});

		it('throws in CI even when both TTYs are set', async () => {
			setTTY(true);
			process.env['CI'] = 'true';

			await expect(
				resolveProviderConflict({ existingOwner: 'plugin-a', incomingOwner: 'plugin-b', key: 'ollama' })
			).rejects.toThrow();
		});

		it('throws when VALORA_PLUGIN_CONFLICT=error even on TTY', async () => {
			setTTY(true);
			process.env['VALORA_PLUGIN_CONFLICT'] = 'error';

			await expect(
				resolveProviderConflict({ existingOwner: 'plugin-a', incomingOwner: 'plugin-b', key: 'ollama' })
			).rejects.toThrow();
		});
	});

	describe('TTY interactive path', () => {
		beforeEach(() => {
			setTTY(true);
		});

		it('returns the existing owner when user chooses it', async () => {
			mockPrompt.mockResolvedValueOnce({ winner: 'plugin-a' });

			const winner = await resolveProviderConflict({
				existingOwner: 'plugin-a',
				incomingOwner: 'plugin-b',
				key: 'ollama'
			});

			expect(winner).toBe('plugin-a');
		});

		it('returns the incoming owner when user chooses it', async () => {
			mockPrompt.mockResolvedValueOnce({ winner: 'plugin-b' });

			const winner = await resolveProviderConflict({
				existingOwner: 'plugin-a',
				incomingOwner: 'plugin-b',
				key: 'ollama'
			});

			expect(winner).toBe('plugin-b');
		});

		it('saves the choice so it persists across reboots', async () => {
			mockPrompt.mockResolvedValueOnce({ winner: 'plugin-b' });
			const { saveResolvedConflict } = await import('./conflict-resolver-config');

			await resolveProviderConflict({ existingOwner: 'plugin-a', incomingOwner: 'plugin-b', key: 'ollama' });

			expect(saveResolvedConflict).toHaveBeenCalledWith('ollama', 'plugin-b');
		});

		it('returns cached winner without prompting when a prior choice exists', async () => {
			const { getResolvedConflict } = await import('./conflict-resolver-config');
			vi.mocked(getResolvedConflict).mockReturnValueOnce('plugin-a');

			const winner = await resolveProviderConflict({
				existingOwner: 'plugin-a',
				incomingOwner: 'plugin-b',
				key: 'ollama'
			});

			expect(winner).toBe('plugin-a');
			expect(mockPrompt).not.toHaveBeenCalled();
		});
	});
});
