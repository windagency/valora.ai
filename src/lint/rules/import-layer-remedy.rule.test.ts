import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import { importLayerRemedyRule } from './import-layer-remedy.rule';

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: 'module' }
});

describe('importLayerRemedyRule', () => {
	it('allows forward-direction layer imports', () => {
		tester.run('import-layer-remedy', importLayerRemedyRule, {
			invalid: [],
			valid: [
				{
					code: `import { Foo } from 'types/foo.types';`,
					filename: '/workspaces/valora/src/services/foo.service.ts'
				},
				{
					code: `import { Bar } from 'repo/bar.repo';`,
					filename: '/workspaces/valora/src/services/bar.service.ts'
				}
			]
		});
	});

	it('reports a violation when a lower layer imports from a higher layer', () => {
		tester.run('import-layer-remedy', importLayerRemedyRule, {
			invalid: [
				{
					code: `import { FooService } from 'services/foo.service';`,
					errors: [{ messageId: 'layerViolation' }],
					filename: '/workspaces/valora/src/repo/bar.repo.ts'
				}
			],
			valid: []
		});
	});
});
