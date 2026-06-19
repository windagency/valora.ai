import path from 'node:path';

import { getLogger } from 'output/logger';
import { getGlobalConfigDir } from 'utils/paths';

interface ConflictResolutions {
	[providerKey: string]: string;
}

let cachedResolutions: ConflictResolutions | null = null;

export function getResolvedConflict(key: string): string | undefined {
	return cachedResolutions?.[key];
}

export async function preloadConflictResolutions(): Promise<void> {
	await loadResolutions();
}

export async function saveResolvedConflict(key: string, winner: string): Promise<void> {
	const resolutions = await loadResolutions();
	resolutions[key] = winner;
	cachedResolutions = resolutions;

	const filePath = getResolutionsFilePath();
	try {
		const { mkdir, writeFile } = await import('node:fs/promises');
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, JSON.stringify(resolutions, null, 2), 'utf8');
	} catch (err) {
		getLogger().warn('Failed to persist plugin conflict resolution', { key, winner });
	}
}

function getResolutionsFilePath(): string {
	return path.join(getGlobalConfigDir(), 'plugin-conflict-resolutions.json');
}

async function loadResolutions(): Promise<ConflictResolutions> {
	if (cachedResolutions !== null) return cachedResolutions;

	const filePath = getResolutionsFilePath();
	try {
		const { readFile } = await import('node:fs/promises');
		const raw = await readFile(filePath, 'utf8');
		cachedResolutions = JSON.parse(raw) as ConflictResolutions;
	} catch {
		cachedResolutions = {};
	}

	return cachedResolutions;
}
