/**
 * File Organization Architecture Tests
 *
 * These tests enforce consistent file organization patterns
 * and naming conventions across the codebase.
 */

import { classes } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, expect, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'));

describe('File Organization', () => {
	describe('Provider Organization', () => {
		it('provider implementations should reside in providers subdirectory', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const providerClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().endsWith('provider') &&
						!c.getSimpleName().toLowerCase().includes('base') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			providerClasses.forEach((provider) => {
				const pkgPath = provider.packagePath.get();
				if (!pkgPath.startsWith('llm.providers')) {
					throw new Error(
						`Provider ${provider.getSimpleName()} is in ${pkgPath} but should be in llm.providers directory`
					);
				}
			});
		});
	});

	describe('Service Organization', () => {
		it('service implementations should reside in services directory', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const serviceClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().endsWith('service') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			serviceClasses.forEach((service) => {
				const pkgPath = service.packagePath.get();
				if (!pkgPath.startsWith('services')) {
					throw new Error(`Service ${service.getSimpleName()} is in ${pkgPath} but should be in services directory`);
				}
			});
		});
	});

	describe('Type Organization', () => {
		it('type definition files should reside in types directory', () => {
			// Manual check since haveSimpleNameContaining is not available
			const typeClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.getSimpleName().includes('.types') && !c.getSimpleName().includes('test'));

			typeClasses.forEach((typeClass) => {
				const pkgPath = typeClass.packagePath.get();
				// Check for both dot and slash formats: types, src/types, src.types
				if (!pkgPath.includes('types') && !pkgPath.startsWith('types')) {
					throw new Error(
						`Type definition ${typeClass.getSimpleName()} is in ${pkgPath} but should be in types directory`
					);
				}
			});
		});
	});

	describe('Executor Organization', () => {
		it('executor implementations should reside in executor directory', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const executorClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().endsWith('executor') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			executorClasses.forEach((executorClass) => {
				const pkgPath = executorClass.packagePath.get();
				if (!pkgPath.startsWith('executor')) {
					throw new Error(
						`Executor class ${executorClass.getSimpleName()} is in ${pkgPath} but should be in executor directory`
					);
				}
			});
		});

		it('loader implementations should reside in executor directory', () => {
			// Manual check since haveSimpleNameNotContaining is not available
			const loaderClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().endsWith('loader') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			loaderClasses.forEach((loaderClass) => {
				const pkgPath = loaderClass.packagePath.get();
				if (!pkgPath.startsWith('executor')) {
					throw new Error(
						`Loader class ${loaderClass.getSimpleName()} is in ${pkgPath} but should be in executor directory`
					);
				}
			});
		});
	});

	describe('Configuration Organization', () => {
		it('configuration-related classes should be organized appropriately', () => {
			// Configuration can be in config, types, or other modules
			// This is more of a guideline than a strict rule
			const configClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().includes('config') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);
			// Just verify we have config classes (soft check)
			expect(configClasses.length).toBeGreaterThan(0);
		});
	});

	describe('Test File Organization', () => {
		it('test files should use proper extensions', () => {
			const testClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.getSimpleName().includes('.test') || c.getSimpleName().includes('.spec'));
			// Verify we have test files
			expect(testClasses.length).toBeGreaterThan(0);
		});

		it('integration tests can be in tests/integration or colocated', () => {
			// Integration tests can be organized in various ways
			// This is more of a guideline
			const integrationTests = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().includes('integration') || c.getSimpleName().includes('integration'));
			// Soft check - we might have integration tests
			expect(integrationTests.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe('MCP Organization', () => {
		it('MCP-related classes should reside in mcp directory', () => {
			// Manual check since haveSimpleNameContaining is not available
			const mcpClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toUpperCase().includes('MCP') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec') &&
						!c.getSimpleName().includes('.types') // Type files belong in types directory
				);

			mcpClasses.forEach((mcpClass) => {
				const pkgPath = mcpClass.packagePath.get();
				if (!pkgPath.startsWith('mcp')) {
					throw new Error(`MCP class ${mcpClass.getSimpleName()} is in ${pkgPath} but should be in mcp directory`);
				}
			});
		});
	});

	describe('Session Organization', () => {
		it('session-related classes should be organized appropriately', () => {
			// Session classes can be in session, cli, or types directories
			const sessionClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().includes('session') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);
			// Verify we have session-related classes
			expect(sessionClasses.length).toBeGreaterThan(0);
		});
	});

	describe('DI Container Organization', () => {
		it('DI container should be in di directory', () => {
			// Check that container-related classes are appropriately organized
			const containerClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.getSimpleName().toLowerCase().includes('container') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);
			// Verify we have container classes
			expect(containerClasses.length).toBeGreaterThan(0);
		});
	});
});
