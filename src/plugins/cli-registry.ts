export interface CliSubcommandRegistration {
	description: string;
	handler: () => Promise<void> | void;
	name: string;
}

const registry: CliSubcommandRegistration[] = [];

export function clearCliRegistry(): void {
	registry.length = 0;
}

export function getCliSubcommand(name: string): CliSubcommandRegistration | undefined {
	return registry.find((r) => r.name === name);
}

export function registerCliSubcommand(name: string, description: string, handler: () => Promise<void> | void): void {
	registry.push({ description, handler, name });
}
