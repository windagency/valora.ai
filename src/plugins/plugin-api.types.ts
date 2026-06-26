import type { ZodType, ZodTypeAny } from 'zod';

import type { CompressionStrategy } from 'executor/output-compression.service';
import type { Logger } from 'output/logger';
import type { LLMProvider } from 'types/llm.types';
import type { MemoryProvider, MemoryProviderDescriptor } from 'types/memory.types';

export type { CompressionStrategy };

export interface CodePluginModule {
	register(api: PluginAPI): Promise<void> | void;
}

export interface PluginAPI {
	cli: {
		addSubcommand(name: string, description: string, handler: () => Promise<void> | void): void;
	};
	compression: {
		registerStrategy(tool: string, fn: CompressionStrategy): void;
	};
	config: {
		extend<TOutput>(schema: ZodType<TOutput>): () => TOutput;
	};
	lifecycle: PluginLifecycleHooks;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	memory: {
		activate(name: string, config?: Record<string, unknown>): void;
		register(name: string, provider: PluginMemoryProvider, descriptor?: MemoryProviderDescriptor): void;
	};
	providers: {
		register(name: string, provider: PluginProvider, descriptor?: ProviderDescriptor): void;
	};
}

export interface PluginLifecycleHooks {
	onActivate: (fn: () => Promise<void>) => void;
	onDeactivate: (fn: () => Promise<void>) => void;
}

export type PluginMemoryProvider = PluginMemoryProviderClass | PluginMemoryProviderFactory;

export type PluginMemoryProviderClass = new (config: Record<string, unknown>) => MemoryProvider;

export type PluginMemoryProviderFactory = (config: Record<string, unknown>) => MemoryProvider;

export type PluginProvider = PluginProviderClass | PluginProviderFactory;

export type PluginProviderClass = new (config: Record<string, unknown>) => LLMProvider;

export type PluginProviderFactory = (config: Record<string, unknown>) => LLMProvider;

export interface ProviderDescriptor {
	configSchema?: ZodTypeAny;
	configureInteractive?: (ctx: ProviderWizardContext) => Promise<Record<string, unknown>>;
	contextWindows?: Record<string, number>;
	defaultModel: string;
	description?: string;
	envVars?: { apiKey?: string; model?: string };
	helpText?: string;
	label: string;
	modelModes: Array<{ mode: string; model: string }>;
	modelPrefix?: string;
	requiresApiKey: boolean;
}

export interface ProviderWizardContext {
	currentConfig?: Record<string, unknown>;
}
