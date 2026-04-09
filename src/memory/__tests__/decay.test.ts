/**
 * Unit tests for memory decay computation
 */

import { describe, it, expect } from 'vitest';
import { computeStrength, computeEffectiveHalfLife, shouldPrune } from '../decay';
import { MS_PER_DAY } from '../../config/constants';

/**
 * Helper: Create an ISO 8601 timestamp from milliseconds ago
 */
function createTimestampMsAgo(msAgo: number): string {
	return new Date(Date.now() - msAgo).toISOString();
}

describe('computeStrength', () => {
	const fixedNow = 1000000000000; // Fixed timestamp for deterministic tests

	it('returns 1.0 when elapsed time is 0', () => {
		const referenceAt = new Date(fixedNow).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBe(1.0);
	});

	it('returns exactly 0.5 when elapsed equals halfLifeDays', () => {
		const referenceAt = new Date(fixedNow - 7 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeCloseTo(0.5, 10);
	});

	it('returns 0.25 when elapsed equals 2 × halfLifeDays', () => {
		const referenceAt = new Date(fixedNow - 14 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeCloseTo(0.25, 10);
	});

	it('returns 0.125 when elapsed equals 3 × halfLifeDays', () => {
		const referenceAt = new Date(fixedNow - 21 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeCloseTo(0.125, 10);
	});

	it('approaches 0 with very large elapsed time but stays > 0', () => {
		// 365 days with 7-day half-life = 52+ halvings
		const referenceAt = new Date(fixedNow - 365 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeGreaterThan(0);
		expect(strength).toBeLessThan(0.0000001); // Very small but positive
	});

	it('allows now parameter to be injected', () => {
		const referenceAt = new Date(fixedNow - 7 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeCloseTo(0.5, 10);
	});

	it('defaults to Date.now() when now parameter is not provided', () => {
		// Use a timestamp from ~1 day ago
		const referenceAt = createTimestampMsAgo(MS_PER_DAY);
		const strength = computeStrength(referenceAt, 7);
		// Should be close to 0.5^(1/7) ≈ 0.906
		expect(strength).toBeCloseTo(Math.pow(0.5, 1 / 7), 2);
	});

	it('handles valid ISO 8601 timestamps correctly', () => {
		const isoTimestamp = '2025-01-01T00:00:00.000Z';
		const now = new Date('2025-01-08T00:00:00.000Z').getTime(); // 7 days later
		const strength = computeStrength(isoTimestamp, 7, now);
		expect(strength).toBeCloseTo(0.5, 10);
	});

	it('computes strength correctly with fractional half-life days', () => {
		const referenceAt = new Date(fixedNow - 1.5 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 3, fixedNow);
		// 1.5 / 3 = 0.5, so 0.5^0.5 ≈ 0.707
		expect(strength).toBeCloseTo(Math.pow(0.5, 0.5), 10);
	});

	it('decays faster with smaller half-life', () => {
		const referenceAt = new Date(fixedNow - 5 * MS_PER_DAY).toISOString();
		const strength_hl3 = computeStrength(referenceAt, 3, fixedNow);
		const strength_hl7 = computeStrength(referenceAt, 7, fixedNow);
		expect(strength_hl3).toBeLessThan(strength_hl7);
	});

	it('decays slower with larger half-life', () => {
		const referenceAt = new Date(fixedNow - 5 * MS_PER_DAY).toISOString();
		const strength_hl7 = computeStrength(referenceAt, 7, fixedNow);
		const strength_hl14 = computeStrength(referenceAt, 14, fixedNow);
		expect(strength_hl7).toBeLessThan(strength_hl14);
	});
});

describe('computeEffectiveHalfLife', () => {
	it('returns baseHalfLife when accessCount=0 and isError=false', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			0, // accessCount
			false, // isError
			2, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(7);
	});

	it('returns baseHalfLife × errorMultiplier when isError=true and accessCount=0', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			0, // accessCount
			true, // isError
			2, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(14); // 7 * 2
	});

	it('adds retrievalBoostDays × accessCount for non-error entries', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			3, // accessCount
			false, // isError
			2, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(13); // 7 + (3 * 2)
	});

	it('combines error multiplier and retrieval boost', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			3, // accessCount
			true, // isError
			2, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(20); // (7 * 2) + (3 * 2)
	});

	it('handles zero boost days', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			5, // accessCount
			false, // isError
			0, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(7); // No boost added
	});

	it('handles zero error multiplier (edge case)', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			0, // accessCount
			true, // isError
			2, // retrievalBoostDays
			0 // errorMultiplier
		);
		expect(result).toBe(0); // 7 * 0
	});

	it('handles large access counts', () => {
		const result = computeEffectiveHalfLife(
			7, // baseHalfLifeDays
			100, // accessCount
			false, // isError
			2, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBe(207); // 7 + (100 * 2)
	});

	it('handles fractional half-life and boost days', () => {
		const result = computeEffectiveHalfLife(
			3.5, // baseHalfLifeDays
			2, // accessCount
			false, // isError
			1.5, // retrievalBoostDays
			2 // errorMultiplier
		);
		expect(result).toBeCloseTo(6.5, 10); // 3.5 + (2 * 1.5)
	});
});

