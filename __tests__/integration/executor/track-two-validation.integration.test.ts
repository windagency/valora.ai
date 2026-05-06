import { describe, it, expect, beforeEach } from 'vitest';

import { resetRegistry } from 'executor/validators/registry';
import { getStageValidationService } from 'executor/stage-validation.service';

// Ensure built-in validators are registered before tests run
import 'executor/validators/built-in/index';

describe('Track-Two deterministic validation (integration)', () => {
	beforeEach(() => {
		// Keep the built-in registrations; only reset between tests if explicitly needed.
	});

	describe('secops stage', () => {
		it('detects a critical finding the LLM did not escalate and stops the pipeline', () => {
			const service = getStageValidationService();

			// Simulate LLM output that mentions critical findings without escalating
			const outputs = {
				summary: 'Security analysis complete. No blocking issues.',
				findings: [
					{ severity: 'critical', description: 'Remote code execution via unsanitised input' },
					{ severity: 'low', description: 'Outdated dev dependency' }
				]
			};

			expect(service.requiresValidation('secops.analyze-codebase')).toBe(true);

			const result = service.validate('secops.analyze-codebase', outputs);

			expect(result.isValid).toBe(false);
			expect(result.shouldStopPipeline).toBe(true);
			expect(result.reasons.some((r) => r.includes('Remote code execution'))).toBe(true);
		});

		it('passes when the only findings are low severity', () => {
			const service = getStageValidationService();
			const outputs = {
				findings: [{ severity: 'low', description: 'Minor lint warning' }]
			};
			const result = service.validate('secops.analyze-codebase', outputs);
			expect(result.isValid).toBe(true);
		});
	});

	describe('compliance stage', () => {
		it('halts pipeline when sanctions clearance is claimed without supporting evidence', () => {
			const service = getStageValidationService();

			// LLM claims OFAC clearance but provides no checks_performed entries
			const outputs = {
				sanctions_cleared: true,
				summary: 'Sanctions check passed'
				// no checks_performed — hallucinated clearance
			};

			const result = service.validate('asserter.compliance-check', outputs);

			expect(result.isValid).toBe(false);
			expect(result.shouldStopPipeline).toBe(true);
		});
	});

	describe('git-operations stage', () => {
		it('blocks a force push to main before any git command runs', () => {
			const service = getStageValidationService();

			const outputs = {
				operations: ['git push --force origin main', 'git tag v2.0.0']
			};

			const result = service.validate('coder.apply-git-operations', outputs);

			expect(result.isValid).toBe(false);
			expect(result.shouldStopPipeline).toBe(true);
			expect(result.reasons.some((r) => r.includes('git push --force origin main'))).toBe(true);
		});

		it('allows safe git operations through', () => {
			const service = getStageValidationService();

			const outputs = {
				operations: ['git add .', 'git commit -m "chore: bump version"', 'git push origin release/v2']
			};

			const result = service.validate('coder.apply-git-operations', outputs);
			expect(result.isValid).toBe(true);
		});
	});
});
