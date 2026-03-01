/**
 * Type Guard Utilities
 *
 * Centralized type assertion and guard functions for runtime validation.
 * These utilities replace duplicated inline type checks across the codebase.
 */

/**
 * Assert that a value is a non-null, non-empty string
 * @throws Error if value is not a valid string
 */
export function assertString(value: unknown, name: string): asserts value is string {
	if (value === null || value === undefined) {
		throw new Error(`${name} is required`);
	}
	if (typeof value !== 'string') {
		throw new Error(`${name} must be a string`);
	}
	if (value.trim().length === 0) {
		throw new Error(`${name} cannot be empty`);
	}
}

/**
 * Assert that a value is an array
 * @throws Error if value is not an array
 */
export function assertArray<T>(value: unknown, name: string): asserts value is T[] {
	if (!Array.isArray(value)) {
		throw new Error(`${name} must be an array`);
	}
}

/**
 * Assert that a value is a non-empty array
 * @throws Error if value is not a non-empty array
 */
export function assertNonEmptyArray<T>(value: unknown, name: string): asserts value is T[] {
	assertArray<T>(value, name);
	if ((value as T[]).length === 0) {
		throw new Error(`${name} cannot be empty`);
	}
}

/**
 * Assert that a value is a non-null object (not null, not array)
 * @throws Error if value is not a valid object
 */
export function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
	if (value === null || value === undefined) {
		throw new Error(`${name} is required`);
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${name} must be an object`);
	}
}

/**
 * Assert that a value is defined (not null or undefined)
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(value: null | T | undefined, name: string): asserts value is T {
	if (value === null || value === undefined) {
		throw new Error(`${name} is required`);
	}
}

/**
 * Type guard: Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard: Check if value is a non-null, non-array object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard: Check if value is a non-empty object
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
	return isObject(value) && Object.keys(value).length > 0;
}

/**
 * Type guard: Check if value is a valid number (not NaN, not Infinity)
 */
export function isValidNumber(value: unknown): value is number {
	return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard: Check if value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
	return Array.isArray(value) && value.length > 0;
}

/**
 * Assert that a string value matches a required pattern
 * Combines string assertion with optional pattern validation
 * @throws Error if value is not a valid string or doesn't match pattern
 */
export function assertStringWithPattern(
	value: unknown,
	name: string,
	pattern?: RegExp,
	patternDescription?: string
): asserts value is string {
	assertString(value, name);
	if (pattern && !pattern.test(value)) {
		throw new Error(`${name} ${patternDescription ?? 'has invalid format'}`);
	}
}
