/**
 * Updater Module Boundary Tests
 *
 * These tests enforce that `src/updater/` is a private implementation detail
 * of the CLI entry point. No module outside `src/cli/` (or `src/updater/`
 * itself) may import from `src/updater/`.
 */

import { noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

describe('Updater Module Boundaries', () => {
	describe('Updater isolation', () => {
		it('updater does not depend on application layers (services, mcp, executor, session, output)', () => {
			noClasses()
				.that()
				.resideInAPackage('updater..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('services..', 'mcp..', 'executor..', 'session..', 'output..')
				.because('The updater module is a leaf; it must not depend on application layers')
				.check(srcProject.allClasses());
		});

		it('updater production code does not depend on cli/', () => {
			const updaterProductionClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => {
					const path = c.packagePath.get();
					return path.includes('updater') && !c.getSimpleName().includes('.test.');
				});

			updaterProductionClasses.forEach((updaterClass) => {
				const violatingDeps = updaterClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.get();
					if (depPath.includes('node_modules')) return false;
					return depPath.includes('cli');
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.get()).join(', ');
					throw new Error(
						`Updater module "${updaterClass.getSimpleName()}" imports from cli/: ${violations}. ` +
							`The updater package must not create circular dependencies with cli/.`
					);
				}
			});
		});
	});

	describe('Updater leaf constraints', () => {
		it('updater modules do not depend on plugin services', () => {
			noClasses()
				.that()
				.resideInAPackage('updater..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('plugins..')
				.because('The updater module is a leaf; plugin services must be composed in cli/')
				.check(srcProject.allClasses());
		});
	});

	describe('Updater access restriction', () => {
		it('only cli/ modules may import from updater/', () => {
			// Collect all classes that live outside cli/ and outside updater/ itself
			const nonCliNonUpdaterClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => {
					const pkgPath = c.packagePath.get();
					return !pkgPath.includes('cli') && !pkgPath.includes('updater');
				});

			nonCliNonUpdaterClasses.forEach((outsideClass) => {
				const violatingDeps = outsideClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.get();
					// Ignore external node_modules
					if (depPath.includes('node_modules')) return false;
					// Flag any dependency that resolves into the updater package
					return depPath.includes('updater');
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.get()).join(', ');
					throw new Error(
						`Module "${outsideClass.getSimpleName()}" (${outsideClass.packagePath.get()}) imports from updater/: ${violations}. ` +
							`Only cli/ modules are permitted to import from updater/.`
					);
				}
			});
		});
	});
});
