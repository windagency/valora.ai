/**
 * Error type definitions for improved type safety
 */

export interface NodeJSError extends Error {
	code?: string;
	errno?: number;
	path?: string;
	syscall?: string;
}

/**
 * File system error with additional properties
 */
export interface FileSystemError extends NodeJSError {
	code: 'EACCES' | 'EISDIR' | 'ENOENT' | 'ENOTDIR' | 'EPERM' | string;
	path?: string;
}

/**
 * Validation error with additional context
 */
export interface ValidationError extends Error {
	constraint?: string;
	field?: string;
	value?: unknown;
}

/**
 * Configuration error with additional context
 */
export interface ConfigurationError extends Error {
	configPath?: string;
	property?: string;
}

/**
 * Network error with additional context
 */
export interface NetworkError extends Error {
	statusCode?: number;
	timeout?: boolean;
	url?: string;
}

/**
 * Type guard for Node.js errors
 */
export function isNodeJSError(error: unknown): error is NodeJSError {
	return error instanceof Error && typeof (error as NodeJSError).code === 'string';
}

/**
 * Type guard for file system errors
 */
export function isFileSystemError(error: unknown): error is FileSystemError {
	return isNodeJSError(error) && typeof error.code === 'string';
}
