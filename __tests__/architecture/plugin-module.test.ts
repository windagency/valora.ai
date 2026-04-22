/**
 * Architecture tests for the plugin module.
 *
 * Ensures the plugin system respects module boundaries and does not introduce
 * unintended dependencies into the codebase.
 */

import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

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

	it('plugins module should not depend on executor, cli, llm, mcp, or services', () => {
		const forbidden = ['executor', 'cli', 'llm', 'mcp', 'services', 'session'];

		const pluginClasses = srcProject
			.allClasses()
			.get()
			.filter((c) => c.packagePath.toString().startsWith('plugins'));

		pluginClasses.forEach((pluginClass) => {
			const violations = pluginClass.dependencies.filter((dep) => {
				const depPath = dep.typeScriptClass.packagePath.toString();
				if (depPath.includes('node_modules')) return false;
				return forbidden.some((pkg) => depPath.startsWith(pkg));
			});

			if (violations.length > 0) {
				const names = violations.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
				throw new Error(
					`Plugin class ${pluginClass.getSimpleName()} depends on forbidden packages: ${names}. ` +
						`Wiring into executor/cli layers must be done via di/container.ts.`
				);
			}
		});
	});
});
