/**
 * Memory provider registry — the indirection layer that lets a plugin
 * replace Valora's bundled memory implementation.
 *
 * Mirrors `src/llm/registry.ts` (LLM provider registry) but for memory:
 * registered providers are identified by a string key, owners are tracked
 * to detect plugin-collision, and at most one provider is "active" at a
 * time. Core consumers (executor, CLI, MCP shutdown) call
 * `getMemoryRegistry().getActive()` and program against the
 * `MemoryProvider` contract rather than instantiating a concrete store.
 */

import type { MemoryProvider, MemoryProviderDescriptor } from 'types/memory.types';

import { getLogger } from 'output/logger';
import { ProviderError } from 'utils/error-handler';

export interface RegisterMemoryProviderOptions {
	override?: boolean;
	owner?: string;
}

type MemoryProviderClass = new (config: Record<string, unknown>) => MemoryProvider;
type MemoryProviderEntry = MemoryProviderClass | MemoryProviderFactoryFn;
type MemoryProviderFactoryFn = (config: Record<string, unknown>) => MemoryProvider;

export class MemoryProviderConflictError extends ProviderError {
	readonly existingOwner: string;
	readonly incomingOwner: string;
	readonly providerKey: string;

	constructor(key: string, existingOwner: string, incomingOwner: string) {
		super(
			`Memory provider key "${key}" is already registered by "${existingOwner}". ` +
				`"${incomingOwner}" cannot register the same key without declaring an override.`,
			{ existingOwner, incomingOwner, provider: key }
		);
		this.providerKey = key;
		this.existingOwner = existingOwner;
		this.incomingOwner = incomingOwner;
	}
}

export class MemoryProviderRegistry {
	private activeInstance: MemoryProvider | null;
	private activeName: null | string;
	private descriptors: Map<string, MemoryProviderDescriptor>;
	private owners: Map<string, string>;
	private providers: Map<string, MemoryProviderEntry>;

	constructor() {
		this.providers = new Map();
		this.owners = new Map();
		this.descriptors = new Map();
		this.activeName = null;
		this.activeInstance = null;
	}

	getActive(): MemoryProvider {
		if (!this.activeInstance) {
			throw new ProviderError('No active memory provider. Call setActive() first.', {
				available: this.getAvailableProviders()
			});
		}
		return this.activeInstance;
	}

	getActiveName(): string | undefined {
		return this.activeName ?? undefined;
	}

	getAvailableProviders(): string[] {
		return Array.from(this.providers.keys());
	}

	getDescriptor(name: string): MemoryProviderDescriptor | undefined {
		return this.descriptors.get(name);
	}

	getOwner(name: string): string | undefined {
		return this.owners.get(name);
	}

	hasActive(): boolean {
		return this.activeInstance !== null;
	}

	hasProvider(name: string): boolean {
		return this.providers.has(name);
	}

	registerProvider(
		name: string,
		entry: MemoryProviderEntry,
		options: RegisterMemoryProviderOptions = {},
		descriptor?: MemoryProviderDescriptor
	): void {
		const { override = false, owner = 'core' } = options;

		if (this.providers.has(name)) {
			const existingOwner = this.owners.get(name) ?? 'unknown';

			if (existingOwner === owner) {
				return;
			}

			if (!override) {
				throw new MemoryProviderConflictError(name, existingOwner, owner);
			}

			getLogger().warn(`Memory provider "${name}" overridden by "${owner}" (was "${existingOwner}")`, {
				incomingOwner: owner,
				previousOwner: existingOwner,
				provider: name
			});
		}

		this.providers.set(name, entry);
		this.owners.set(name, owner);
		if (descriptor) {
			this.descriptors.set(name, descriptor);
		}
	}

	setActive(name: string, config: Record<string, unknown>): void {
		const entry = this.providers.get(name);
		if (!entry) {
			throw new ProviderError(`Unknown memory provider: ${name}`, {
				available: this.getAvailableProviders(),
				provider: name
			});
		}

		const instance = isClass(entry) ? new entry(config) : entry(config);
		this.activeName = name;
		this.activeInstance = instance;
	}
}

let registryInstance: MemoryProviderRegistry | null = null;

export function getMemoryRegistry(): MemoryProviderRegistry {
	registryInstance ??= new MemoryProviderRegistry();
	return registryInstance;
}

export function resetMemoryRegistry(): void {
	registryInstance = null;
}

function isClass(entry: MemoryProviderEntry): entry is MemoryProviderClass {
	// A class constructor has a truthy `.prototype`; an arrow-function factory
	// does not. Regular `function` declarations also have a prototype and would
	// be mis-classified as classes — plugin authors must use arrow functions
	// (or an object factory) when registering a factory, not `function` declarations.
	return typeof entry === 'function' && Boolean((entry as { prototype?: unknown }).prototype);
}
