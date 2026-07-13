import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetServerForFile, mockGetState, mockShutdown, mockStart } = vi.hoisted(() => ({
	mockGetServerForFile: vi.fn(),
	mockGetState: vi.fn(),
	mockShutdown: vi.fn(),
	mockStart: vi.fn()
}));

vi.mock('./lsp-language-registry', () => ({
	getServerForFile: mockGetServerForFile
}));

vi.mock('./lsp-client', () => ({
	LSPClient: vi.fn().mockImplementation(() => ({
		getState: mockGetState,
		shutdown: mockShutdown,
		start: mockStart
	}))
}));

import type { LSPServerConfig } from './lsp.types';

import { getLSPClientManager, LSPClientManagerService, resetLSPClientManager } from './lsp-client-manager.service';

function makeConfig(overrides: Partial<LSPServerConfig> = {}): LSPServerConfig {
	return {
		args: ['--stdio'],
		command: 'typescript-language-server',
		extensions: ['.ts'],
		languages: ['typescript'],
		...overrides
	};
}

describe('LSPClientManagerService', () => {
	beforeEach(() => {
		mockGetServerForFile.mockReturnValue(makeConfig());
		mockStart.mockResolvedValue(true);
		mockShutdown.mockResolvedValue(undefined);
		mockGetState.mockReturnValue('ready');
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	describe('getClientForFile', () => {
		it('returns null when no server is configured for the file type', async () => {
			mockGetServerForFile.mockReturnValue(null);
			const manager = new LSPClientManagerService('/repo');

			const client = await manager.getClientForFile('foo.unknown');

			expect(client).toBeNull();
			expect(mockStart).not.toHaveBeenCalled();
		});

		it('spawns and starts a new client for a file type seen for the first time', async () => {
			const manager = new LSPClientManagerService('/repo');

			const client = await manager.getClientForFile('foo.ts');

			expect(client).not.toBeNull();
			expect(mockStart).toHaveBeenCalledTimes(1);
			expect(manager.getActiveClientCount()).toBe(1);
		});

		it('reuses the pooled client for a second file needing the same server, without starting a new one', async () => {
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts');
			mockStart.mockClear();

			await manager.getClientForFile('bar.ts');

			expect(mockStart).not.toHaveBeenCalled();
			expect(manager.getActiveClientCount()).toBe(1);
		});

		it('returns null and does not pool the client when start() fails', async () => {
			mockStart.mockResolvedValue(false);
			const manager = new LSPClientManagerService('/repo');

			const client = await manager.getClientForFile('foo.ts');

			expect(client).toBeNull();
			expect(manager.getActiveClientCount()).toBe(0);
		});

		it('restarts a pooled client that is no longer ready instead of reusing it as-is', async () => {
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts');
			mockGetState.mockReturnValue('error');

			await manager.getClientForFile('bar.ts');

			expect(mockShutdown).toHaveBeenCalledTimes(1);
			expect(mockStart).toHaveBeenCalledTimes(2);
		});

		it("resets a reused client's idle timer, so continued use extends its lifetime past the original spawn-time deadline", async () => {
			vi.useFakeTimers();
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts'); // spawns — idle timer armed for +5min from now
			await vi.advanceTimersByTimeAsync(4 * 60 * 1000); // t = 4min

			await manager.getClientForFile('bar.ts'); // reuse — must extend the deadline to t = 9min

			await vi.advanceTimersByTimeAsync(70 * 1000); // t = 5min10s — past the ORIGINAL deadline, before the extended one
			await vi.advanceTimersByTimeAsync(0);

			expect(mockShutdown).not.toHaveBeenCalled();
			expect(manager.getActiveClientCount()).toBe(1);
		});
	});

	describe('shutdownAll', () => {
		it('shuts down every pooled client and clears the pool', async () => {
			mockGetServerForFile
				.mockReturnValueOnce(makeConfig({ command: 'typescript-language-server' }))
				.mockReturnValueOnce(makeConfig({ command: 'gopls' }));
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts');
			await manager.getClientForFile('foo.go');
			expect(manager.getActiveClientCount()).toBe(2);

			await manager.shutdownAll();

			expect(mockShutdown).toHaveBeenCalledTimes(2);
			expect(manager.getActiveClientCount()).toBe(0);
		});

		it('clears the pool even when a client shutdown rejects', async () => {
			mockShutdown.mockRejectedValueOnce(new Error('already dead'));
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts');

			await manager.shutdownAll();

			expect(manager.getActiveClientCount()).toBe(0);
		});
	});

	describe('getStatus', () => {
		it('reports the command, lastUsed, and state of every pooled client', async () => {
			const manager = new LSPClientManagerService('/repo');
			await manager.getClientForFile('foo.ts');

			const status = manager.getStatus();

			expect(status).toEqual([{ command: 'typescript-language-server', lastUsed: expect.any(Number), state: 'ready' }]);
		});

		it('returns an empty array when no clients are pooled', () => {
			const manager = new LSPClientManagerService('/repo');

			expect(manager.getStatus()).toEqual([]);
		});
	});

	describe('getLSPClientManager / resetLSPClientManager (singleton)', () => {
		afterEach(() => {
			resetLSPClientManager();
		});

		it('returns the same instance across calls', () => {
			const first = getLSPClientManager('/repo');
			const second = getLSPClientManager('/repo');

			expect(first).toBe(second);
		});

		it('returns a fresh instance after resetLSPClientManager()', () => {
			const first = getLSPClientManager('/repo');
			resetLSPClientManager();
			const second = getLSPClientManager('/repo');

			expect(first).not.toBe(second);
		});
	});
});
