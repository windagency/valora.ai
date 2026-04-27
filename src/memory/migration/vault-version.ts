import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export const VAULT_SCHEMA_VERSION = 1;

const VERSION_FILENAME = 'version';

export function readVaultVersion(vaultDir: string): null | number {
	try {
		const raw = readFileSync(path.join(vaultDir, VERSION_FILENAME), 'utf-8').trim();
		const n = parseInt(raw, 10);
		return isNaN(n) ? null : n;
	} catch {
		return null;
	}
}

export function writeVaultVersion(vaultDir: string, version: number = VAULT_SCHEMA_VERSION): void {
	mkdirSync(vaultDir, { recursive: true });
	writeFileSync(path.join(vaultDir, VERSION_FILENAME), String(version), 'utf-8');
}
