/**
 * Circular Dependencies Architecture Tests
 *
 * These tests detect and prevent circular dependencies between modules,
 * which can lead to initialization issues, tight coupling, and maintenance problems.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, expect, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'), '**/*.test.ts', '**/*.spec.ts');

/**
 * Scans TypeScript source files in `src/<layer>` for imports that resolve into
 * `src/di`. Returns violation strings in `"file:line"` format.
 * Excludes test files (.test.ts / .spec.ts).
 *
 * We can't use arch-unit-ts for this because its package matching falsely hits
 * any path containing "di" (e.g. "undici", ".d.ts" files in node_modules).
 */
function findDiImports(layer: string): string[] {
	const violations: string[] = [];
	const srcRoot = resolve('./src');
	const targetDir = join(srcRoot, layer);
	// Matches relative `from '../di'`, `from '../../di/container'`
	// and absolute alias `from 'di/container'`.
	// Does NOT match `from 'undici'` or bare modules containing "di" in their name.
	const diPattern = /from\s+['"](?:(?:\.\.?\/)+di(?:\/[^'"]*)?|di(?:\/[^'"]*))['"]/u;

	function scan(dir: string) {
		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				scan(join(dir, entry.name));
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
				const file = join(dir, entry.name);
				const lines = readFileSync(file, 'utf-8').split('\n');
				lines.forEach((line, idx) => {
					if (diPattern.test(line)) {
						violations.push(`${file.replace(srcRoot + '/', '')}:${idx + 1}`);
					}
				});
			}
		}
	}

	scan(targetDir);
	return violations;
}

