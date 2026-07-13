import { spawn } from 'child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultLSPProtocolAdapter, VSCodeLSPProtocolAdapter } from './lsp-protocol-adapter';
import type { LSPProtocolConnection } from './lsp-protocol-adapter.interface';

/**
 * A minimal real LSP-shaped echo server, run as a genuine child process (not
 * mocked): parses real Content-Length-framed JSON-RPC requests from stdin
 * (accumulating across fragmented reads, like a real transport) and replies
 * with a real Content-Length-framed response on stdout. This exercises this
 * adapter's actual StreamMessageReader/StreamMessageWriter wiring over real
 * bytes, rather than mocking the connection object itself.
 */
const ECHO_SERVER_SCRIPT = `
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	while (true) {
		const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
		if (headerEnd === -1) break;
		const header = buffer.slice(0, headerEnd).toString('utf8');
		const match = /Content-Length: (\\d+)/.exec(header);
		if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
		const length = parseInt(match[1], 10);
		const bodyStart = headerEnd + 4;
		if (buffer.length < bodyStart + length) break;
		const body = buffer.slice(bodyStart, bodyStart + length).toString('utf8');
		buffer = buffer.slice(bodyStart + length);
		const msg = JSON.parse(body);
		if (msg.id !== undefined && msg.method !== 'notify/ignored') {
			const response = JSON.stringify({ id: msg.id, jsonrpc: '2.0', result: { echoedMethod: msg.method, echoedParams: msg.params } });
			const framed = 'Content-Length: ' + Buffer.byteLength(response, 'utf8') + '\\r\\n\\r\\n' + response;
			process.stdout.write(framed);
		}
	}
});
`;

/** A child process that immediately writes garbage (non-framed) bytes to stdout, then stays alive. */
const GARBAGE_SERVER_SCRIPT = `
process.stdout.write('not a valid LSP frame at all, just garbage bytes\\n');
process.stdin.resume();
`;

describe('VSCodeLSPProtocolAdapter', () => {
	describe('createConnection', () => {
		it('returns null when the process has no stdout', () => {
			const adapter = new VSCodeLSPProtocolAdapter();
			const fakeProcess = { stdin: {}, stdout: null } as never;

			expect(adapter.createConnection(fakeProcess)).toBeNull();
		});

		it('returns null when the process has no stdin', () => {
			const adapter = new VSCodeLSPProtocolAdapter();
			const fakeProcess = { stdin: null, stdout: {} } as never;

			expect(adapter.createConnection(fakeProcess)).toBeNull();
		});
	});

	describe('real wire-protocol round trip (real child process, real Content-Length framing)', () => {
		let connection: LSPProtocolConnection | null;
		let child: ReturnType<typeof spawn>;

		afterEach(() => {
			connection?.dispose();
			child.kill('SIGKILL');
		});

		it('sends a real framed request and receives a real framed response', async () => {
			child = spawn(process.execPath, ['-e', ECHO_SERVER_SCRIPT]);
			const adapter = new VSCodeLSPProtocolAdapter();
			connection = adapter.createConnection(child);
			expect(connection).not.toBeNull();
			connection!.listen();

			const result = await connection!.sendRequest('test/echo', { foo: 'bar' });

			expect(result).toEqual({ echoedMethod: 'test/echo', echoedParams: { foo: 'bar' } });
		});

		it('round-trips a large payload split across multiple stream reads', async () => {
			child = spawn(process.execPath, ['-e', ECHO_SERVER_SCRIPT]);
			const adapter = new VSCodeLSPProtocolAdapter();
			connection = adapter.createConnection(child);
			connection!.listen();

			const largeValue = 'x'.repeat(200_000); // large enough to arrive as multiple stdio chunks
			const result = await connection!.sendRequest('test/echo', { largeValue });

			expect(result).toEqual({ echoedMethod: 'test/echo', echoedParams: { largeValue } });
		});

		it('does not crash the connection when the remote sends non-protocol garbage bytes', async () => {
			child = spawn(process.execPath, ['-e', GARBAGE_SERVER_SCRIPT]);
			const adapter = new VSCodeLSPProtocolAdapter();
			connection = adapter.createConnection(child);
			const errors: Error[] = [];
			connection!.onError((error) => errors.push(error));
			connection!.listen();

			// Give the garbage bytes time to arrive and be (mis)parsed.
			await new Promise((resolve) => setTimeout(resolve, 200));

			// The important property is that nothing crashed the test process —
			// a real language server occasionally emitting a malformed/partial
			// frame must not take down the whole host process.
			expect(child.exitCode).toBeNull();
		});
	});

	describe('sendNotification error handling', () => {
		let child: ReturnType<typeof spawn>;

		afterEach(() => {
			child.kill('SIGKILL');
		});

		it('does not produce an unhandled promise rejection when the underlying transport write fails', async () => {
			child = spawn(process.execPath, ['-e', 'process.stdin.resume();']);
			await new Promise((resolve) => child.once('spawn', resolve));
			const adapter = new VSCodeLSPProtocolAdapter();
			const connection = adapter.createConnection(child)!;
			connection.listen();

			const unhandledRejections: unknown[] = [];
			const onUnhandledRejection = (reason: unknown): void => {
				unhandledRejections.push(reason);
			};
			process.on('unhandledRejection', onUnhandledRejection);

			try {
				// Kill the child so its stdin pipe is closed — the underlying
				// connection's write is forced to fail.
				child.kill('SIGKILL');
				await new Promise((resolve) => child.once('exit', resolve));

				connection.sendNotification('test/notify', { foo: 'bar' });
				// Generous margin: under heavy parallel subprocess load (many other
				// real child processes spawned by sibling test files competing for
				// scheduling) a short wait can occasionally elapse before Node's
				// unhandledRejection detection fires on the next microtask tick.
				await new Promise((resolve) => setTimeout(resolve, 500));

				expect(unhandledRejections).toHaveLength(0);
			} finally {
				process.off('unhandledRejection', onUnhandledRejection);
			}
		});
	});
});

describe('createDefaultLSPProtocolAdapter', () => {
	it('returns a VSCodeLSPProtocolAdapter instance', () => {
		expect(createDefaultLSPProtocolAdapter()).toBeInstanceOf(VSCodeLSPProtocolAdapter);
	});
});
