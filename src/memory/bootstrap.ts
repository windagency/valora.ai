/**
 * Bootstrap the bundled memory provider.
 *
 * Registers `VaultMemoryProvider` under the key `'vault'` (owner `'core'`)
 * and activates it. The bundled vault is wired at boot rather than via
 * plugin discovery so it is always the default `memory.provider` unless a
 * user plugin overrides it via `manifest.overrides: ['vault']`.
 *
 * Idempotent: callable multiple times across CLI / MCP / test entry points
 * without side effects on subsequent invocations.
 */

import {
	type ConsolidationCompleteListener,
	type ProviderLookup,
	VAULT_DESCRIPTOR,
	VaultMemoryProvider,
	type VaultPluginConfig
} from '@windagency/valora-plugin-memory-vault';

import { getProviderRegistry } from 'llm/registry';
import { getPipelineEmitter } from 'output/pipeline-emitter';

import { getMemoryRegistry } from './registry';

const VAULT_PROVIDER_NAME = 'vault';

export interface BootstrapBundledMemoryProviderOptions {
	/** Override the runtime-resolved vault directory. */
	vaultDir?: string;
	/** Override the bundled vault's tuning config parsed from `plugins['memory-vault']`. */
	memoryConfig?: VaultPluginConfig;
	/**
	 * Override the consolidation-complete listener. Defaults to the host's
	 * pipeline emitter so MCP/CLI surfaces continue to receive events. Tests
	 * can supply a no-op or spy.
	 */
	onConsolidationComplete?: ConsolidationCompleteListener;
	/**
	 * Override the provider lookup used by the bundled vault to resolve an
	 * embedder. Defaults to the host's `llm/registry`.
	 */
	providerLookup?: ProviderLookup;
}

export function bootstrapBundledMemoryProvider(options: BootstrapBundledMemoryProviderOptions = {}): void {
	const registry = getMemoryRegistry();

	if (!registry.hasProvider(VAULT_PROVIDER_NAME)) {
		registry.registerProvider(VAULT_PROVIDER_NAME, VaultMemoryProvider, { owner: 'core' }, VAULT_DESCRIPTOR);
	}

	if (!registry.hasActive()) {
		registry.setActive(VAULT_PROVIDER_NAME, {
			memoryConfig: options.memoryConfig,
			onConsolidationComplete: options.onConsolidationComplete ?? defaultOnConsolidationComplete(),
			providerLookup: options.providerLookup ?? defaultProviderLookup(),
			vaultDir: options.vaultDir
		});
	}
}

function defaultOnConsolidationComplete(): ConsolidationCompleteListener {
	return (result) => {
		getPipelineEmitter().emitConsolidationComplete(result);
	};
}

function defaultProviderLookup(): ProviderLookup {
	const registry = getProviderRegistry();
	return {
		createProvider: (name, config) => registry.createProvider(name, config),
		getAvailableProviders: () => registry.getAvailableProviders()
	};
}
