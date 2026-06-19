import { describe, it, expect } from 'vitest';

import { secopOutputValidator } from './secops-output.validator';

const CTX = { stageName: 'secops.analyze-codebase' };

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

	it('passes when critical findings are all marked acknowledged', () => {
		const output = {
			findings: [{ severity: 'critical', description: 'Known issue', acknowledged: true }]
		};
		expect(secopOutputValidator.validate(output, CTX).passed).toBe(true);
	});
});
