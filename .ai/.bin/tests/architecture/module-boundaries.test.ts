/**
 * Module Boundaries Architecture Tests
 *
 * These tests enforce proper module boundaries and prevent
 * tight coupling between different parts of the system.
 */

import { classes, noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

describe('Module Boundaries', () => {
	describe('LLM Module Boundaries', () => {
		it('LLM providers should only be accessed through registry', () => {
			// Manual check to exclude node_modules dependencies
			const classesOutsideLlm = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						!c.packagePath.toString().startsWith('llm') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			classesOutsideLlm.forEach((outsideClass) => {
				const violatingDeps = outsideClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on llm.providers
					return depPath.startsWith('llm.providers');
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(
						`Class ${outsideClass.getSimpleName()} outside LLM module depends on providers: ${violations}. LLM providers should only be accessed through the registry pattern.`
					);
				}
			});
		});

		it('LLM module should have clear public API', () => {
			noClasses()
				.that()
				.resideInAPackage('llm..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'services..')
				.because('LLM module should be independent and reusable')
				.check(srcProject.allClasses());
		});
	});

	describe('Service Module Boundaries', () => {
		it('services should have minimal dependencies', () => {
			// Manual check to exclude node_modules dependencies
			const serviceClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().startsWith('services'));

			const allowedPackages = ['services', 'types', 'utils', 'output'];

			serviceClasses.forEach((serviceClass) => {
				const violatingDeps = serviceClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on disallowed internal package
					return !allowedPackages.some((pkg) => depPath.startsWith(pkg));
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(`Service class ${serviceClass.getSimpleName()} has disallowed dependencies: ${violations}`);
				}
			});
		});
	});

	describe('Configuration Module Boundaries', () => {
		it('config module should be foundational with no business logic dependencies', () => {
			noClasses()
				.that()
				.resideInAPackage('config..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('services..', 'executor..', 'session..', 'llm..', 'cli..', 'mcp..')
				.because('Configuration is a foundational layer')
				.check(srcProject.allClasses());
		});
	});

	describe('Executor Module Boundaries', () => {
		it('executor should be orchestration layer between services and presentation', () => {
			classes()
				.that()
				.resideInAPackage('executor..')
				.should()
				.onlyDependOnClassesThat()
				.resideInAnyPackage(
					'executor..',
					'types..',
					'config..',
					'utils..',
					'output..',
					'services..',
					'session..',
					'exploration..',
					'cleanup..',
					'cli..',
					'ui..'
				)
				.orShould()
				.because(
					'Executor orchestrates workflow and can use limited CLI utilities, UI adapters for prompting, and logging'
				)
				.check(srcProject.allClasses());
		});
	});

	describe('Session Module Boundaries', () => {
		it('session management should be isolated from presentation layers', () => {
			noClasses()
				.that()
				.resideInAPackage('session..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'ui..')
				.because('Session management is domain logic')
				.check(srcProject.allClasses());
		});
	});

	describe('Utils Module Boundaries', () => {
		it('utils should be generic and not depend on business logic', () => {
			noClasses()
				.that()
				.resideInAPackage('utils..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('services..', 'executor..', 'session..', 'llm..', 'cli..', 'mcp..')
				.because('Utility functions should be generic and reusable')
				.check(srcProject.allClasses());
		});
	});

	describe('MCP Module Boundaries', () => {
		it('MCP module should only interact with executor layer', () => {
			// Manual check to exclude node_modules dependencies
			const mcpClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().startsWith('mcp'));

			const allowedPackages = ['mcp', 'types', 'executor', 'utils', 'output', 'config', 'di', 'cli'];

			mcpClasses.forEach((mcpClass) => {
				const violatingDeps = mcpClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on disallowed internal package
					return !allowedPackages.some((pkg) => depPath.startsWith(pkg));
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(`MCP class ${mcpClass.getSimpleName()} has disallowed dependencies: ${violations}`);
				}
			});
		});
	});

	describe('CLI Module Boundaries', () => {
		it('CLI module should only interact through executor and DI container', () => {
			// Manual check to exclude node_modules dependencies
			const cliClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().startsWith('cli'));

			const allowedPackages = [
				'cli',
				'types',
				'executor',
				'utils',
				'output',
				'config',
				'di',
				'session',
				'llm',
				'exploration',
				'services',
				'ui'
			];

			cliClasses.forEach((cliClass) => {
				const violatingDeps = cliClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on disallowed internal package
					return !allowedPackages.some((pkg) => depPath.startsWith(pkg));
				});

				if (violatingDeps.length > 0) {
					const violations = violatingDeps.map((d) => d.typeScriptClass.packagePath.toString()).join(', ');
					throw new Error(`CLI class ${cliClass.getSimpleName()} has disallowed dependencies: ${violations}`);
				}
			});
		});
	});
});