describe('shouldPrune', () => {
	it('returns true when strength < threshold', () => {
		const result = shouldPrune(0.1, 0.2);
		expect(result).toBe(true);
	});

	it('returns false when strength > threshold', () => {
		const result = shouldPrune(0.5, 0.2);
		expect(result).toBe(false);
	});

	it('returns false when strength === threshold (edge case)', () => {
		const result = shouldPrune(0.2, 0.2);
		expect(result).toBe(false);
	});

	it('returns true when strength is very small and threshold is non-zero', () => {
		const result = shouldPrune(0.0001, 0.05);
		expect(result).toBe(true);
	});

	it('returns false when strength is 1.0 (newly created)', () => {
		const result = shouldPrune(1.0, 0.2);
		expect(result).toBe(false);
	});

	it('returns false when both are 0 (edge case)', () => {
		const result = shouldPrune(0, 0);
		expect(result).toBe(false);
	});

	it('returns true when strength is 0 and threshold is > 0', () => {
		const result = shouldPrune(0, 0.1);
		expect(result).toBe(true);
	});

	it('handles floating point threshold correctly', () => {
		const result = shouldPrune(0.19999, 0.2);
		expect(result).toBe(true);
	});

	it('returns false for equal floating point values', () => {
		const result = shouldPrune(0.2, 0.2);
		expect(result).toBe(false);
	});
});

describe('computeStrength + computeEffectiveHalfLife integration', () => {
	const fixedNow = 1000000000000;

	it('applies effective half-life in decay calculation', () => {
		const referenceAt = new Date(fixedNow - 10 * MS_PER_DAY).toISOString();

		// Non-error, no access: base half-life = 5
		const effectiveHl1 = computeEffectiveHalfLife(5, 0, false, 2, 2);
		const strength1 = computeStrength(referenceAt, effectiveHl1, fixedNow);

		// Same entry but with 3 accesses: half-life = 5 + (3*2) = 11
		const effectiveHl2 = computeEffectiveHalfLife(5, 3, false, 2, 2);
		const strength2 = computeStrength(referenceAt, effectiveHl2, fixedNow);

		// Longer effective half-life should result in higher strength
		expect(strength2).toBeGreaterThan(strength1);
	});

	it('error entries with errors decay more slowly', () => {
		const referenceAt = new Date(fixedNow - 10 * MS_PER_DAY).toISOString();

		// Non-error with base half-life 5
		const nonErrorHl = computeEffectiveHalfLife(5, 0, false, 2, 2);
		const nonErrorStrength = computeStrength(referenceAt, nonErrorHl, fixedNow);

		// Error entry with same base half-life
		const errorHl = computeEffectiveHalfLife(5, 0, true, 2, 2);
		const errorStrength = computeStrength(referenceAt, errorHl, fixedNow);

		// Error should decay slower (longer effective half-life)
		expect(errorStrength).toBeGreaterThan(nonErrorStrength);
	});
});

describe('Real-world decay scenarios', () => {
	it('represents typical episodic memory (7-day half-life)', () => {
		const fixedNow = 1000000000000;
		const referenceAt = new Date(fixedNow - 7 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 7, fixedNow);
		expect(strength).toBeCloseTo(0.5, 5); // After 7 days, 50% strength
	});

	it('represents semantic memory (30-day half-life)', () => {
		const fixedNow = 1000000000000;
		const referenceAt = new Date(fixedNow - 30 * MS_PER_DAY).toISOString();
		const strength = computeStrength(referenceAt, 30, fixedNow);
		expect(strength).toBeCloseTo(0.5, 5); // After 30 days, 50% strength
	});

	it('represents decision memory with retrieval boost', () => {
		const fixedNow = 1000000000000;
		const createdAt = new Date(fixedNow - 30 * MS_PER_DAY).toISOString();

		// Base decision half-life: 21 days, accessed 3 times with 2-day boost each
		const effectiveHl = computeEffectiveHalfLife(21, 3, false, 2, 2);
		const strength = computeStrength(createdAt, effectiveHl, fixedNow);

		// Effective half-life = 21 + 6 = 27 days
		// Elapsed = 30 days, so strength ≈ 0.5^(30/27) ≈ 0.48
		expect(strength).toBeCloseTo(0.48, 1);
	});

	it('demonstrates spaced repetition benefit', () => {
		const fixedNow = 1000000000000;
		const createdAt = new Date(fixedNow - 30 * MS_PER_DAY).toISOString();

		// No accesses: half-life = 7
		const noAccessHl = computeEffectiveHalfLife(7, 0, false, 2, 2);
		const noAccessStrength = computeStrength(createdAt, noAccessHl, fixedNow);

		// 5 accesses: half-life = 7 + (5*2) = 17
		const withAccessHl = computeEffectiveHalfLife(7, 5, false, 2, 2);
		const withAccessStrength = computeStrength(createdAt, withAccessHl, fixedNow);

		// More accesses = longer retention
		expect(withAccessStrength).toBeGreaterThan(noAccessStrength);
	});
});
