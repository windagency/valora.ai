import { describe, expect, it, vi } from 'vitest';

const mockConsolePrint = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleBlank = vi.fn();
vi.mock('output/console-output', () => ({
	getConsoleOutput: () => ({ blank: mockConsoleBlank, error: mockConsoleError, print: mockConsolePrint })
}));

import { getStageValidationService, StageValidationService } from './stage-validation.service';

describe('StageValidationService — requiresValidation', () => {
	const service = new StageValidationService();

	it('is true for a Track-Two registered pattern', () => {
		expect(service.requiresValidation('secops.analyze-codebase')).toBe(true);
	});

	it('is true for a legacy load-specifications pattern', () => {
		expect(service.requiresValidation('context.load-specifications')).toBe(true);
	});

	it('is true for a legacy analyze-requirements pattern', () => {
		expect(service.requiresValidation('onboard.analyze-requirements')).toBe(true);
	});

	it('is true for an exact VALIDATED_STAGES entry', () => {
		expect(service.requiresValidation('context.context.load-specifications')).toBe(true);
	});

	it('is false for a stage name matching no pattern', () => {
		expect(service.requiresValidation('plan.assess-risks')).toBe(false);
	});
});

describe('StageValidationService — validateLoadSpecifications (via validate())', () => {
	const service = new StageValidationService();
	const validSpecs = {
		completeness_score: 0.9,
		ready_for_prd: true,
		specifications: {
			functional_requirements: ['req1'],
			problem_statement: 'A real problem',
			success_criteria: ['done when x'],
			target_users: ['devs']
		}
	};

	it('passes valid, complete specifications', () => {
		const result = service.validate('context.load-specifications', validSpecs);
		expect(result).toEqual({ isValid: true, reasons: [], shouldStopPipeline: false, summary: undefined });
	});

	it('fails when ready_for_prd is explicitly false', () => {
		const result = service.validate('context.load-specifications', { ...validSpecs, ready_for_prd: false });
		expect(result.isValid).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
		expect(result.reasons).toContain('Specifications are not ready for PRD generation');
	});

	it('fails when completeness_score is below the 0.6 minimum threshold', () => {
		const result = service.validate('context.load-specifications', { ...validSpecs, completeness_score: 0.4 });
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('Completeness score (40%) is below minimum threshold (60%)');
	});

	it('passes when completeness_score is exactly at the threshold (not below it)', () => {
		const result = service.validate('context.load-specifications', { ...validSpecs, completeness_score: 0.6 });
		expect(result.isValid).toBe(true);
	});

	it('fails when specifications is entirely missing', () => {
		const result = service.validate('context.load-specifications', { ready_for_prd: true });
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('No specifications found in input');
	});

	it('fails and lists missing critical sections by display name', () => {
		const result = service.validate('context.load-specifications', {
			ready_for_prd: true,
			specifications: { functional_requirements: ['req1'] }
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons[0]).toContain('problem statement');
		expect(result.reasons[0]).toContain('success criteria');
		expect(result.reasons[0]).toContain('target users');
		expect(result.reasons[0]).not.toContain('functional requirements');
	});

	it('accepts an alternate key-name variation for a critical field (e.g. "features" for functional requirements)', () => {
		const result = service.validate('context.load-specifications', {
			ready_for_prd: true,
			specifications: {
				features: ['req1'],
				overview: 'A real problem',
				goals: ['done when x'],
				audience: ['devs']
			}
		});
		expect(result.isValid).toBe(true);
	});

	it('treats a placeholder-empty critical field (empty array/string) as missing', () => {
		const result = service.validate('context.load-specifications', {
			ready_for_prd: true,
			specifications: { ...validSpecs.specifications, problem_statement: '   ' }
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons[0]).toContain('problem statement');
	});

	it('surfaces validation_errors verbatim', () => {
		const result = service.validate('context.load-specifications', {
			...validSpecs,
			validation_errors: ['schema mismatch']
		});
		expect(result.reasons).toContain('schema mismatch');
	});

	it('surfaces blockers with a prefix', () => {
		const result = service.validate('context.load-specifications', { ...validSpecs, blockers: ['missing budget'] });
		expect(result.reasons).toContain('Blockers found: missing budget');
	});

	it('builds a summary containing the failure heading and completeness score when invalid', () => {
		const result = service.validate('context.load-specifications', { ...validSpecs, ready_for_prd: false });
		expect(result.summary).toContain('Specifications Validation Failed');
		expect(result.summary).toContain('90%');
	});
});

describe('StageValidationService — validateAnalyzeRequirements (via validate())', () => {
	const service = new StageValidationService();
	const validOutputs = {
		complexity_estimate: { confidence: 0.9, risk_factors: [{ blocking: false }] },
		requirement_analysis: { summary: 'A thorough analysis of the requirements.' }
	};

	it('passes valid, complete requirement analysis', () => {
		const result = service.validate('onboard.analyze-requirements', validOutputs);
		expect(result).toEqual({ isValid: true, reasons: [], shouldStopPipeline: false, summary: undefined });
	});

	it('fails when requirement_analysis is missing entirely', () => {
		const result = service.validate('onboard.analyze-requirements', {});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('No requirement analysis generated');
	});

	it('fails when requirement_analysis contains only placeholder text', () => {
		const result = service.validate('onboard.analyze-requirements', {
			requirement_analysis: { summary: 'TBD', notes: '[placeholder]' }
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('Requirement analysis is empty or contains only placeholders');
	});

	it('fails when a critical_gaps entry has severity "critical"', () => {
		const result = service.validate('onboard.analyze-requirements', {
			requirement_analysis: {
				summary: 'Analysis text',
				critical_gaps: [{ severity: 'critical' }, { severity: 'minor' }]
			}
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('1 critical gap(s) identified in requirements');
	});

	it('passes when gaps exist but none are severity "critical"', () => {
		const result = service.validate('onboard.analyze-requirements', {
			requirement_analysis: { summary: 'Analysis text', gaps: [{ severity: 'minor' }] }
		});
		expect(result.isValid).toBe(true);
	});

	it('fails when a risk_factors entry is blocking', () => {
		const result = service.validate('onboard.analyze-requirements', {
			complexity_estimate: { risk_factors: [{ blocking: true }] },
			requirement_analysis: { summary: 'Analysis text' }
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('1 blocking risk(s) identified');
	});

	it('fails when complexity_estimate.confidence is below the 0.5 minimum threshold', () => {
		const result = service.validate('onboard.analyze-requirements', {
			complexity_estimate: { confidence: 0.2 },
			requirement_analysis: { summary: 'Analysis text' }
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('Analysis confidence (20%) is too low - insufficient input data');
	});

	it('fails with the explicit validation_message when is_valid is false', () => {
		const result = service.validate('onboard.analyze-requirements', {
			is_valid: false,
			requirement_analysis: { summary: 'Analysis text' },
			validation_message: 'Model reported a hard failure'
		});
		expect(result.isValid).toBe(false);
		expect(result.reasons).toContain('Model reported a hard failure');
	});

	it('fails with a default message when is_valid is false and no message is given', () => {
		const result = service.validate('onboard.analyze-requirements', {
			is_valid: false,
			requirement_analysis: { summary: 'Analysis text' }
		});
		expect(result.reasons).toContain('Requirements analysis validation failed');
	});

	it('builds a summary containing the failure heading and confidence when invalid', () => {
		const result = service.validate('onboard.analyze-requirements', {
			complexity_estimate: { confidence: 0.2 },
			requirement_analysis: { summary: 'Analysis text' }
		});
		expect(result.summary).toContain('Requirements Analysis Failed');
		expect(result.summary).toContain('20%');
	});
});

describe('StageValidationService — displayValidationFailure', () => {
	it('prints the summary when one is present', () => {
		const service = new StageValidationService();
		mockConsolePrint.mockClear();

		service.displayValidationFailure({ isValid: false, reasons: [], shouldStopPipeline: true, summary: 'the summary' });

		expect(mockConsolePrint).toHaveBeenCalledWith('the summary');
	});

	it('prints each reason individually when no summary is present', () => {
		const service = new StageValidationService();
		mockConsolePrint.mockClear();
		mockConsoleError.mockClear();

		service.displayValidationFailure({
			isValid: false,
			reasons: ['reason one', 'reason two'],
			shouldStopPipeline: true
		});

		expect(mockConsoleError).toHaveBeenCalledWith('Pipeline stopped due to validation failure:');
		expect(mockConsolePrint).toHaveBeenCalledWith('  • reason one');
		expect(mockConsolePrint).toHaveBeenCalledWith('  • reason two');
	});
});

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
