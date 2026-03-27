/**
 * LSP Protocol Adapter Interface
 *
 * Library-agnostic interface for LSP JSON-RPC protocol communication.
 * Implementations can use vscode-languageserver-protocol, custom JSON-RPC, or any
 * compatible transport.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock protocol connections
 * - Library migration without changing consumer code
 */

import type { ChildProcess } from 'child_process';

import { createDefaultLSPProtocolAdapter } from './lsp-protocol-adapter';

/**
 * A protocol connection to a language server process
 *
 * Wraps the JSON-RPC transport layer, providing typed request/notification methods
 * without exposing the underlying protocol library.
 */
export interface LSPProtocolConnection {
	/**
	 * Clean up and release all resources
	 */
	dispose(): void;

	/**
	 * Register a handler for connection close events
	 */
	onClose(handler: () => void): void;

	/**
	 * Register a handler for connection errors
	 */
	onError(handler: (error: Error) => void): void;

	/**
	 * Send a JSON-RPC notification (no response expected)
	 *
	 * @param method - The LSP method name
	 * @param params - Optional parameters
	 */
	sendNotification(method: string, params?: unknown): void;

	/**
	 * Send a JSON-RPC request and wait for response
	 *
	 * @param method - The LSP method name
	 * @param params - Optional parameters
	 * @returns The response result
	 */
	sendRequest(method: string, params?: unknown): Promise<unknown>;

	/**
	 * Start listening for incoming messages
	 */
	listen(): void;
}

/**
 * LSP Protocol Adapter Interface
 *
 * Defines the contract for creating LSP protocol connections.
 * All protocol-level operations should go through this interface.
 */
export interface LSPProtocolAdapter {
	/**
	 * Create a protocol connection from a child process's stdio streams
	 *
	 * @param process - The child process running the language server
	 * @returns A protocol connection, or null if streams are unavailable
	 */
	createConnection(process: ChildProcess): LSPProtocolConnection | null;
}

/**
 * Singleton instance
 */
let adapterInstance: LSPProtocolAdapter | null = null;

/**
 * Get the singleton LSPProtocolAdapter instance
 *
 * @returns LSPProtocolAdapter instance
 *
 * @example
 * import { getLSPProtocolAdapter } from 'lsp/lsp-protocol-adapter.interface';
 *
 * const adapter = getLSPProtocolAdapter();
 * const connection = adapter.createConnection(childProcess);
 * connection.listen();
 * const result = await connection.sendRequest('initialize', params);
 */
export function getLSPProtocolAdapter(): LSPProtocolAdapter {
	adapterInstance ??= createDefaultLSPProtocolAdapter();
	return adapterInstance;
}

/**
 * Set a custom LSPProtocolAdapter implementation
 * Useful for testing or switching to different protocol libraries
 *
 * @param adapter - The adapter instance to use
 */
export function setLSPProtocolAdapter(adapter: LSPProtocolAdapter): void {
	adapterInstance = adapter;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetLSPProtocolAdapter(): void {
	adapterInstance = null;
}
