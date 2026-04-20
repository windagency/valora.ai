import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaProcessManagerImpl, OllamaStartupError } from './process-manager.js';

vi.mock('child_process', () => ({
	spawn: vi.fn()
}));

import { spawn } from 'child_process';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;

describe('OllamaProcessManagerImpl', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('isRunning()', () => {
		it('returns true when fetch to /api/tags responds with ok: true', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
			const manager = new OllamaProcessManagerImpl(0);

			const result = await manager.isRunning('http://localhost:11434');

			expect(result).toBe(true);
			expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
		});

		it('returns false when fetch throws', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
			const manager = new OllamaProcessManagerImpl(0);

			const result = await manager.isRunning('http://localhost:11434');

			expect(result).toBe(false);
		});
	});

	describe('ensureRunning()', () => {
		it('does nothing when the server is already running', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
			const manager = new OllamaProcessManagerImpl(0);

			await manager.ensureRunning('http://localhost:11434');

			expect(mockSpawn).not.toHaveBeenCalled();
		});

		it('rejects with the spawn error when ollama serve fails to start', async () => {
			const spawnError = new Error('spawn ollama ENOENT');
			const fakeProcess = {
				kill: vi.fn(),
				once: vi.fn((event: string, handler: (err: Error) => void) => {
					if (event === 'error') setTimeout(() => handler(spawnError), 0);
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			// Server never running
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

			const manager = new OllamaProcessManagerImpl(0);

			await expect(manager.ensureRunning('http://localhost:11434')).rejects.toThrow('spawn ollama ENOENT');
		});

		it('spawns ollama serve when not running, then becomes running', async () => {
			const fakeProcess = {
				kill: vi.fn(),
				once: vi.fn((event: string, handler: () => void) => {
					if (event === 'close') handler();
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			// First call: isRunning check in ensureRunning → false
			// Second call: isRunning poll in waitForReady → true
			vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ ok: true }));

			const manager = new OllamaProcessManagerImpl(0);

			await manager.ensureRunning('http://localhost:11434');

			expect(mockSpawn).toHaveBeenCalledWith('ollama', ['serve'], {
				detached: false,
				stdio: 'ignore'
			});
		});
	});

	describe('stop()', () => {
		it('kills the managed process and clears it', async () => {
			const fakeProcess = {
				kill: vi.fn(),
				once: vi.fn((event: string, handler: () => void) => {
					if (event === 'close') handler(); // immediately resolve
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			// First call: false → triggers spawn; second call: true → waitForReady succeeds
			vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ ok: true }));

			const manager = new OllamaProcessManagerImpl(0);
			await manager.ensureRunning('http://localhost:11434');

			await manager.stop();

			expect(fakeProcess.kill).toHaveBeenCalledWith('SIGTERM');
		});

		it('is a no-op when no process was started', async () => {
			const manager = new OllamaProcessManagerImpl(0);

			// Should not throw
			await expect(manager.stop()).resolves.toBeUndefined();
			expect(mockSpawn).not.toHaveBeenCalled();
		});
	});

	describe('waitForReady() — startup timeout', () => {
		it('throws OllamaStartupError when the server never becomes reachable', async () => {
			const fakeProcess = {
				kill: vi.fn(),
				once: vi.fn((event: string, handler: () => void) => {
					if (event === 'close') handler();
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			// Always return not-running
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

			const manager = new OllamaProcessManagerImpl(0);

			await expect(manager.ensureRunning('http://localhost:11434')).rejects.toThrow(OllamaStartupError);
		});
	});
});
