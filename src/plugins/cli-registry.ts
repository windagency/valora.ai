export interface CliSubcommandRegistration {
	description: string;
	handler: () => Promise<void> | void;
	name: string;
}

const registry = new Map<string, CliSubcommandRegistration>();

export function clearCliRegistry(): void {
	registry.clear();
}

export function getCliSubcommand(name: string): CliSubcommandRegistration | undefined {
	return registry.get(name);
}

export function registerCliSubcommand(name: string, description: string, handler: () => Promise<void> | void): void {
	registry.set(name, { description, handler, name });
}
