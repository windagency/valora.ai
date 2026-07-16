import { EventEmitter } from 'events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
	spawn: vi.fn()
}));

import { spawn } from 'child_process';

import type { LSPProtocolAdapter, LSPProtocolConnection } from './lsp-protocol-adapter.interface';
import type { LSPServerConfig } from './lsp.types';

import { LSPClient } from './lsp-client';
import { resetLSPProtocolAdapter, setLSPProtocolAdapter } from './lsp-protocol-adapter.interface';

function makeConfig(overrides: Partial<LSPServerConfig> = {}): LSPServerConfig {
	return {
		args: ['--stdio'],
		command: 'typescript-language-server',
		extensions: ['.ts'],
		languages: ['typescript'],
		...overrides
	};
}

function makeFakeConnection(overrides: Partial<LSPProtocolConnection> = {}): LSPProtocolConnection {
	return {
		dispose: vi.fn(),
		listen: vi.fn(),
		onClose: vi.fn(),
		onError: vi.fn(),
		sendNotification: vi.fn(),
		sendRequest: vi.fn().mockResolvedValue({}),
		...overrides
	};
}

describe('LSPClient', () => {
	let fakeConnection: LSPProtocolConnection;
	let fakeProcess: EventEmitter;

	beforeEach(() => {
		fakeConnection = makeFakeConnection();
		fakeProcess = new EventEmitter();
		vi.mocked(spawn).mockReturnValue(fakeProcess as never);

		const fakeAdapter: LSPProtocolAdapter = {
			createConnection: vi.fn().mockReturnValue(fakeConnection)
		};
		setLSPProtocolAdapter(fakeAdapter);
	});

	afterEach(() => {
		resetLSPProtocolAdapter();
		vi.clearAllMocks();
	});

	describe('start()', () => {
		it('spawns the configured command with the project root as cwd', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			await client.start();

			expect(spawn).toHaveBeenCalledWith(
				'typescript-language-server',
				['--stdio'],
				expect.objectContaining({ cwd: '/repo/root' })
			);
		});

		it('transitions to "ready" and returns true on successful initialize', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			const result = await client.start();

			expect(result).toBe(true);
			expect(client.getState()).toBe('ready');
		});

		it('sends an initialize request followed by an initialized notification', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			await client.start();

			expect(fakeConnection.sendRequest).toHaveBeenCalledWith(
				'initialize',
				expect.objectContaining({
					rootUri: 'file:///repo/root'
				})
			);
			expect(fakeConnection.sendNotification).toHaveBeenCalledWith('initialized', {});
		});

		it('returns true immediately without spawning again when already ready', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();
			vi.mocked(spawn).mockClear();

			const result = await client.start();

			expect(result).toBe(true);
			expect(spawn).not.toHaveBeenCalled();
		});

		it('returns false without spawning again when already starting', async () => {
			vi.mocked(spawn).mockImplementation(() => {
				// Never resolves the adapter's createConnection synchronously in this
				// path — simulate a slow-to-initialize server by leaving state at
				// "starting" through a connection whose sendRequest never resolves.
				return fakeProcess as never;
			});
			fakeConnection.sendRequest = vi.fn(() => new Promise(() => {}));
			const client = new LSPClient(makeConfig(), '/repo/root');
			const firstStart = client.start();

			const secondResult = await client.start();

			expect(secondResult).toBe(false);
			void firstStart;
		});

		it('transitions to "error" and returns false when the adapter cannot create a connection', async () => {
			const fakeAdapter: LSPProtocolAdapter = { createConnection: vi.fn().mockReturnValue(null) };
			setLSPProtocolAdapter(fakeAdapter);
			const client = new LSPClient(makeConfig(), '/repo/root');

			const result = await client.start();

			expect(result).toBe(false);
			expect(client.getState()).toBe('error');
		});

		it('disposes the connection and ends in "stopped" when the initialize request rejects', async () => {
			// cleanup() unconditionally sets state to 'stopped' (even though start()'s
			// catch block sets 'error' just before calling it) — the final state after
			// a failed start is 'stopped', not 'error'. Documented here as the actual
			// (if slightly surprising) behavior rather than silently asserting the
			// state transition the code comments might suggest.
			fakeConnection.sendRequest = vi.fn().mockRejectedValue(new Error('server crashed'));
			const client = new LSPClient(makeConfig(), '/repo/root');

			const result = await client.start();

			expect(result).toBe(false);
			expect(client.getState()).toBe('stopped');
			expect(fakeConnection.dispose).toHaveBeenCalled();
		});

		it('transitions to "stopped" when the underlying process emits exit', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();

			fakeProcess.emit('exit');

			expect(client.getState()).toBe('stopped');
		});

		it('transitions to "error" when the underlying process emits an error event', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();

			fakeProcess.emit('error', new Error('ENOENT'));

			expect(client.getState()).toBe('error');
		});

		it('transitions to "stopped" when the connection reports it closed', async () => {
			let closeHandler: (() => void) | undefined;
			fakeConnection.onClose = vi.fn((handler) => {
				closeHandler = handler;
			});
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();

			closeHandler?.();

			expect(client.getState()).toBe('stopped');
		});
	});

	describe('sendRequest()', () => {
		it('throws when the client was never started', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			await expect(client.sendRequest('textDocument/hover')).rejects.toThrow('LSP client not started');
		});

		it('delegates to the underlying connection once started', async () => {
			fakeConnection.sendRequest = vi.fn().mockResolvedValue({ contents: 'hover text' });
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();

			const result = await client.sendRequest('textDocument/hover', { foo: 'bar' });

			expect(result).toEqual({ contents: 'hover text' });
			expect(fakeConnection.sendRequest).toHaveBeenCalledWith('textDocument/hover', { foo: 'bar' });
		});
	});

	describe('sendNotification()', () => {
		it('is a no-op when the client was never started', () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			expect(() => client.sendNotification('textDocument/didOpen')).not.toThrow();
		});

		it('delegates to the underlying connection once started', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();

			client.sendNotification('textDocument/didOpen', { uri: 'file:///a.ts' });

			expect(fakeConnection.sendNotification).toHaveBeenCalledWith('textDocument/didOpen', { uri: 'file:///a.ts' });
		});
	});

	describe('shutdown()', () => {
		it('sends a shutdown request followed by exit, then disposes the connection', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();
			vi.mocked(fakeConnection.sendRequest).mockClear();

			await client.shutdown();

			expect(fakeConnection.sendRequest).toHaveBeenCalledWith('shutdown', undefined);
			expect(fakeConnection.sendNotification).toHaveBeenCalledWith('exit', undefined);
			expect(fakeConnection.dispose).toHaveBeenCalled();
			expect(client.getState()).toBe('stopped');
		});

		it('still disposes the connection when the shutdown request rejects', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');
			await client.start();
			vi.mocked(fakeConnection.sendRequest).mockRejectedValueOnce(new Error('no response'));

			await client.shutdown();

			expect(fakeConnection.dispose).toHaveBeenCalled();
			expect(client.getState()).toBe('stopped');
		});

		it('is a safe no-op when the client was never started', async () => {
			const client = new LSPClient(makeConfig(), '/repo/root');

			await expect(client.shutdown()).resolves.toBeUndefined();
			expect(client.getState()).toBe('stopped');
		});
	});
});
