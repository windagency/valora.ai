export type CompressionStrategy = (output: string, command: string) => string;

export interface PluginAPI {
	compression: {
		registerStrategy(tool: string, fn: CompressionStrategy): void;
	};
	config: {
		extend(schema: unknown): void;
	};
	lifecycle: {
		onActivate(fn: () => Promise<void>): void;
		onDeactivate(fn: () => Promise<void>): void;
	};
	logger: {
		debug(...args: unknown[]): void;
		error(...args: unknown[]): void;
		info(...args: unknown[]): void;
		warn(...args: unknown[]): void;
	};
	providers: {
		register(name: string, providerClass: unknown): void;
	};
}
