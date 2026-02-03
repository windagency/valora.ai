/**
 * Error Utilities
 *
 * Simple error formatting utilities that don't have external dependencies.
 * This module intentionally has no imports that could cause circular dependencies.
 */

/**
 * Extract error message from unknown error value
 *
 * This is the standard utility for formatting unknown caught errors.
 * Replaces the common pattern: `error instanceof Error ? error.message : String(error)`
 *
 * @param error - The caught error value (can be any type)
 * @param context - Optional context prefix for the message
 * @returns Formatted error message string
 */
export function formatErrorMessage(error: unknown, context?: string): string {
	const message = error instanceof Error ? error.message : String(error);
	return context ? `${context}: ${message}` : message;
}

/**
 * Check if a value is an Error object
 */
export function isError(value: unknown): value is Error {
	return value instanceof Error;
}

/**
 * Get the stack trace from an error, or undefined if not available
 */
export function getErrorStack(error: unknown): string | undefined {
	return error instanceof Error ? error.stack : undefined;
}
