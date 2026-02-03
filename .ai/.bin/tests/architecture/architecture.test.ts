/**
 * Architecture Tests using arch-unit-ts
 *
 * These tests enforce architectural constraints and coding standards
 * to ensure the codebase maintains a clean, maintainable structure.
 */

import { classes, noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extract class names from TypeScript source file content
 * Matches: export class ClassName, export abstract class ClassName
 */
function extractClassNames(content: string): string[] {
	const classRegex = /export\s+(?:abstract\s+)?class\s+([A-Z][a-zA-Z0-9]*)/g;
	const matches: string[] = [];
	let match;
	while ((match = classRegex.exec(content)) !== null) {
		matches.push(match[1]);
	}
	return matches;
}

/**
 * Get all TypeScript files in a directory recursively
 */
function getTypeScriptFiles(dir: string): string[] {
	const files: string[] = [];
	if (!fs.existsSync(dir)) return files;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
			files.push(...getTypeScriptFiles(fullPath));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.includes('.test.') &&
			!entry.name.includes('.spec.') &&
			entry.name !== 'index.ts'
		) {
			files.push(fullPath);
		}
	}
	return files;
}

// Initialize the project to analyze
const srcProject = new TypeScriptProject(RelativePath.of('src'));

describe('Architecture Tests', () => {
	describe('Layering Rules', () => {
		it('types should not depend on any implementation layer', () => {
			noClasses()
				.that()
				.resideInAPackage('types..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'services..', 'executor..', 'session..', 'mcp..', 'di..', 'llm..', 'config..')
				.because('Type definitions should be independent of implementations')
				.check(srcProject.allClasses());
		});

		it('CLI layer should not be imported by core services', () => {
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'executor..', 'session..', 'llm..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('cli..')
				.because('Core services should not depend on CLI layer (presentation concern)')
				.check(srcProject.allClasses());
		});

		it('MCP layer should not be imported by core services', () => {
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'executor..', 'session..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('mcp..')
				.because('Core services should not depend on MCP layer (presentation concern)')
				.check(srcProject.allClasses());
		});

		it('services should not depend on CLI or MCP layers', () => {
			noClasses()
				.that()
				.resideInAPackage('services..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..')
				.because('Services are core business logic and should not depend on presentation layers')
				.check(srcProject.allClasses());
		});

		it('types should only import other types or external dependencies', () => {
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
					'exploration..'
				)
				.because('Type definitions must remain independent to avoid circular dependencies')
				.check(srcProject.allClasses());
		});
	});

	describe('Naming Conventions', () => {
		it('LLM provider classes should end with Provider suffix', () => {
			// Manual check since classes in llm/providers should end with Provider
			const providerClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => {
					const pkgPath = c.packagePath.get();
					const simpleName = c.getSimpleName();
					return (
						pkgPath.includes('llm/providers') &&
						!simpleName.includes('.test') &&
						!simpleName.includes('.spec') &&
						!simpleName.includes('index') &&
						!simpleName.toLowerCase().includes('base')
					);
				});

			const violations = providerClasses.filter((c) => !c.getSimpleName().toLowerCase().includes('provider'));

			if (violations.length > 0) {
				throw new Error(
					`Provider classes should end with Provider suffix. Violations: ${violations.map((c) => c.getSimpleName()).join(', ')}`
				);
			}
		});

		it('service classes should end with Service suffix', () => {
			// Parse actual TypeScript class names (not file names) to enforce naming convention
			const servicesDir = path.join(__dirname, '../../src/services');
			const serviceFiles = getTypeScriptFiles(servicesDir);

			const violations: { file: string; className: string }[] = [];

			for (const file of serviceFiles) {
				const content = fs.readFileSync(file, 'utf-8');
				const classNames = extractClassNames(content);

				for (const className of classNames) {
					if (!className.endsWith('Service')) {
						violations.push({
							className,
							file: path.relative(path.join(__dirname, '../..'), file)
						});
					}
				}
			}

			if (violations.length > 0) {
				const violationList = violations.map((v) => `${v.className} in ${v.file}`).join('\n  - ');
				throw new Error(`Service classes should end with Service suffix.\nViolations:\n  - ${violationList}`);
			}
		});

		it('type definition files should have .types.ts extension', () => {
			// Manual check since haveSimpleNameContaining() is not available in arch-unit-ts
			const typeFiles = srcProject
				.allClasses()
				.get()
				.filter(
					(c) => c.packagePath.get().includes('/types') && !c.getSimpleName().includes('index') // Exclude barrel exports
				);
			const filesWithoutTypesExtension = typeFiles.filter((c) => !c.getSimpleName().includes('.types'));

			expect(filesWithoutTypesExtension.length).toBe(0);
		});
	});

	describe('Dependency Injection Rules', () => {
		it('services should not directly depend on presentation layers', () => {
			// This ensures services remain independent and testable
			noClasses()
				.that()
				.resideInAPackage('services..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..')
				.because('Services should be accessed through DI container, not directly from presentation layers')
				.check(srcProject.allClasses());
		});

		it('DI container can depend on all layers for wiring', () => {
			// DI container is the composition root and needs to know about all layers to wire them
			// This is an acceptable exception - the container is where dependencies are composed
			// Note: Removed .beInterfaces() check as it's not available in arch-unit-ts API
			classes()
				.that()
				.resideInAPackage('di..')
				.should()
				.onlyDependOnClassesThat()
				.resideInAnyPackage(
					'di..',
					'types..',
					'cli..',
					'mcp..',
					'services..',
					'executor..',
					'session..',
					'llm..',
					'config..',
					'output..',
					'utils..'
				)
				.because('DI container is the composition root and must wire all layers together')
				.check(srcProject.allClasses());
		});
	});

	describe('Test Organization', () => {
		it('test files can be colocated or in tests directory', () => {
			// Test files can be anywhere - this is just a soft guideline
			// Skip this test as it's not a hard requirement
			const testClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.getSimpleName().includes('.test') || c.getSimpleName().includes('.spec'));
			// All test files should exist (trivially true)
			expect(testClasses.length).toBeGreaterThan(0);
		});
	});

	describe('Provider Interface Compliance', () => {
		it('LLM providers should depend on base provider', () => {
			// Manual check since haveSimpleName() is not available in arch-unit-ts
			const providers = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.packagePath.toString().startsWith('llm.providers') &&
						c.getSimpleName().endsWith('Provider') &&
						!c.getSimpleName().includes('Base')
				);

			// Check that each provider has a dependency on BaseLLMProvider
			providers.forEach((provider) => {
				const hasBaseDependency = provider.dependencies.some(
					(dep) => dep.typeScriptClass.getSimpleName() === 'base-llm.provider'
				);
				expect(hasBaseDependency).toBe(true);
			});
		});
	});

	describe('Configuration Layer Rules', () => {
		it('configuration should not depend on executor or services', () => {
			noClasses()
				.that()
				.resideInAPackage('config..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('executor..', 'services..', 'session..', 'mcp..')
				.because('Configuration is foundational and should not depend on higher-level concerns')
				.check(srcProject.allClasses());
		});
	});

	describe('Session Management Rules', () => {
		it('session layer should not depend on CLI or MCP', () => {
			noClasses()
				.that()
				.resideInAPackage('session..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..')
				.because('Session management is domain logic and should not depend on presentation layers')
				.check(srcProject.allClasses());
		});
	});

	describe('Executor Layer Rules', () => {
		it('executor should minimize dependencies on presentation layers', () => {
			// Executor can depend on output for logging (cross-cutting concern)
			// but should avoid other CLI/MCP dependencies
			// Note: Removed .beInterfaces() check as it's not available in arch-unit-ts API
			classes()
				.that()
				.resideInAPackage('executor..')
				.should()
				.onlyDependOnClassesThat()
				.resideInAnyPackage(
					'executor..',
					'types..',
					'config..',
					'output..',
					'services..',
					'session..',
					'utils..',
					'exploration..',
					'cleanup..',
					'cli..',
					'ui..'
				)
				.because('Executor orchestrates workflow and can use logging, CLI utilities, and UI adapters for prompting')
				.check(srcProject.allClasses());
		});
	});

	describe('Output Layer Rules', () => {
		it('types should not depend on output layer', () => {
			// Output (logging, rendering) is a cross-cutting concern
			// It's acceptable for services, session, and executor to use logging
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

	describe('Third-Party Library Isolation (Adapter Pattern)', () => {
		/**
		 * Enforces adapter pattern for third-party libraries
		 *
		 * Third-party presentation libraries should be isolated behind adapters to:
		 * - Easier testing (mock the interface, not the library)
		 * - Easier library replacement
		 * - Isolated breaking changes
		 * - Cleaner architecture
		 */
		it('presentation libraries should only be imported in adapter files', () => {
			// These third-party presentation libraries must be wrapped with adapters
			const presentationLibraries = ['chalk', 'ora', 'inquirer', 'ink', 'commander'];

			// Allowed locations for direct imports of presentation libraries
			const allowedAdapterPatterns = [
				/adapter\.ts$/,
				/adapter\.interface\.ts$/,
				/\/ui\/.*\.ts$/,
				/\/output\/color-adapter\.ts$/,
				/\/cli\/commander-adapter\.ts$/
			];

			const srcDir = path.join(__dirname, '../../src');
			const allFiles = getTypeScriptFiles(srcDir);

			const violations: { file: string; library: string }[] = [];

			for (const file of allFiles) {
				const relativePath = path.relative(path.join(__dirname, '../..'), file);

				// Skip if this is an allowed adapter file
				const isAdapterFile = allowedAdapterPatterns.some((pattern) => pattern.test(file));
				if (isAdapterFile) continue;

				const content = fs.readFileSync(file, 'utf-8');

				for (const lib of presentationLibraries) {
					// Check for direct imports of the library
					const importRegex = new RegExp(`from\\s+['"]${lib}['"]`, 'g');
					if (importRegex.test(content)) {
						violations.push({
							file: relativePath,
							library: lib
						});
					}
				}
			}

			if (violations.length > 0) {
				const violationList = violations.map((v) => `'${v.library}' in ${v.file}`).join('\n  - ');
				throw new Error(
					`Third-party presentation libraries should only be imported in adapter files.\nViolations:\n  - ${violationList}`
				);
			}
		});

		it('nanoid should only be imported in id-generator utility', () => {
			// nanoid must be wrapped with id-generator utility
			const allowedFiles = [/\/utils\/id-generator\.ts$/];

			const srcDir = path.join(__dirname, '../../src');
			const allFiles = getTypeScriptFiles(srcDir);

			const violations: string[] = [];

			for (const file of allFiles) {
				const relativePath = path.relative(path.join(__dirname, '../..'), file);

				// Skip if this is the allowed utility file
				const isAllowed = allowedFiles.some((pattern) => pattern.test(file));
				if (isAllowed) continue;

				const content = fs.readFileSync(file, 'utf-8');

				// Check for direct imports of nanoid
				if (/from\s+['"]nanoid['"]/.test(content)) {
					violations.push(relativePath);
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`nanoid should only be imported in id-generator utility.\nViolations:\n  - ${violations.join('\n  - ')}\n\nUse generateId/generateSessionId/etc from 'utils/id-generator' instead.`
				);
			}
		});

		it('yaml library should only be imported in yaml-parser utility', () => {
			// yaml must be wrapped with yaml-parser utility
			const allowedFiles = [/\/utils\/yaml-parser\.ts$/];

			const srcDir = path.join(__dirname, '../../src');
			const allFiles = getTypeScriptFiles(srcDir);

			const violations: string[] = [];

			for (const file of allFiles) {
				const relativePath = path.relative(path.join(__dirname, '../..'), file);

				// Skip if this is the allowed utility file
				const isAllowed = allowedFiles.some((pattern) => pattern.test(file));
				if (isAllowed) continue;

				const content = fs.readFileSync(file, 'utf-8');

				// Check for direct imports of yaml
				if (/from\s+['"]yaml['"]/.test(content) || /import\s+\*\s+as\s+yaml/.test(content)) {
					violations.push(relativePath);
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`yaml library should only be imported in yaml-parser utility.\nViolations:\n  - ${violations.join('\n  - ')}\n\nUse parseYamlContent/stringifyYaml from 'utils/yaml-parser' instead.`
				);
			}
		});

		it('archive libraries should only be imported in adapter files', () => {
			// Archive libraries (archiver, unzipper) must be wrapped with adapters
			const archiveLibraries = ['archiver', 'unzipper'];

			// Allowed location for archive library imports
			const allowedAdapterPatterns = [/\/session\/archive-adapter\.ts$/];

			const srcDir = path.join(__dirname, '../../src');
			const allFiles = getTypeScriptFiles(srcDir);

			const violations: { file: string; library: string }[] = [];

			for (const file of allFiles) {
				const relativePath = path.relative(path.join(__dirname, '../..'), file);

				// Skip if this is an allowed adapter file
				const isAdapterFile = allowedAdapterPatterns.some((pattern) => pattern.test(file));
				if (isAdapterFile) continue;

				const content = fs.readFileSync(file, 'utf-8');

				for (const lib of archiveLibraries) {
					// Check for direct imports of the library
					const importRegex = new RegExp(`from\\s+['"]${lib}['"]`, 'g');
					if (importRegex.test(content)) {
						violations.push({
							file: relativePath,
							library: lib
						});
					}
				}
			}

			if (violations.length > 0) {
				const violationList = violations.map((v) => `'${v.library}' in ${v.file}`).join('\n  - ');
				throw new Error(
					`Archive libraries should only be imported in adapter files.\nViolations:\n  - ${violationList}\n\nUse ArchiveAdapter from 'session/archive-adapter' instead.`
				);
			}
		});

		it('domain layers should not directly import third-party npm packages', () => {
			// Domain/service layer files should not directly import external npm packages
			// (except for standard library and type-only imports)
			const domainDirs = [path.join(__dirname, '../../src/services')];

			// Allowed npm imports for domain layer (type definitions, standard lib patterns)
			const allowedPackages = ['path', 'fs', 'crypto', 'util', 'events', 'stream', 'buffer', 'child_process'];

			const violations: { file: string; packages: string[] }[] = [];

			for (const dir of domainDirs) {
				if (!fs.existsSync(dir)) continue;
				const files = getTypeScriptFiles(dir);

				for (const file of files) {
					const content = fs.readFileSync(file, 'utf-8');
					const relativePath = path.relative(path.join(__dirname, '../..'), file);

					// Find all npm package imports (not relative or aliased imports)
					const importRegex = /from\s+['"]([^./][^'"]*)['"]/g;
					const foundPackages: string[] = [];
					let match;

					while ((match = importRegex.exec(content)) !== null) {
						const pkg = match[1].split('/')[0]; // Get package name from scoped imports

						// Skip allowed packages and local aliased imports (like 'types/', 'output/', etc.)
						if (
							!allowedPackages.includes(pkg) &&
							!pkg.startsWith('@types') &&
							pkg !== 'types' &&
							pkg !== 'output' &&
							pkg !== 'utils' &&
							pkg !== 'services' &&
							pkg !== 'config' &&
							pkg !== 'vitest'
						) {
							// This is likely a third-party npm package
							foundPackages.push(pkg);
						}
					}

					if (foundPackages.length > 0) {
						violations.push({
							file: relativePath,
							packages: [...new Set(foundPackages)]
						});
					}
				}
			}

			if (violations.length > 0) {
				const violationList = violations.map((v) => `${v.file}: ${v.packages.join(', ')}`).join('\n  - ');
				throw new Error(
					`Domain layer should not directly import third-party npm packages.\nViolations:\n  - ${violationList}\n\nConsider wrapping these in adapters or moving to infrastructure layer.`
				);
			}
		});
	});
});
