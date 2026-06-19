import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import type { LLMProvider, ProviderFactory } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { BuiltinProviders } from 'config/providers.config';
import { getLogger } from 'output/logger';
import { ProviderError } from 'utils/error-handler';

export interface RegisterProviderOptions {
	override?: boolean;
	owner?: string;
}

type ProviderClass = new (config: Record<string, unknown>) => LLMProvider;
type ProviderEntry = ProviderClass | ProviderFactoryFn;
type ProviderFactoryFn = (config: Record<string, unknown>) => LLMProvider;

export class LLMProviderRegistry implements ProviderFactory {
	private providerDescriptors: Map<string, ProviderDescriptor>;
	private providerOwners: Map<string, string>;
	private providers: Map<string, ProviderEntry>;

	constructor() {
		this.providerDescriptors = new Map();
		this.providers = new Map();
		this.providerOwners = new Map();
	}

	createProvider(providerName: string, config: Record<string, unknown>, mcpSampling?: MCPSamplingService): LLMProvider {
		const providerEntry = this.providers.get(providerName);

		if (!providerEntry) {
			throw new ProviderError(`Unknown provider: ${providerName}`, {
				available: this.getAvailableProviders(),
				provider: providerName
			});
		}

		let provider: LLMProvider;
		if (providerName === BuiltinProviders.CURSOR) {
			type CursorProviderConstructor = new (
				config: Record<string, unknown>,
				mcpSampling?: MCPSamplingService
			) => LLMProvider;
			const cursorProviderClass = providerEntry as unknown as CursorProviderConstructor;
			provider = new cursorProviderClass(config, mcpSampling ?? undefined);
		} else if (providerEntry.prototype) {
			// It's a class constructor
			provider = new (providerEntry as ProviderClass)(config);
		} else {
			// It's a plain factory function
			provider = (providerEntry as ProviderFactoryFn)(config);
		}

		if (!provider.isConfigured()) {
			if (providerName === BuiltinProviders.CURSOR) {
				throw new ProviderError(
					`Cursor provider requires MCP context (must run in Cursor via MCP).\n\n` +
						`If you're in Cursor and seeing this error, Cursor may not support MCP sampling yet.\n` +
						`Fallback: Use a traditional provider by configuring API keys: valora config setup --quick`,
					{
						hint: 'Cursor provider only works when running as MCP server in Cursor',
						provider: providerName
					}
				);
			}

			throw new ProviderError(`Provider ${providerName} is not properly configured`, {
				hint: 'Run "valora config setup" to configure the provider',
				provider: providerName
			});
		}

		return provider;
	}

	getAvailableProviders(): string[] {
		return Array.from(this.providers.keys());
	}

	getDescriptor(name: string): ProviderDescriptor | undefined {
		return this.providerDescriptors.get(name);
	}

	getOwner(name: string): string | undefined {
		return this.providerOwners.get(name);
	}

	hasProvider(name: string): boolean {
		return this.providers.has(name);
	}

	registerProvider(
		name: string,
		providerEntry: ProviderEntry,
		options: RegisterProviderOptions = {},
		descriptor?: ProviderDescriptor
	): void {
		const { override = false, owner = 'core' } = options;

		if (this.providers.has(name)) {
			const existingOwner = this.providerOwners.get(name) ?? 'unknown';

			if (existingOwner === owner) {
				return;
			}

			if (!override) {
				throw new ProviderConflictError(name, existingOwner, owner);
			}

			getLogger().warn(`Provider "${name}" overridden by "${owner}" (was "${existingOwner}")`, {
				incomingOwner: owner,
				previousOwner: existingOwner,
				provider: name
			});
		}

		this.providers.set(name, providerEntry);
		this.providerOwners.set(name, owner);
		if (descriptor) {
			this.providerDescriptors.set(name, descriptor);
		}
	}
}

export class ProviderConflictError extends ProviderError {
	readonly existingOwner: string;
	readonly incomingOwner: string;
	readonly providerKey: string;

	constructor(key: string, existingOwner: string, incomingOwner: string) {
		super(
			`Provider key "${key}" is already registered by "${existingOwner}". ` +
				`"${incomingOwner}" cannot register the same key without declaring an override.`,
			{ existingOwner, incomingOwner, provider: key }
		);
		this.providerKey = key;
		this.existingOwner = existingOwner;
		this.incomingOwner = incomingOwner;
	}
}

let registryInstance: LLMProviderRegistry | null = null;

export function getProviderRegistry(): LLMProviderRegistry {
	registryInstance ??= new LLMProviderRegistry();
	return registryInstance;
}

export function resetProviderRegistry(): void {
	registryInstance = null;
}
