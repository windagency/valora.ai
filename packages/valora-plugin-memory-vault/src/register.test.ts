import { describe, expect, it } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';
import { MemoryProviderRegistry } from '../../../src/memory/registry';

import { register } from './index';

describe('vault plugin register()', () => {
	it('registers and activates the vault provider in the memory registry', () => {
		const registry = new MemoryProviderRegistry();

		register({
			memory: {
				register(name, provider, descriptor) {
					registry.registerProvider(name, provider, { owner: 'vault' }, descriptor);
				},
				activate(name, config) {
					registry.setActive(name, config ?? {});
				}
			},
			config: { extend: () => () => ({}) },
			cli: { addSubcommand: () => {} },
			compression: { registerStrategy: () => {} },
			lifecycle: { onActivate: () => {}, onDeactivate: () => {} },
			logger: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
			providers: { register: () => {} }
		} as unknown as PluginAPI);

		expect(registry.hasActive()).toBe(true);
		expect(registry.getActiveName()).toBe('vault');
	});
});
