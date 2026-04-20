import type { ZodTypeAny } from 'zod';

import type { CompressionStrategy } from 'executor/output-compression.service';
import type { Logger } from 'output/logger';
import type { LLMProvider } from 'types/llm.types';

export type { CompressionStrategy };

export interface CodePluginModule {
	register(api: PluginAPI): Promise<void> | void;
}

export interface PluginAPI {
	compression: {
		registerStrategy(tool: string, fn: CompressionStrategy): void;
	};
	config: {
		extend(schema: ZodTypeAny): void;
	};
	lifecycle: PluginLifecycleHooks;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	providers: {
		register(name: string, providerClass: PluginProviderClass): void;
	};
}

export interface PluginLifecycleHooks {
	onActivate: (fn: () => Promise<void>) => void;
	onDeactivate: (fn: () => Promise<void>) => void;
}

export type PluginProviderClass = new (config: Record<string, unknown>) => LLMProvider;