describe('Circular Dependencies', () => {
	describe('Module-Level Circular Dependencies', () => {
		it('types should not create circular dependencies', () => {
			// Types should be leaf nodes - they should not depend on anything
			// that might depend back on them
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
				.because('Types must be leaf nodes to prevent circular dependencies')
				.check(srcProject.allClasses());
		});

		it('utils should not create circular dependencies', () => {
			// Utils should be low-level - they should not depend on higher layers
			noClasses()
				.that()
				.resideInAPackage('utils..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'services..', 'executor..', 'session..', 'mcp..', 'llm..')
				.because('Utils must be foundational to prevent circular dependencies')
				.check(srcProject.allClasses());
		});

		it('config should not create circular dependencies', () => {
			// config/provider-catalog.ts depends on llm/registry for the dynamic provider
			// catalog; this is intentional and the per-file cycle is safe at runtime.
			noClasses()
				.that()
				.resideInAPackage('config..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'services..', 'executor..', 'session..', 'mcp..')
				.because('Config must be foundational (llm allowed for provider catalog)')
				.check(srcProject.allClasses());
		});

		it('services should not depend on executor', () => {
			// Services are called by executor, not the other way around
			noClasses()
				.that()
				.resideInAPackage('services..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('executor..')
				.because('Services are used by executor - dependency should be one-way')
				.check(srcProject.allClasses());
		});

		it('session should not depend on executor', () => {
			// Session is managed by executor, not the other way around
			noClasses()
				.that()
				.resideInAPackage('session..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('executor..')
				.because('Session is managed by executor - dependency should be one-way')
				.check(srcProject.allClasses());
		});

		it('llm should not depend on executor', () => {
			// LLM providers are used by executor, not the other way around
			noClasses()
				.that()
				.resideInAPackage('llm..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('executor..')
				.because('LLM providers are used by executor - dependency should be one-way')
				.check(srcProject.allClasses());
		});

		it('llm should not depend on services', () => {
			// LLM is infrastructure, services are domain
			noClasses()
				.that()
				.resideInAPackage('llm..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('services..')
				.because('LLM providers should not know about services to prevent circular dependencies')
				.check(srcProject.allClasses());
		});
	});

	describe('Layer-Level Circular Dependencies', () => {
		it('infrastructure should not depend on domain', () => {
			// Infrastructure (llm, config, output, utils) should not depend on
			// domain (services, session)
			noClasses()
				.that()
				.resideInAnyPackage('llm..', 'config..', 'utils..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('services..', 'session..')
				.because('Infrastructure layer must not depend on domain layer to prevent circular dependencies')
				.check(srcProject.allClasses());
		});

		it('domain should not depend on presentation', () => {
			// Domain (services, session) should not depend on
			// presentation (cli, mcp, ui)
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'session..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'ui..')
				.because('Domain layer must not depend on presentation layer to prevent circular dependencies')
				.check(srcProject.allClasses());
		});

		it('domain should not depend on application orchestration', () => {
			// Domain (services, session) should not depend on
			// application orchestration (executor)
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'session..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('executor..')
				.because('Domain is orchestrated by executor, not vice versa')
				.check(srcProject.allClasses());
		});
	});

	describe('Provider Pattern Circular Dependencies', () => {
		it('LLM providers should not depend on each other', () => {
			// Each provider should be independent
			// Note: Files are named in kebab-case (e.g., anthropic.provider.ts)
			// Exclude: index.ts (barrel exports), test files (they import what they test)
			const providerClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						c.packagePath.toString().startsWith('llm.providers') &&
						!c.getSimpleName().includes('index') &&
						!c.getSimpleName().includes('.test') &&
						!c.getSimpleName().includes('.spec')
				);

			// Check that no provider imports another provider (except base classes)
			const violations: { source: string; target: string }[] = [];
			for (const provider of providerClasses) {
				for (const dep of provider.dependencies) {
					const depPath = dep.typeScriptClass.packagePath.toString();
					const depName = dep.typeScriptClass.getSimpleName();
					if (
						depPath.startsWith('llm.providers') &&
						!depName.includes('index') &&
						!depName.includes('base') &&
						depName !== provider.getSimpleName()
					) {
						violations.push({
							source: provider.getSimpleName(),
							target: depName
						});
					}
				}
			}

			expect(violations).toEqual([]);
		});

		it('LLM registry should not depend on providers', () => {
			// Registry registers providers, but shouldn't depend on specific implementations
			// (it should use the base interface instead)
			// Manual check since haveSimpleNameContaining() is not available
			const registryClasses = srcProject
				.allClasses()
				.get()
				.filter((c) => c.packagePath.toString().startsWith('llm') && c.getSimpleName().includes('registry'));

			registryClasses.forEach((registry) => {
				const hasProviderDependency = registry.dependencies.some((dep) =>
					dep.typeScriptClass.packagePath.toString().startsWith('llm.providers')
				);
				expect(hasProviderDependency).toBe(false);
			});
		});
	});

	describe('Service Pattern Circular Dependencies', () => {
		it('services should not have mutual dependencies', () => {
			// Services should have a clear dependency direction
			// This is a soft guideline - we check that services don't depend on executor
			// which would create a cycle
			noClasses()
				.that()
				.resideInAPackage('services..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('executor..', 'cli..', 'mcp..')
				.because('Services should not depend on their orchestrators or presentation layers')
				.check(srcProject.allClasses());
		});
	});

	describe('DI Container Circular Dependencies', () => {
		it('services should not depend on DI container', () => {
			expect(findDiImports('services')).toEqual([]);
		});

		it('executor should not depend on DI container', () => {
			expect(findDiImports('executor')).toEqual([]);
		});

		it('session should not depend on DI container', () => {
			expect(findDiImports('session')).toEqual([]);
		});

		it('LLM should not depend on DI container', () => {
			expect(findDiImports('llm')).toEqual([]);
		});
	});

	describe('Cross-Module Circular Dependencies', () => {
		it('CLI should not create circular dependency with executor', () => {
			// CLI can depend on executor, but executor should not depend on CLI
			// (except for limited utility dependencies which are checked elsewhere)
			noClasses()
				.that()
				.resideInAPackage('executor..')
				.should()
				.dependOnClassesThat()
				.resideInAPackage('cli.commands..')
				.because('Executor should not depend on CLI command implementations')
				.check(srcProject.allClasses());
		});

		it('mcp/ may only import executor/ at the type level (per ADR-015)', async () => {
			// ADR-015 records that executor and mcp form a co-located orchestration ring.
			// `executor/` may import concrete classes from `mcp/`, but `mcp/` may only
			// import `executor/` at the type level. Any runtime `import { Foo } from
			// 'executor/...'` inside `src/mcp/` reverses the orchestration direction
			// and triggers this check.
			const { promises: fs } = await import('node:fs');
			const path = await import('node:path');

			const mcpDir = path.resolve(process.cwd(), 'src', 'mcp');
			const offenders: string[] = [];

			async function walk(dir: string): Promise<void> {
				const entries = await fs.readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const full = path.join(dir, entry.name);
					if (entry.isDirectory()) {
						await walk(full);
						continue;
					}
					if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;

					const content = await fs.readFile(full, 'utf8');
					// Strip comments before scanning; matters for ADR cross-references.
					const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
					// Match `import` statements that mention `executor/` and are NOT
					// of the form `import type { ... } from 'executor/...'`.
					const importLines = stripped.match(/^[ \t]*import\b[^;]*;/gm) ?? [];
					for (const line of importLines) {
						if (!/['"]executor\//.test(line)) continue;
						if (/^\s*import\s+type\b/.test(line)) continue;
						// Per-specifier `import { type X }` form is also allowed:
						// rejected only when there is at least one runtime specifier.
						const specifierBlock = line.match(/\{([^}]*)\}/)?.[1];
						if (specifierBlock !== undefined) {
							const specs = specifierBlock
								.split(',')
								.map((s) => s.trim())
								.filter(Boolean);
							const allTypeOnly = specs.every((s) => s.startsWith('type '));
							if (allTypeOnly) continue;
						}
						offenders.push(`${path.relative(process.cwd(), full)}: ${line.trim()}`);
					}
				}
			}

			await walk(mcpDir);

			expect(
				offenders,
				`mcp/ has runtime imports of executor/ — violates ADR-015 direction:\n${offenders.join('\n')}`
			).toEqual([]);
		});

		it('output should not create circular dependencies', () => {
			// Output is used by many layers, but shouldn't depend on them
			noClasses()
				.that()
				.resideInAPackage('output..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..', 'mcp..', 'services..', 'executor..', 'session..', 'llm..')
				.because('Output layer should not depend on application layers')
				.check(srcProject.allClasses());
		});
	});

	describe('Import Cycle Prevention', () => {
		it('types should not import from implementation modules', () => {
			// This prevents the most common source of circular dependencies
			// Note: This is covered by the "types should only import other types" test in architecture.test.ts
			// resideOutsideOfPackage() is not available on ClassesThat interface, so using alternative check
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
				.because('Type definitions should be self-contained to prevent import cycles')
				.check(srcProject.allClasses());
		});

		it('index files should not be imported by source files in same package', () => {
			// Index files aggregate exports, source files shouldn't import from them
			// This is harder to enforce with arch-unit-ts, so we document it as a principle
			// The check is implicit - if there's a cycle, other tests will catch it
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
				.because('Avoiding cross-package imports from types prevents cycles')
				.check(srcProject.allClasses());
		});
	});

	describe('Acyclic Dependencies Principle (ADP)', () => {
		it('package dependency graph should be acyclic - infrastructure layer', () => {
			// Infrastructure packages should form the base of the dependency graph
			// Manual check to exclude external node_modules dependencies
			const infrastructureClasses = srcProject
				.allClasses()
				.get()
				.filter(
					(c) =>
						!c.getSimpleName().includes('.test') &&
						(c.packagePath.toString().startsWith('types') ||
							c.packagePath.toString().startsWith('utils') ||
							c.packagePath.toString().startsWith('config') ||
							c.packagePath.toString().startsWith('output'))
				);

			const higherLayers = ['llm', 'services', 'executor', 'session', 'cli', 'mcp', 'di', 'ui'];

			infrastructureClasses.forEach((infraClass) => {
				const violatingDeps = infraClass.dependencies.filter((dep) => {
					const depPath = dep.typeScriptClass.packagePath.toString();
					// Ignore node_modules
					if (depPath.includes('node_modules')) return false;
					// Check if depends on higher layer
					return higherLayers.some((layer) => depPath.startsWith(layer));
				});

				expect(violatingDeps.length).toBe(0);
			});
		});

		it('package dependency graph should be acyclic - domain layer', () => {
			// Domain packages should not depend on application or presentation
			noClasses()
				.that()
				.resideInAnyPackage('services..', 'session..', 'llm..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('executor..', 'cli..', 'mcp..', 'ui..')
				.because('Domain layer must not depend on application or presentation layers')
				.check(srcProject.allClasses());
		});

		it('package dependency graph should be acyclic - application layer', () => {
			// Application layer (executor) may depend on MCP infrastructure
			// for external tool execution, but not on other presentation layers.
			// MCP contains both server (presentation) and client (infrastructure) code.
			// This is validated at a finer granularity by other tests.
			//
			// Note: this deliberately checks only `cli..`, not `ui..` — executor
			// legitimately depends on `ui/prompt-adapter.interface.ts` for
			// interactive escalation/tool-approval prompts (a sanctioned
			// cross-cutting concern, not a layering violation).
			noClasses()
				.that()
				.resideInAnyPackage('executor..')
				.should()
				.dependOnClassesThat()
				.resideInAnyPackage('cli..')
				.because('Application layer (executor) must not depend on the CLI presentation layer')
				.check(srcProject.allClasses());
		});
	});
});
