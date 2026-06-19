import { describe, expect, it } from 'vitest';

import { getDisclosureFooter, isDisclosureSuppressed } from './disclosure';

describe('disclosure', () => {
	it('interpolates the version into the footer', () => {
		const footer = getDisclosureFooter('2.5.0');
		expect(footer).toContain('2.5.0');
		expect(footer).toContain('EU AI Act Art. 50');
	});

	it('is not suppressed by default', () => {
		expect(isDisclosureSuppressed({}, {})).toBe(false);
	});

	it('is suppressed when noDisclosure flag is true', () => {
		expect(isDisclosureSuppressed({ noDisclosure: true }, {})).toBe(true);
	});

	it('is suppressed when VALORA_NO_DISCLOSURE=1 env var is set', () => {
		expect(isDisclosureSuppressed({}, { VALORA_NO_DISCLOSURE: '1' })).toBe(true);
	});

	it('is not suppressed when VALORA_NO_DISCLOSURE is not 1', () => {
		expect(isDisclosureSuppressed({}, { VALORA_NO_DISCLOSURE: '0' })).toBe(false);
		expect(isDisclosureSuppressed({}, { VALORA_NO_DISCLOSURE: 'false' })).toBe(false);
	});

	it('is suppressed when --no-disclosure appears in argv', () => {
		expect(isDisclosureSuppressed({}, {}, ['valora', 'explore', '--no-disclosure'])).toBe(true);
	});

	it('is suppressed when --output json is in argv', () => {
		expect(isDisclosureSuppressed({}, {}, ['valora', 'explore', '--output', 'json'])).toBe(true);
	});

	it('is suppressed when --output yaml is in argv', () => {
		expect(isDisclosureSuppressed({}, {}, ['valora', 'explore', '--output', 'yaml'])).toBe(true);
	});

	it('is not suppressed when --output markdown is in argv', () => {
		expect(isDisclosureSuppressed({}, {}, ['valora', 'explore', '--output', 'markdown'])).toBe(false);
	});

	it('is not suppressed when argv is empty', () => {
		expect(isDisclosureSuppressed({}, {}, [])).toBe(false);
	});
});
