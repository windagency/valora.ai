import type { DeterministicValidator } from './types';

const registry = new Map<string, DeterministicValidator>();

export function getValidator(stageName: string): DeterministicValidator | undefined {
	if (registry.has(stageName)) return registry.get(stageName);
	for (const [pattern, validator] of registry) {
		if (stageName.includes(pattern) || pattern.includes(stageName)) {
			return validator;
		}
	}
	return undefined;
}

export function hasValidator(stageName: string): boolean {
	return getValidator(stageName) !== undefined;
}

export function registerValidator(stagePattern: string, validator: DeterministicValidator): void {
	registry.set(stagePattern, validator);
}

/** Reset the registry — for use in tests only. */
export function resetRegistry(): void {
	registry.clear();
}
