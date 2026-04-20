import { describe, expect, it } from 'vitest';

import { isNewerVersion } from './compare';

describe('isNewerVersion', () => {
	it('returns true when patch is newer', () => {
		expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true);
	});

	it('returns false when current is newer', () => {
		expect(isNewerVersion('1.2.4', '1.2.3')).toBe(false);
	});

	it('returns false when versions are equal', () => {
		expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
	});

	it('returns true when minor is newer', () => {
		expect(isNewerVersion('1.2.3', '1.3.0')).toBe(true);
	});

	it('returns true when major is newer', () => {
		expect(isNewerVersion('1.2.3', '2.0.0')).toBe(true);
	});

	it('treats prerelease as older than release', () => {
		expect(isNewerVersion('1.2.3-rc.1', '1.2.3')).toBe(true);
	});

	it('treats release as newer than prerelease of same version', () => {
		expect(isNewerVersion('1.2.3', '1.2.3-rc.1')).toBe(false);
	});

	it('compares numeric prerelease identifiers numerically', () => {
		expect(isNewerVersion('1.2.3-rc.1', '1.2.3-rc.2')).toBe(true);
		expect(isNewerVersion('1.2.3-rc.2', '1.2.3-rc.1')).toBe(false);
	});

	it('strips build metadata', () => {
		expect(isNewerVersion('1.2.3+build.7', '1.2.4')).toBe(true);
		expect(isNewerVersion('1.2.3', '1.2.3+build.1')).toBe(false);
	});

	it('returns false on malformed current', () => {
		expect(isNewerVersion('not-a-version', '1.2.3')).toBe(false);
	});

	it('returns false on malformed latest', () => {
		expect(isNewerVersion('1.2.3', 'not-a-version')).toBe(false);
	});

	it('returns false on empty input', () => {
		expect(isNewerVersion('', '1.2.3')).toBe(false);
		expect(isNewerVersion('1.2.3', '')).toBe(false);
	});
});
