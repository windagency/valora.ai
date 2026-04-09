/**
 * Memory decay computation.
 *
 * Implements exponential decay: strength = 0.5^(elapsed_days / halfLifeDays)
 * Biologically inspired by the Ebbinghaus forgetting curve.
 *
 * All functions are pure with no side effects, making them easily testable
 * and safe to call during hot paths (e.g. query filtering).
 */

import { MS_PER_DAY } from 'config/constants';

/**
 * Compute current memory strength using exponential decay.
 *
 * Strength ranges from (0, 1] — it approaches 0 asymptotically but
 * never reaches it. A strength of 1.0 means "just created/accessed".
 *
 * @param referenceAt - ISO 8601 timestamp to measure elapsed time from
 * @param halfLifeDays - Number of days for strength to halve
 * @param now - Current time in milliseconds (injectable for testing, defaults to Date.now())
 * @returns Strength in range (0, 1]
 */
export function computeStrength(referenceAt: string, halfLifeDays: number, now = Date.now()): number {
	const elapsedMs = now - new Date(referenceAt).getTime();
	const elapsedDays = elapsedMs / MS_PER_DAY;
	return Math.pow(0.5, elapsedDays / halfLifeDays);
}

/**
 * Compute the effective half-life for a memory entry.
 *
 * The base half-life is extended by:
 * - Error multiplier: error memories decay more slowly to preserve hard lessons
 * - Retrieval boost: each access adds boostDays to the half-life (spaced repetition)
 *
 * @param baseHalfLifeDays - The category's default half-life in days
 * @param accessCount - Number of times the entry has been retrieved
 * @param isError - Whether the entry records an error (gets errorMultiplier × halfLife)
 * @param retrievalBoostDays - Days added to half-life per retrieval
 * @param errorMultiplier - Multiplier applied to base half-life for error entries
 * @returns Effective half-life in days
 */
export function computeEffectiveHalfLife(
	baseHalfLifeDays: number,
	accessCount: number,
	isError: boolean,
	retrievalBoostDays: number,
	errorMultiplier: number
): number {
	const base = isError ? baseHalfLifeDays * errorMultiplier : baseHalfLifeDays;
	return base + accessCount * retrievalBoostDays;
}

/**
 * Determine whether a memory entry should be pruned based on its strength.
 *
 * @param strength - Current computed strength (0-1)
 * @param threshold - Minimum strength to retain the entry
 * @returns true if the entry should be removed
 */
export function shouldPrune(strength: number, threshold: number): boolean {
	return strength < threshold;
}
