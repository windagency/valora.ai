import { describe, expect, it } from 'vitest';

import { getStageValidationService } from './stage-validation.service';

describe('StageValidationService — Track-Two registry validators receive real tool-call history', () => {
	it('passes an empty executedToolCalls list through to a registered validator when none is supplied', () => {
		const service = getStageValidationService();
		// secops-output is registered against 'secops' stage names in built-in/index.
		const result = service.validate('secops.analyze-codebase', {
			findings: [{ acknowledged: true, description: 'Known issue', severity: 'critical' }]
		});
		// With no real tool-call evidence, a self-reported acknowledgement alone must not pass.
		expect(result.isValid).toBe(false);
	});

	it('passes the real executedToolCalls list through so a registered validator can use it as ground truth', () => {
		const service = getStageValidationService();
		const result = service.validate(
			'secops.analyze-codebase',
			{ findings: [{ acknowledged: true, description: 'Known issue', severity: 'critical' }] },
			[{ arguments: { path: 'src/auth.ts' }, name: 'read_file' }]
		);
		expect(result.isValid).toBe(true);
	});
});
