import { describe, expect, it } from 'vitest';

import { satisfiesSemverRange } from './semver-range';

describe('satisfiesSemverRange', () => {
	describe('open ranges', () => {
		it('accepts every version when the range is undefined', () => {
			expect(satisfiesSemverRange('1.0.0', undefined)).toBe(true);
		});

		it('accepts every version when the range is the empty string', () => {
			expect(satisfiesSemverRange('1.0.0', '')).toBe(true);
		});

		it('accepts every version when the range is "*"', () => {
			expect(satisfiesSemverRange('1.0.0', '*')).toBe(true);
		});
	});

	describe('exact match', () => {
		it('accepts the exact version', () => {
			expect(satisfiesSemverRange('2.5.0', '2.5.0')).toBe(true);
		});

		it('rejects a different patch version', () => {
			expect(satisfiesSemverRange('2.5.1', '2.5.0')).toBe(false);
		});
	});

	describe('comparator ranges', () => {
		it('honours >= correctly', () => {
			expect(satisfiesSemverRange('2.5.0', '>=2.5.0')).toBe(true);
			expect(satisfiesSemverRange('2.4.9', '>=2.5.0')).toBe(false);
			expect(satisfiesSemverRange('3.0.0', '>=2.5.0')).toBe(true);
		});

		it('honours > correctly', () => {
			expect(satisfiesSemverRange('2.5.0', '>2.5.0')).toBe(false);
			expect(satisfiesSemverRange('2.5.1', '>2.5.0')).toBe(true);
		});

		it('honours <= correctly', () => {
			expect(satisfiesSemverRange('2.5.0', '<=2.5.0')).toBe(true);
			expect(satisfiesSemverRange('2.5.1', '<=2.5.0')).toBe(false);
		});

		it('honours < correctly', () => {
			expect(satisfiesSemverRange('2.4.9', '<2.5.0')).toBe(true);
			expect(satisfiesSemverRange('2.5.0', '<2.5.0')).toBe(false);
		});
	});

	describe('caret ranges', () => {
		it('accepts later patch and minor within the same major', () => {
			expect(satisfiesSemverRange('1.2.3', '^1.2.3')).toBe(true);
			expect(satisfiesSemverRange('1.5.0', '^1.2.3')).toBe(true);
			expect(satisfiesSemverRange('1.99.99', '^1.2.3')).toBe(true);
		});

		it('rejects the next major version', () => {
			expect(satisfiesSemverRange('2.0.0', '^1.2.3')).toBe(false);
		});

		it('rejects an earlier patch within the same minor', () => {
			expect(satisfiesSemverRange('1.2.2', '^1.2.3')).toBe(false);
		});
	});

	describe('tilde ranges', () => {
		it('accepts later patch within the same minor', () => {
			expect(satisfiesSemverRange('1.2.3', '~1.2.3')).toBe(true);
			expect(satisfiesSemverRange('1.2.99', '~1.2.3')).toBe(true);
		});

		it('rejects the next minor version', () => {
			expect(satisfiesSemverRange('1.3.0', '~1.2.3')).toBe(false);
		});
	});

	describe('compound ranges', () => {
		it('honours an AND-joined range', () => {
			expect(satisfiesSemverRange('2.5.0', '>=2.0.0 <3.0.0')).toBe(true);
			expect(satisfiesSemverRange('3.0.0', '>=2.0.0 <3.0.0')).toBe(false);
			expect(satisfiesSemverRange('1.9.9', '>=2.0.0 <3.0.0')).toBe(false);
		});
	});

	describe('invalid input', () => {
		it('rejects an unparseable version', () => {
			expect(satisfiesSemverRange('not-a-version', '>=1.0.0')).toBe(false);
		});

		it('rejects an unparseable range', () => {
			expect(satisfiesSemverRange('1.0.0', '!! garbage !!')).toBe(false);
		});
	});
});
