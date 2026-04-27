import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCliRegistry, getCliSubcommand, registerCliSubcommand } from './cli-registry';

describe('cli-registry', () => {
	afterEach(() => {
		clearCliRegistry();
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
});
