import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCliRegistry, getCliSubcommand, registerCliSubcommand } from './cli-registry';

const warn = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn })
}));

describe('cli-registry', () => {
	afterEach(() => {
		clearCliRegistry();
		warn.mockReset();
	});

	it('returns undefined for a name that has not been registered', () => {
		expect(getCliSubcommand('obsidian open')).toBeUndefined();
	});

	it('returns the registration after registering a subcommand', () => {
		const handler = vi.fn();
		registerCliSubcommand('obsidian open', 'Open Obsidian', handler);
		const reg = getCliSubcommand('obsidian open');
		expect(reg?.name).toBe('obsidian open');
		expect(reg?.description).toBe('Open Obsidian');
		expect(reg?.handler).toBe(handler);
	});

	it('returns undefined after the registry is cleared', () => {
		registerCliSubcommand('obsidian open', 'Open Obsidian', vi.fn());
		clearCliRegistry();
		expect(getCliSubcommand('obsidian open')).toBeUndefined();
	});

	it('warns when a second plugin overwrites an existing subcommand', () => {
		registerCliSubcommand('obsidian open', 'First handler', vi.fn(), 'plugin-a');
		registerCliSubcommand('obsidian open', 'Second handler', vi.fn(), 'plugin-b');

		expect(warn).toHaveBeenCalledTimes(1);
		const call = warn.mock.calls[0];
		expect(String(call[0])).toMatch(/obsidian open/);
		expect(String(call[0])).toMatch(/plugin-a/);
		expect(String(call[0])).toMatch(/plugin-b/);
	});

	it('does not warn when the same owner re-registers (idempotent)', () => {
		registerCliSubcommand('obsidian open', 'First', vi.fn(), 'plugin-a');
		registerCliSubcommand('obsidian open', 'First again', vi.fn(), 'plugin-a');

		expect(warn).not.toHaveBeenCalled();
	});

	it('does not warn when the owner is unknown on either side', () => {
		registerCliSubcommand('obsidian open', 'First', vi.fn());
		registerCliSubcommand('obsidian open', 'Second', vi.fn());

		expect(warn).not.toHaveBeenCalled();
	});
});
