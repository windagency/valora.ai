import { describe, it, expect, beforeEach } from 'vitest';

import type { DeterministicValidator } from './types';
import { getValidator, hasValidator, registerValidator, resetRegistry } from './registry';

const makeValidator = (name: string): DeterministicValidator => ({
	name,
	validate: () => ({ passed: true, shouldStopPipeline: false, violations: [] })
});

describe('ValidatorRegistry', () => {
	beforeEach(() => {
		resetRegistry();
	});

	it('returns undefined for an unregistered stage', () => {
		expect(getValidator('unknown.stage')).toBeUndefined();
	});

	it('returns the validator after exact-name registration', () => {
		const v = makeValidator('test');
		registerValidator('test.stage', v);
		expect(getValidator('test.stage')).toBe(v);
	});

	it('returns the validator when the stage name contains a registered pattern', () => {
		const v = makeValidator('analyze-requirements');
		registerValidator('analyze-requirements', v);
		expect(getValidator('onboard.analyze-requirements')).toBe(v);
	});

	it('returns the validator when the registered pattern contains the stage name', () => {
		const v = makeValidator('secops');
		registerValidator('secops.analyze-codebase', v);
		expect(getValidator('secops.analyze-codebase')).toBe(v);
	});

	it('confirms a stage has a validator after registration', () => {
		registerValidator('secops', makeValidator('secops'));
		expect(hasValidator('secops.analyze-codebase')).toBe(true);
	});

	it('reports false for stages with no registered validator', () => {
		expect(hasValidator('coder.write-code')).toBe(false);
	});

	it('overwrites an existing registration with the same key', () => {
		const first = makeValidator('first');
		const second = makeValidator('second');
		registerValidator('same.stage', first);
		registerValidator('same.stage', second);
		expect(getValidator('same.stage')).toBe(second);
	});
});
