import * as fs from 'fs';
import * as path from 'path';

import { describe, it } from 'vitest';

const ROOT = path.join(__dirname, '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

function getTypeScriptSources(dir: string): string[] {
	const files: string[] = [];
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
			files.push(...getTypeScriptSources(full));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.includes('.test.') &&
			!entry.name.includes('.spec.')
		) {
			files.push(full);
		}
	}
	return files;
}

function importsFrom(content: string, pattern: RegExp): boolean {
	return pattern.test(content);
}

describe('Plugin package boundaries', () => {
	it('no packages/valora-plugin-* source file imports directly from src/cli/', () => {
		if (!fs.existsSync(PACKAGES_DIR)) return;

		const violations: string[] = [];

		for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory() || !entry.name.startsWith('valora-plugin-')) continue;
			const pluginSrcDir = path.join(PACKAGES_DIR, entry.name, 'src');
			for (const file of getTypeScriptSources(pluginSrcDir)) {
				const content = fs.readFileSync(file, 'utf-8');
				if (importsFrom(content, /from\s+['"]cli\//)) {
					violations.push(path.relative(ROOT, file));
				}
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`Plugin packages must not import from 'cli/' directly. Use PluginAPI instead.\n` +
					`Violations:\n  - ${violations.join('\n  - ')}`
			);
		}
	});

	it('no packages/valora-plugin-* source file imports from plugins/cli-registry', () => {
		if (!fs.existsSync(PACKAGES_DIR)) return;

		const violations: string[] = [];

		for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory() || !entry.name.startsWith('valora-plugin-')) continue;
			const pluginSrcDir = path.join(PACKAGES_DIR, entry.name, 'src');
			for (const file of getTypeScriptSources(pluginSrcDir)) {
				const content = fs.readFileSync(file, 'utf-8');
				if (importsFrom(content, /from\s+['"]plugins\/cli-registry['"]/)) {
					violations.push(path.relative(ROOT, file));
				}
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`Plugin packages must not import from 'plugins/cli-registry' directly. Use PluginAPI.cli instead.\n` +
					`Violations:\n  - ${violations.join('\n  - ')}`
			);
		}
	});

	it('PluginAPI declares a cli surface with addSubcommand', () => {
		const apiTypesPath = path.join(ROOT, 'src/plugins/plugin-api.types.ts');
		const content = fs.readFileSync(apiTypesPath, 'utf-8');
		if (!content.includes('addSubcommand')) {
			throw new Error(
				`PluginAPI in src/plugins/plugin-api.types.ts must declare a 'cli' surface with 'addSubcommand'.\n` +
					`This surface allows plugins to register CLI subcommands via api.cli.addSubcommand(...).`
			);
		}
	});
});
