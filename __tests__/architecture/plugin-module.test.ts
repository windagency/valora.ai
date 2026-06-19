/**
 * Architecture tests for the plugin module.
 *
 * Ensures the plugin system respects module boundaries and does not introduce
 * unintended dependencies into the codebase.
 *
 * Two layers of rules apply:
 *   1. arch-unit-ts class-level rules cover all classes inside src/plugins/.
 *   2. A file-level scan covers function-only modules (which arch-unit-ts skips
 *      because they declare no classes — see plugin-api.factory.ts).
 */

import * as fs from 'fs';
import * as path from 'path';

import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, expect, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

const PLUGINS_DIR = path.resolve(__dirname, '..', '..', 'src', 'plugins');

/**
 * Files inside src/plugins/ that legitimately bridge into other modules and
 * are therefore exempt from the file-level forbidden-import scan. Any new
 * exception requires explicit review — keep this list short.
 */
const BRIDGE_FILES = new Set(['plugin-api.factory.ts', 'conflict-resolver.ts', 'conflict-resolver-config.ts']);

const FORBIDDEN_FOR_NON_BRIDGE = ['executor/', 'cli/', 'llm/', 'mcp/', 'services/', 'session/', 'di/'];

function listPluginSources(): string[] {
	return fs
		.readdirSync(PLUGINS_DIR, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
		.map((e) => e.name);
}

function fileImportsForbiddenModule(filePath: string): null | string {
	const content = fs.readFileSync(filePath, 'utf-8');
	const importLines = content.split('\n').filter((line) => /^\s*import\s/.test(line) || /^\s*from\s/.test(line));
	for (const line of importLines) {
		// Pure `import type { … }` lines do not create a runtime dependency and are exempt.
		if (/^\s*import\s+type\s/.test(line)) continue;
		for (const prefix of FORBIDDEN_FOR_NON_BRIDGE) {
			const match = line.match(new RegExp(`from\\s+['"]${prefix}`));
			if (match) return `${prefix} (line: ${line.trim()})`;
		}
	}
	return null;
}

describe('Plugin Module Boundaries', () => {
	it('plugins module should only depend on infrastructure layers', () => {
		const allowedPackages = ['plugins', 'types', 'config', 'utils', 'output'];

		const pluginClasses = srcProject
			.allClasses()
			.get()
			.filter((c) => c.packagePath.toString().startsWith('plugins'));

		pluginClasses.forEach((pluginClass) => {
			const violatingDeps = pluginClass.dependencies.filter((dep) => {
				const depPath = dep.typeScriptClass.packagePath.toString();
				if (depPath.includes('node_modules')) return false;
				return !allowedPackages.some((pkg) => depPath.startsWith(pkg));
			});

			if (violatingDeps.length > 0) {
				const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
				throw new Error(
					`Plugin class ${pluginClass.getSimpleName()} has disallowed dependencies: ${violations}. ` +
						`Plugin module may only use types, config, utils, and output layers.`
				);
			}
		});
	});

	it('non-bridge plugin files must not import from executor, cli, llm, mcp, services, session, or di', () => {
		const violations: string[] = [];
		for (const fileName of listPluginSources()) {
			if (BRIDGE_FILES.has(fileName)) continue;
			const violation = fileImportsForbiddenModule(path.join(PLUGINS_DIR, fileName));
			if (violation) {
				violations.push(`  - src/plugins/${fileName} imports forbidden module: ${violation}`);
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`Non-bridge files in src/plugins/ may not import from executor/cli/llm/mcp/services/session/di.\n` +
					`Bridge files (allowlist: ${[...BRIDGE_FILES].join(', ')}) are the integration points.\n\n` +
					violations.join('\n')
			);
		}
	});

	it('bridge files exist on disk and the allowlist does not have stale entries', () => {
		const present = new Set(listPluginSources());
		for (const bridge of BRIDGE_FILES) {
			expect(present.has(bridge), `BRIDGE_FILES allowlist references missing file: ${bridge}`).toBe(true);
		}
	});
});
