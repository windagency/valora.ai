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

const DATA_PLUGINS_DIR = path.join(ROOT, 'data', 'plugins');

const PERMISSION_REQUIRED_FOR: Record<string, string> = {
	code: 'code-exec',
	hooks: 'shell-hooks',
	mcps: 'mcp-connect'
};

function findPluginManifests(): string[] {
	const manifests: string[] = [];

	if (fs.existsSync(PACKAGES_DIR)) {
		for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory() || !entry.name.startsWith('valora-plugin-')) continue;
			const manifestPath = path.join(PACKAGES_DIR, entry.name, 'valora-plugin.json');
			if (fs.existsSync(manifestPath)) manifests.push(manifestPath);
		}
	}

	if (fs.existsSync(DATA_PLUGINS_DIR)) {
		for (const entry of fs.readdirSync(DATA_PLUGINS_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const manifestPath = path.join(DATA_PLUGINS_DIR, entry.name, 'valora-plugin.json');
			if (fs.existsSync(manifestPath)) manifests.push(manifestPath);
		}
	}

	return manifests;
}

describe('Plugin manifest contributes ↔ permissions contract', () => {
	it('every plugin with a gated contribute declares the required permission', () => {
		const violations: string[] = [];

		for (const manifestPath of findPluginManifests()) {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
				contributes?: string[];
				name?: string;
				permissions?: string[];
			};

			const contributes = manifest.contributes ?? [];
			const permissions = manifest.permissions ?? [];
			const name = manifest.name ?? path.relative(ROOT, manifestPath);

			for (const [contrib, requiredPerm] of Object.entries(PERMISSION_REQUIRED_FOR)) {
				if (contributes.includes(contrib) && !permissions.includes(requiredPerm)) {
					violations.push(`"${name}" contributes '${contrib}' but is missing the '${requiredPerm}' permission`);
				}
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`Plugin manifests have mismatched contributes/permissions:\n  - ${violations.join('\n  - ')}\n\n` +
					`Each 'code' contribution requires 'code-exec', 'hooks' requires 'shell-hooks', 'mcps' requires 'mcp-connect'.`
			);
		}
	});
});

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
