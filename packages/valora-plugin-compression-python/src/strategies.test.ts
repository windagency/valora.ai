import { describe, expect, it } from 'vitest';

import { filterCargo, filterPip, filterPython, filterRuff } from './strategies';

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

describe('filterPip', () => {
	it('strips Collecting and Downloading lines', () => {
		const input = [
			'Collecting flask',
			'  Downloading flask-3.0.0-py3-none-any.whl (101 kB)',
			'Successfully installed flask-3.0.0'
		].join('\n');
		const result = filterPip(input, 'pip install flask');
		expect(result).not.toContain('Collecting flask');
		expect(result).not.toContain('Downloading flask');
		expect(result).toContain('Successfully installed flask-3.0.0');
	});

	it('strips progress bar lines', () => {
		const input = [
			'  Downloading flask-3.0.0-py3-none-any.whl (101 kB)',
			'     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 101.3/101.3 kB',
			'Installing collected packages: flask',
			'Successfully installed flask-3.0.0'
		].join('\n');
		const result = filterPip(input, 'pip install flask');
		expect(result).not.toContain('━');
		expect(result).toContain('Installing collected packages');
		expect(result).toContain('Successfully installed flask-3.0.0');
	});

	it('strips Building wheel and Using cached lines', () => {
		const input = [
			'Building wheels for collected packages: mylib',
			'  Building wheel for mylib ... done',
			'Successfully installed mylib-1.0.0'
		].join('\n');
		const result = filterPip(input, 'pip install mylib');
		expect(result).not.toContain('Building wheel');
		expect(result).toContain('Successfully installed');
	});

	it('preserves error and warning lines', () => {
		const input = [
			'Collecting broken',
			'ERROR: Could not find a version that satisfies broken',
			'ERROR: No matching distribution found'
		].join('\n');
		const result = filterPip(input, 'pip install broken');
		expect(result).toContain('ERROR: Could not find');
		expect(result).toContain('ERROR: No matching');
	});
});

describe('filterCargo', () => {
	describe('cargo build / clippy', () => {
		it('strips Compiling lines', () => {
			const input = ['   Compiling serde v1.0.189', '   Compiling my-app v0.1.0', 'error[E0502]: cannot borrow'].join(
				'\n'
			);
			const result = filterCargo(input, 'cargo build');
			expect(result).not.toContain('Compiling serde');
			expect(result).not.toContain('Compiling my-app');
			expect(result).toContain('error[E0502]');
		});

		it('preserves warning and error lines', () => {
			const input = [
				'   Compiling my-app v0.1.0',
				'warning: unused variable `x`',
				'  --> src/main.rs:10:5',
				'error[E0499]: cannot borrow `v` as mutable more than once'
			].join('\n');
			const result = filterCargo(input, 'cargo clippy');
			expect(result).toContain('warning: unused variable');
			expect(result).toContain('error[E0499]');
		});

		it('preserves the Finished/Compiling summary line', () => {
			const input = ['   Compiling dep v1.0', '    Finished dev [unoptimized] target(s) in 2.34s'].join('\n');
			const result = filterCargo(input, 'cargo build');
			expect(result).toContain('Finished dev');
		});
	});

	describe('cargo test', () => {
		it('collapses passing tests into a count summary', () => {
			const input = ['test tests::add ... ok', 'test tests::subtract ... ok', 'test tests::multiply ... FAILED'].join(
				'\n'
			);
			const result = filterCargo(input, 'cargo test');
			expect(result).toContain('[2 tests passed]');
			expect(result).toContain('tests::multiply ... FAILED');
		});

		it('preserves failure details and test result summary', () => {
			const input = [
				'test tests::bad ... FAILED',
				'failures:',
				'    tests::bad',
				'test result: FAILED. 1 passed; 1 failed'
			].join('\n');
			const result = filterCargo(input, 'cargo test');
			expect(result).toContain('failures:');
			expect(result).toContain('test result: FAILED');
		});
	});
});

describe('filterRuff', () => {
	it('groups violations by rule code and caps at 3 per code', () => {
		const lines = Array.from({ length: 5 }, (_, i) => `src/file${i}.py:${i + 1}:1: E501 Line too long`);
		const result = filterRuff(lines.join('\n'), 'ruff check .');
		const e501Lines = result.split('\n').filter((l) => l.includes('E501'));
		expect(e501Lines.length).toBeLessThanOrEqual(4); // 3 examples + 1 ellipsis
	});

	it('keeps different rule codes in separate groups', () => {
		const input = ['src/a.py:1:1: E501 Line too long', 'src/b.py:2:1: F401 `os` imported but unused'].join('\n');
		const result = filterRuff(input, 'ruff check .');
		expect(result).toContain('E501');
		expect(result).toContain('F401');
	});

	it('preserves the Found N errors summary line', () => {
		const input = ['src/a.py:1:1: E501 Line too long', 'Found 1 error.'].join('\n');
		const result = filterRuff(input, 'ruff check .');
		expect(result).toContain('Found 1 error.');
	});
});
