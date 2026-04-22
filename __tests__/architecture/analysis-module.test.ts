// tests/architecture/analysis-module.test.ts
import { noClasses } from 'arch-unit-ts/dist/main';
import { TypeScriptProject } from 'arch-unit-ts/dist/arch-unit/core/domain/TypeScriptProject';
import { RelativePath } from 'arch-unit-ts/dist/arch-unit/core/domain/RelativePath';
import { describe, it } from 'vitest';

const srcProject = new TypeScriptProject(RelativePath.of('src'), '**/*.test.ts', '**/*.spec.ts');

describe('Analysis module architecture', () => {
	it('analysis module does not import from forbidden layers', () => {
		noClasses()
			.that()
			.resideInAPackage('analysis..')
			.should()
			.dependOnClassesThat()
			.resideInAnyPackage('cli..', 'executor..', 'session..', 'mcp..', 'llm..', 'batch..', 'services..', 'di..')
			.because('src/analysis/ may only import from ast, lsp, types, utils')
			.check(srcProject.allClasses());
	});
});
