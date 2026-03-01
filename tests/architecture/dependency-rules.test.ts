/**
 * Dependency Rules Architecture Tests
 *
 * These tests enforce strict dependency rules to maintain
 * a clean architecture with proper separation of concerns.
 */

import { classes, noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

describe('Dependency Rules', () => {
	describe('Acyclic Dependencies Principle', () => {
		it('types should not have circular dependencies', () => {
			noClasses()
				.that()
				.resideInAPackage('types..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage(
					'cli..',
					'services..',
					'executor..',
					'session..',
					'mcp..',
					'di..',
					'llm..',
					'config..',
					'output..',
					'utils..',
					'ui..',
					'exploration..',
					'cleanup..'
				)
				.because('Types must be leaf nodes in the dependency graph to prevent circular dependencies')
				.check(srcProject.allClasses());
		});

		it('utils should not depend on application layers', () => {
			noClasses()
				.that()
				.resideInAPackage('utils..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'services..', 'executor..', 'session..', 'mcp..', 'llm..')
				.because('Utility modules should be reusable across the application')
				.check(srcProject.allClasses());
		});
	});

	describe('Interface Segregation', () => {
		it('providers should only depend on provider interface', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const providerClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.packagePath.toString().startsWith('llm.providers') &&
						c.getSimpleName().toLowerCase().endsWith('provider') &&
						!c.getSimpleName().toLowerCase().includes('base') &&
						!c.getSimpleName().includes('test')
				);

			const allowedPackages = ['llm', 'types', 'config'];

			providerClasses.forEach((provider) => {
				const violatingDeps = provider.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on disallowed package
					return !allowedPackages.some((pkg) => depPath.startsWith(pkg));
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(
						`Provider ${provider.getSimpleName()} has disallowed dependencies: ${violations}. Providers should only depend on interfaces and types.`
					);
				}
			});
		});
	});

	describe('External Dependencies', () => {
		it('business logic should minimize external presentation dependencies', () => {
			// Business logic should avoid presentation-specific libraries
			// but this is hard to enforce strictly with arch-unit-ts
			// We'll do a soft check
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'session..', 'llm..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'ui..')
				.because('Business logic should not be coupled to presentation layers')
				.check(srcProject.allClasses());
		});
	});

	describe('Dependency Direction', () => {
		it('lower layers should not depend on higher layers', () => {
			// Infrastructure (utils, config) should not depend on domain (services, session)
			noClasses()
				.that()
				.resideInAnyPackage('utils..', 'config..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('services..', 'session..', 'executor..')
				.because('Infrastructure should not depend on domain logic')
				.check(srcProject.allClasses());
		});

		it('domain should minimize dependencies on presentation', () => {
			// Services and session should not depend on presentation
			// Executor can have limited CLI dependencies for utilities
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'session..', 'llm..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'ui..')
				.because('Core domain logic should be independent of presentation')
				.check(srcProject.allClasses());
		});

		it('presentation layers can depend on domain through proper channels', () => {
			// CLI and MCP can depend on various layers including services
			// This is acceptable as they are the presentation layer
			// Manual check to exclude node_modules dependencies
			const presentationClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => {
					const pkgPath = c.packagePath.get();
					return pkgPath.includes('cli') || pkgPath.includes('mcp');
				});

			const allowedPackages = [
				'cli',
				'mcp',
				'types',
				'executor',
				'utils',
				'output',
				'config',
				'di',
				'session',
				'services',
				'llm',
				'exploration',
				'ui'
			];

			presentationClasses.forEach((presClass) => {
				const violatingDeps = presClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.get();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on disallowed internal package
					// Use includes() to handle both 'executor' and 'src/executor' formats
					return !allowedPackages.some((pkg) => depPath.includes(pkg));
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.get()).join(', ');
					throw new Error(
						`Presentation class ${presClass.getSimpleName()} has disallowed dependencies: ${violations}. Presentation layers should coordinate through proper channels.`
					);
				}
			});
		});
	});

	describe('Registry Pattern Compliance', () => {
		it('LLM registry should be the only entry point to providers', () => {
			// Manual check since haveSimpleNameContaining is not available
			// Only check LLM/provider-related registries, not all registries (e.g., tool-registry is valid in mcp)
			const registryClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => {
					const name = c.getSimpleName().toLowerCase();
					return (
						name.includes('registry') &&
						(name.includes('llm') || name.includes('provider') || c.packagePath.get().includes('llm'))
					);
				});

			registryClasses.forEach((registry) => {
				const pkgPath = registry.packagePath.get();
				// Check for both dot and slash formats: llm, src/llm, src.llm
				if (!pkgPath.includes('llm')) {
					throw new Error(
						`Registry ${registry.getSimpleName()} is in ${pkgPath} but should be in llm directory for centralized provider access`
					);
				}
			});

			// Verify we have at least one registry in llm
			const llmRegistries = registryClasses.filter((c) => c.packagePath.get().includes('llm'));
			expect(llmRegistries.length).toBeGreaterThan(0);
		});
	});

	describe('Test Dependencies', () => {
		it('production code should not depend on test utilities', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const productionClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.packagePath.toString().startsWith('src') &&
						!c.getSimpleName().includes('test') &&
						!c.getSimpleName().includes('spec')
				);

			productionClasses.forEach((prodClass) => {
				const violatingDeps = prodClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on tests
					return depPath.startsWith('tests');
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(
						`Production class ${prodClass.getSimpleName()} depends on test code: ${violations}. Production code should not depend on test code.`
					);
				}
			});
		});
	});

	describe('DI Container Dependencies', () => {
		it('services should not directly depend on DI container', () => {
			// This is a guideline - services should receive dependencies through constructor
			// The DI container handles instantiation
			// Manual check to exclude node_modules dependencies
			const serviceClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().startsWith('services'));

			serviceClasses.forEach((serviceClass) => {
				const violatingDeps = serviceClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on di
					return depPath.startsWith('di');
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(
						`Service class ${serviceClass.getSimpleName()} depends on DI container: ${violations}. Services should receive dependencies, not resolve them.`
					);
				}
			});
		});

		it('only presentation layers should access DI container', () => {
			// Only entry points (CLI, MCP) and the container itself should use it
			// Manual check to exclude node_modules dependencies
			const allClasses = srcProject.allClasses().get();
			const allowedPackages = ['cli', 'mcp', 'di'];

			allClasses.forEach((clazz) => {
				const hasDiDependency = clazz.dependencies.some((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on di
					return depPath.startsWith('di');
				});

				if (hasDiDependency) {
					const pkgPath = clazz.packagePath.get();
					const isAllowed = allowedPackages.some((pkg) => pkgPath.startsWith(pkg));

					if (!isAllowed) {
						throw new Error(
							`Class ${clazz.getSimpleName()} in ${pkgPath} depends on DI container but is not in an allowed package. Only entry points (cli, mcp) should interact with DI container.`
						);
					}
				}
			});
		});
	});

	describe('Output Layer Dependencies', () => {
		it('types should not depend on output layer', () => {
			// Output (logging) is a cross-cutting concern
			// It's acceptable for various layers to use logging
			// But types should remain independent
			noClasses()
				.that()
				.resideInAPackage('types..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('output..')
				.because('Type definitions must remain independent')
				.check(srcProject.allClasses());
		});
	});
});
