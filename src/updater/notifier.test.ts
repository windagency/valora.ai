import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { printUpdateBanner, shouldShowReminder } from './notifier';
import type { UpdateCheckState } from './throttle';

function makeState(overrides: Partial<UpdateCheckState> = {}): UpdateCheckState {
	return {
		schemaVersion: 1,
		lastCheckAt: new Date(0).toISOString(),
		lastSuccessAt: null,
		latestVersion: '2.6.0',
		latestVersionFetchedAt: null,
		remindedForVersion: null,
		installedVersionAtCheck: null,
		...overrides
	};
}

let originalIsTTY: boolean | undefined;

beforeEach(() => {
	originalIsTTY = process.stderr.isTTY;
	Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
});

afterEach(() => {
	Object.defineProperty(process.stderr, 'isTTY', { value: originalIsTTY, configurable: true });
	vi.restoreAllMocks();
});

describe('shouldShowReminder', () => {
	it('returns false when mode is disabled', () => {
		expect(shouldShowReminder(makeState(), '2.5.0', 'disabled')).toBe(false);
	});

	it('returns false when mode is auto', () => {
		expect(shouldShowReminder(makeState(), '2.5.0', 'auto')).toBe(false);
	});

	it('returns true when reminder conditions are met', () => {
		expect(shouldShowReminder(makeState(), '2.5.0', 'reminder')).toBe(true);
	});

	it('returns false when latestVersion is null', () => {
		expect(shouldShowReminder(makeState({ latestVersion: null }), '2.5.0', 'reminder')).toBe(false);
	});

	it('returns false when latest is not newer than current', () => {
		expect(shouldShowReminder(makeState({ latestVersion: '2.5.0' }), '2.5.0', 'reminder')).toBe(false);
		expect(shouldShowReminder(makeState({ latestVersion: '2.4.0' }), '2.5.0', 'reminder')).toBe(false);
	});

	it('returns false when already reminded for this version', () => {
		const s = makeState({ latestVersion: '2.6.0', remindedForVersion: '2.6.0' });
		expect(shouldShowReminder(s, '2.5.0', 'reminder')).toBe(false);
	});

	it('returns true when remindedForVersion is for a different earlier version', () => {
		const s = makeState({ latestVersion: '2.6.0', remindedForVersion: '2.5.1' });
		expect(shouldShowReminder(s, '2.5.0', 'reminder')).toBe(true);
	});

	it('returns false when stderr is not a TTY', () => {
		Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
		expect(shouldShowReminder(makeState(), '2.5.0', 'reminder')).toBe(false);
	});
});

describe('printUpdateBanner', () => {
	it('writes a banner to stderr including both versions', () => {
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		printUpdateBanner(makeState({ latestVersion: '2.6.0' }), '2.5.0');
		expect(write).toHaveBeenCalledTimes(1);
		const output = write.mock.calls[0]?.[0] as string;
		expect(output).toContain('2.5.0');
		expect(output).toContain('2.6.0');
		expect(output).toContain('Update available');
	});

	it('does nothing when latestVersion is null', () => {
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		printUpdateBanner(makeState({ latestVersion: null }), '2.5.0');
		expect(write).not.toHaveBeenCalled();
	});
});
