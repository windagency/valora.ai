import { describe, expect, it } from 'vitest';

import { shouldCheckNow, type UpdateCheckState } from './throttle';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function baseState(lastCheckAt: string): UpdateCheckState {
	return {
		schemaVersion: 2,
		lastCheckAt,
		lastSuccessAt: null,
		latestVersion: null,
		latestVersionFetchedAt: null,
		plugins: {},
		remindedForVersion: null,
		installedVersionAtCheck: null
	};
}

describe('shouldCheckNow', () => {
	it('returns true on first run (epoch)', () => {
		const state = baseState(new Date(0).toISOString());
		expect(shouldCheckNow(state, 7, new Date('2026-04-20T12:00:00Z'))).toBe(true);
	});

	it('returns true when frequency has elapsed by 1ms', () => {
		const now = new Date('2026-04-20T12:00:00Z');
		const last = new Date(now.getTime() - 7 * MS_PER_DAY - 1);
		expect(shouldCheckNow(baseState(last.toISOString()), 7, now)).toBe(true);
	});

	it('returns false when still inside the frequency window', () => {
		const now = new Date('2026-04-20T12:00:00Z');
		const last = new Date(now.getTime() - 7 * MS_PER_DAY + 1);
		expect(shouldCheckNow(baseState(last.toISOString()), 7, now)).toBe(false);
	});

	it('returns true when lastCheckAt is in the future (clock skew)', () => {
		const now = new Date('2026-04-20T12:00:00Z');
		const last = new Date(now.getTime() + 60 * 60 * 1000);
		expect(shouldCheckNow(baseState(last.toISOString()), 7, now)).toBe(true);
	});

	it('returns true when lastCheckAt is unparseable', () => {
		expect(shouldCheckNow(baseState('garbage'), 7, new Date())).toBe(true);
	});
});
