import { describe, expect, it } from 'vitest';

import { filterPython } from '../src/strategies';

function pad(str: string, targetLength: number): string {
	return str.repeat(Math.ceil(targetLength / str.length)).slice(0, targetLength);
}

describe('filterPython', () => {
	it('collapses passing tests to a count summary', () => {
		const input = [
			'PASSED tests/test_a.py::test_one',
			'PASSED tests/test_a.py::test_two',
			'FAILED tests/test_b.py::test_three'
		].join('\n');
		const result = filterPython(input, 'pytest');
		expect(result).toContain('[2 tests passed]');
		expect(result).toContain('FAILED tests/test_b.py::test_three');
	});

	it('preserves FAILED lines and tracebacks', () => {
		const input = [pad('PASSED test\n', 20), 'FAILED tests/test_bad.py::test_x', 'AssertionError: assert 1 == 2'].join(
			'\n'
		);
		const result = filterPython(input, 'python -m pytest');
		expect(result).toContain('FAILED tests/test_bad.py::test_x');
		expect(result).toContain('AssertionError: assert 1 == 2');
	});

	it('preserves summary lines (=== short test summary ===)', () => {
		const input = ['PASSED a', '=== short test summary info ===', 'FAILED b'].join('\n');
		const result = filterPython(input, 'pytest');
		expect(result).toContain('=== short test summary info ===');
	});
});
