/**
 * VSCode LSP Protocol Adapter — vscode-languageserver-protocol implementation
 *
 * This is a concrete implementation of LSPProtocolAdapter using the
 * vscode-languageserver-protocol library for JSON-RPC communication.
 * The interfaces are defined separately to allow for other implementations
 * (custom JSON-RPC, mock connections for testing, etc.)
 *
 * Benefits:
 * - Implements library-agnostic LSPProtocolAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Isolates all vscode-languageserver-protocol dependencies to this file
 */

import type { ChildProcess } from 'child_process';

import {
	createProtocolConnection,
	StreamMessageReader,
	StreamMessageWriter
} from 'vscode-languageserver-protocol/node';

import { getLogger } from 'output/logger';

import type { LSPProtocolAdapter, LSPProtocolConnection } from './lsp-protocol-adapter.interface';

/**
 * Structural interface for the underlying protocol connection.
 * Avoids exposing the third-party ReturnType<typeof createProtocolConnection>
 * beyond this adapter file.
 */
interface InternalProtocolConnection {
	dispose(): void;
	listen(): void;
	onClose(handler: () => void): { dispose(): void };
	onError(handler: (e: [Error, ...unknown[]]) => void): { dispose(): void };
	sendNotification(method: string, params?: unknown): Promise<void>;
	sendRequest(method: string, params?: unknown): Promise<unknown>;
}

/**
 * Wraps a vscode-languageserver-protocol ProtocolConnection
 */
class VSCodeProtocolConnection implements LSPProtocolConnection {
	private readonly connection: InternalProtocolConnection;

	constructor(connection: InternalProtocolConnection) {
		this.connection = connection;
	}

	dispose(): void {
		this.connection.dispose();
	}

	listen(): void {
		this.connection.listen();
	}

	onClose(handler: () => void): void {
		this.connection.onClose(handler);
	}

	onError(handler: (error: Error) => void): void {
		this.connection.onError(([error]) => {
			handler(error);
		});
	}

	sendNotification(method: string, params?: unknown): void {
		// The underlying connection can fail two different ways: reject the
		// returned promise (e.g. the transport write fails), or throw
		// synchronously before returning anything at all (vscode-jsonrpc does
		// this via throwIfClosedOrDisposed when the connection is already
		// closed/disposed — e.g. the remote process has already exited). Both
		// must be swallowed-and-logged the same way; a `.catch()` alone only
		// covers the first.
		try {
			this.connection.sendNotification(method, params).catch((error: unknown) => {
				getLogger().warn(`LSP notification failed: ${method}`, {
					error: error instanceof Error ? error.message : String(error)
				});
			});
		} catch (error) {
			getLogger().warn(`LSP notification failed: ${method}`, {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async sendRequest(method: string, params?: unknown): Promise<unknown> {
		return this.connection.sendRequest(method, params);
	}
}

/**
 * VSCode LSP Protocol Adapter Implementation
 *
 * Concrete implementation using vscode-languageserver-protocol.
 */
export class VSCodeLSPProtocolAdapter implements LSPProtocolAdapter {
	/**
	 * Create a protocol connection from a child process's stdio streams
	 */
	createConnection(process: ChildProcess): LSPProtocolConnection | null {
		if (!process.stdout || !process.stdin) return null;

		const reader = new StreamMessageReader(process.stdout);
		const writer = new StreamMessageWriter(process.stdin);
		const connection = createProtocolConnection(reader, writer);

		return new VSCodeProtocolConnection(connection);
	}
}

/**
 * Default adapter instance factory
 * This is used by the getLSPProtocolAdapter function in the interface
 */
export function createDefaultLSPProtocolAdapter(): LSPProtocolAdapter {
	return new VSCodeLSPProtocolAdapter();
}
