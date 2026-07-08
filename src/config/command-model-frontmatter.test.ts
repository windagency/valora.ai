/**
 * Guards that every command's frontmatter `model:` is a model the registry knows
 * about. This would have caught commands drifting to stale/removed model ids.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { getAllModels } from './providers.config';

import '../llm/providers'; // populate the runtime registry (not required for getAllModels, but keeps parity)

function findCommandFiles(root: string): string[] {
	const out: string[] = [];
	const packagesDir = join(root, 'packages');
	let pkgs: string[];
	try {
		pkgs = readdirSync(packagesDir);
	} catch {
		return out;
	}
	for (const pkg of pkgs) {
		const commandsDir = join(packagesDir, pkg, 'commands');
		let entries: string[];
		try {
			entries = readdirSync(commandsDir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(commandsDir, entry);
			if (entry.endsWith('.md') && !entry.startsWith('_') && statSync(full).isFile()) {
				out.push(full);
			}
		}
	}
	return out;
}

function frontmatterModel(content: string): string | undefined {
	const match = content.match(/^model:\s*(\S+)\s*$/m);
	return match?.[1];
}

describe('command frontmatter models', () => {
	const files = findCommandFiles(process.cwd());
	const knownModels = new Set(getAllModels());

	it('finds command definition files', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it('every command references a model known to the registry', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const model = frontmatterModel(readFileSync(file, 'utf-8'));
			if (model && !knownModels.has(model)) {
				offenders.push(`${file}: ${model}`);
			}
		}
		expect(offenders, `Unknown models in command frontmatter:\n${offenders.join('\n')}`).toEqual([]);
	});
});
