const RUFF_MAX_EXAMPLES_PER_CODE = 3;
const CARGO_TEST_MAX_PASS_LABEL = 'tests passed';

export function filterCargo(output: string, command: string): string {
	const isTest = /cargo\s+test\b/.test(command);
	const lines = output.split('\n');
	const result: string[] = [];
	let passCount = 0;

	const flushPassCount = (): void => {
		if (passCount > 0) {
			result.push(`[${passCount} ${CARGO_TEST_MAX_PASS_LABEL}]`);
			passCount = 0;
		}
	};

	for (const line of lines) {
		if (/^\s+Compiling\s/.test(line)) continue;
		if (isTest) {
			if (/^test .+ \.\.\. ok$/.test(line.trim())) {
				passCount++;
				continue;
			}
			if (/^test .+ \.\.\. FAILED/.test(line.trim()) || /^(failures|test result):/.test(line.trim())) {
				flushPassCount();
			}
		}
		result.push(line);
	}

	flushPassCount();
	return result.join('\n');
}

export function filterPip(output: string, _command: string): string {
	return output
		.split('\n')
		.filter((line) => !isPipNoiseLine(line))
		.join('\n');
}

export function filterPython(output: string, _command: string): string {
	const lines = output.split('\n');
	const kept: string[] = [];
	let passCount = 0;

	const flushPassCount = (): void => {
		if (passCount > 0) {
			kept.push(`[${passCount} test${passCount === 1 ? '' : 's'} passed]`);
			passCount = 0;
		}
	};

	for (const line of lines) {
		const isPassLine = /^\s*(PASSED|\.)\s*$/.test(line) || /\s+PASSED$/.test(line) || /^\s*PASSED\s+/.test(line);
		const isFailLine = /^\s*(FAILED|F\s|ERROR)/.test(line);
		const isSummaryLine = /^(=+|FAILED|ERROR|passed|failed|error|warnings summary|short test)/.test(line);

		if (isFailLine) {
			flushPassCount();
			kept.push(line);
		} else if (isPassLine) {
			passCount++;
		} else if (isSummaryLine) {
			flushPassCount();
			kept.push(line);
		} else {
			kept.push(line);
		}
	}

	flushPassCount();
	return kept.join('\n');
}

export function filterRuff(output: string, _command: string): string {
	const lines = output.split('\n');
	const byCode = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		const match = line.match(/^\S+:\d+:\d+:\s+([A-Z]\d+)\s+/);
		if (match) {
			const code = match[1] ?? '';
			const bucket = byCode.get(code);
			if (!bucket) {
				byCode.set(code, [line]);
			} else if (bucket.length < RUFF_MAX_EXAMPLES_PER_CODE) {
				bucket.push(line);
			} else if (bucket.length === RUFF_MAX_EXAMPLES_PER_CODE) {
				bucket.push(`  ... (more ${code} violations)`);
			}
		} else {
			other.push(line);
		}
	}

	return [...other, ...[...byCode.values()].flat()].join('\n');
}

function isPipNoiseLine(line: string): boolean {
	if (/^\s*Collecting\s/.test(line)) return true;
	if (/^\s*Downloading\s/.test(line)) return true;
	if (/^\s*[-━=]{5,}/.test(line)) return true;
	if (/^\s*Building wheel/.test(line)) return true;
	if (/^\s*Created wheel/.test(line)) return true;
	if (/^\s*Stored in directory/.test(line)) return true;
	if (/^\s*Using cached/.test(line)) return true;
	if (/^\[notice\]/.test(line)) return true;
	return false;
}
