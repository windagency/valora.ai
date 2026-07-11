import { describe, it, expect } from 'vitest';

import type { ExecutedToolCall } from 'executor/validators/types';
import { secopOutputValidator } from './secops-output.validator';

const CTX = { stageName: 'secops.analyze-codebase' };

const ONE_REAL_TOOL_CALL: ExecutedToolCall[] = [{ arguments: { path: 'src/auth.ts' }, name: 'read_file' }];

const CTX_WITH_INVESTIGATION = { ...CTX, executedToolCalls: ONE_REAL_TOOL_CALL };

describe('secopOutputValidator', () => {
	it('passes when no findings are present', () => {
		expect(secopOutputValidator.validate({}, CTX).passed).toBe(true);
	});

	it('passes when all findings are low severity', () => {
		const output = { findings: [{ severity: 'low', description: 'minor issue' }] };
		expect(secopOutputValidator.validate(output, CTX).passed).toBe(true);
	});

	it('passes when findings array is empty', () => {
		expect(secopOutputValidator.validate({ findings: [] }, CTX).passed).toBe(true);
	});

	it('fails and stops pipeline when a critical finding is present', () => {
		const output = { findings: [{ severity: 'critical', description: 'SQL injection' }] };
		const result = secopOutputValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
		expect(result.violations).toHaveLength(1);
		expect(result.violations[0]).toContain('SQL injection');
	});

	it('fails and stops pipeline when a high severity finding is present', () => {
		const output = { findings: [{ severity: 'high', description: 'Insecure deserialization' }] };
		const result = secopOutputValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
	});

	it('reports one violation per unacknowledged high-or-critical finding', () => {
		const output = {
			findings: [
				{ severity: 'critical', description: 'Issue A' },
				{ severity: 'high', description: 'Issue B' },
				{ severity: 'medium', description: 'Issue C' }
			]
		};
		const result = secopOutputValidator.validate(output, CTX);
		expect(result.violations).toHaveLength(2);
	});

	it('passes when critical findings are all marked acknowledged and at least one real tool call backs the investigation', () => {
		const output = {
			findings: [{ severity: 'critical', description: 'Known issue', acknowledged: true }]
		};
		expect(secopOutputValidator.validate(output, CTX_WITH_INVESTIGATION).passed).toBe(true);
	});

	it('fails when a critical finding is marked acknowledged but the stage made zero real tool calls — self-reported acknowledgement alone is not enough', () => {
		// "acknowledged: true" is set by the same stage reporting the finding —
		// a compromised or hallucinating stage can mark every finding
		// acknowledged with no real investigation backing it at all.
		const output = {
			findings: [{ severity: 'critical', description: 'Known issue', acknowledged: true }]
		};
		const result = secopOutputValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
	});
});
