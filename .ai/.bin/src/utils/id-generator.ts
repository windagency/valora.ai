/**
 * ID Generator Utility
 *
 * Wraps nanoid library to provide a clean interface for ID generation,
 * isolating the application from direct third-party library dependencies.
 *
 */

import { nanoid } from 'nanoid';

/**
 * Default ID length when not specified
 */
const DEFAULT_ID_LENGTH = 21;

/**
 * Generate a unique ID with optional custom length
 *
 * @param length - Optional length of the ID (default: 21)
 * @returns A unique alphanumeric ID
 */
export function generateId(length?: number): string {
	return nanoid(length ?? DEFAULT_ID_LENGTH);
}

/**
 * Generate a unique session ID
 *
 * @returns A 12-character unique session ID
 */
export function generateSessionId(): string {
	return nanoid(12);
}

/**
 * Generate a unique exploration ID
 *
 * @returns A prefixed unique exploration ID
 */
export function generateExplorationId(): string {
	return `exp-${nanoid(10)}`;
}

/**
 * Generate a unique insight ID
 *
 * @returns A prefixed unique insight ID
 */
export function generateInsightId(): string {
	return `insight-${nanoid(12)}`;
}

/**
 * Generate a unique decision ID
 *
 * @returns A prefixed unique decision ID
 */
export function generateDecisionId(): string {
	return `decision-${nanoid(12)}`;
}

/**
 * Generate a short ID for filenames or temporary use
 *
 * @returns A 6-character unique ID
 */
export function generateShortId(): string {
	return nanoid(6);
}
