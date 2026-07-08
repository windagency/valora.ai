/**
 * Bootstrap the bundled memory provider.
 *
 * Registers `EphemeralMemoryProvider` under the key `'ephemeral'` (owner `'core'`)
 * and activates it as the default in-process memory store. The ephemeral provider
 * holds all entries in a plain `Map` and does not require any plugin installation.
 *
 * Idempotent: callable multiple times across CLI / MCP / test entry points
 * without side effects on subsequent invocations.
 */

import { EphemeralMemoryProvider } from './ephemeral';
import { getMemoryRegistry } from './registry';

const EPHEMERAL_PROVIDER_NAME = 'ephemeral';

export function bootstrapBundledMemoryProvider(): void {
	const registry = getMemoryRegistry();
	if (!registry.hasProvider(EPHEMERAL_PROVIDER_NAME)) {
		registry.registerProvider(
			EPHEMERAL_PROVIDER_NAME,
			EphemeralMemoryProvider,
			{ owner: 'core' },
			{
				capabilities: [],
				label: 'Ephemeral (in-memory)'
			}
		);
	}
	if (!registry.hasActive()) {
		registry.setActive(EPHEMERAL_PROVIDER_NAME, {});
	}
}
