import { getLogger } from 'output/logger';

export interface CliSubcommandRegistration {
	description: string;
	handler: () => Promise<void> | void;
	name: string;
	owner?: string;
}

const registry = new Map<string, CliSubcommandRegistration>();

export function clearCliRegistry(): void {
	registry.clear();
}

export function getCliSubcommand(name: string): CliSubcommandRegistration | undefined {
	return registry.get(name);
}

export function registerCliSubcommand(
	name: string,
	description: string,
	handler: () => Promise<void> | void,
	owner?: string
): void {
	const existing = registry.get(name);
	if (existing && owner && existing.owner && existing.owner !== owner) {
		getLogger().warn(
			`CLI subcommand "${name}" is being overridden by plugin "${owner}" (was registered by "${existing.owner}"). ` +
				`Last-write-wins; declare the conflict in the new plugin's overrides list to silence this warning.`,
			{ incoming: owner, name, previous: existing.owner }
		);
	}
	registry.set(name, { description, handler, name, ...(owner ? { owner } : {}) });
}
