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
		vi.useRealTimers();
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
				exitCode: null,
				signalCode: null,
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
				exitCode: null,
				signalCode: null,
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
		});
	});

	describe('stop()', () => {
		it('kills the managed process and clears it', async () => {
			// Fake child that does NOT fire 'close' during startAndWait,
			// but fires it when kill() is called (simulating real process exit after SIGTERM).
			const handlers: Record<string, () => void> = {};
			const fakeProcess = {
				kill: vi.fn(() => {
					handlers['close']?.();
				}),
				exitCode: null as number | null,
				signalCode: null as string | null,
				once: vi.fn((event: string, handler: () => void) => {
					handlers[event] = handler;
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

		it('clears process reference when child exits after waitForReady resolves', async () => {
			// 'close' fires immediately when registered (simulates process exiting right after start)
			const fakeProcess = {
				kill: vi.fn(),
				exitCode: null,
				signalCode: null,
				once: vi.fn((event: string, handler: () => void) => {
					if (event === 'close') handler();
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			// Fetch returns ok immediately so waitForReady resolves fast
			vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ ok: true }));

			const manager = new OllamaProcessManagerImpl(0);
			await manager.ensureRunning('http://localhost:11434');

			// process reference must have been cleared by the 'close' listener
			// stop() should be a no-op (kill is never called)
			await manager.stop();

			expect(fakeProcess.kill).not.toHaveBeenCalled();
		});

		it('resolves immediately for an already-dead process without calling kill', async () => {
			const handlers: Record<string, () => void> = {};
			const fakeProcess = {
				kill: vi.fn(),
				exitCode: 1, // already exited
				signalCode: null as string | null,
				once: vi.fn((event: string, handler: () => void) => {
					handlers[event] = handler;
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ ok: true }));

			const manager = new OllamaProcessManagerImpl(0);
			await manager.ensureRunning('http://localhost:11434');

			await manager.stop();

			expect(fakeProcess.kill).not.toHaveBeenCalled();
		});

		it('escalates to SIGKILL after 5000 ms if close does not fire', async () => {
			vi.useFakeTimers();

			const handlers: Record<string, () => void> = {};
			const fakeProcess = {
				kill: vi.fn(),
				exitCode: null as number | null,
				signalCode: null as string | null,
				once: vi.fn((event: string, handler: () => void) => {
					handlers[event] = handler;
					// 'close' is intentionally never fired
				})
			};
			mockSpawn.mockReturnValue(fakeProcess);

			vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue({ ok: true }));

			const manager = new OllamaProcessManagerImpl(0);
			await manager.ensureRunning('http://localhost:11434');

			const stopPromise = manager.stop();

			// Advance timers past the 5000 ms escalation threshold
			await vi.advanceTimersByTimeAsync(5000);

			await stopPromise;

			expect(fakeProcess.kill).toHaveBeenCalledWith('SIGKILL');
		});
	});

	describe('waitForReady() — startup timeout', () => {
		it('throws OllamaStartupError when the server never becomes reachable', async () => {
			const fakeProcess = {
				kill: vi.fn(),
				exitCode: null,
				signalCode: null,
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
