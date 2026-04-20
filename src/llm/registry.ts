import type { LLMProvider, ProviderFactory } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { ProviderName } from 'config/providers.config';
import { getLogger } from 'output/logger';
import { ProviderError } from 'utils/error-handler';

export interface RegisterProviderOptions {
	override?: boolean;
	owner?: string;
}

type ProviderClass = new (config: Record<string, unknown>) => LLMProvider;

export class LLMProviderRegistry implements ProviderFactory {
	private providerOwners: Map<string, string>;
	private providers: Map<string, ProviderClass>;

	constructor() {
		this.providers = new Map();
		this.providerOwners = new Map();
	}

	createProvider(providerName: string, config: Record<string, unknown>, mcpSampling?: MCPSamplingService): LLMProvider {
		const providerClass = this.providers.get(providerName);

		if (!providerClass) {
			throw new ProviderError(`Unknown provider: ${providerName}`, {
				available: this.getAvailableProviders(),
				provider: providerName
			});
		}

		let provider: LLMProvider;
		if (providerName === ProviderName.CURSOR) {
			type CursorProviderConstructor = new (
				config: Record<string, unknown>,
				mcpSampling?: MCPSamplingService
			) => LLMProvider;
			const cursorProviderClass = providerClass as unknown as CursorProviderConstructor;
			provider = new cursorProviderClass(config, mcpSampling ?? undefined);
		} else {
			provider = new providerClass(config);
		}

		if (!provider.isConfigured()) {
			if (providerName === ProviderName.CURSOR) {
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

	getOwner(name: string): string | undefined {
		return this.providerOwners.get(name);
	}

	hasProvider(name: string): boolean {
		return this.providers.has(name);
	}

	registerProvider(name: string, providerClass: ProviderClass, options: RegisterProviderOptions = {}): void {
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

		this.providers.set(name, providerClass);
		this.providerOwners.set(name, owner);
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
