const TSC_MAX_EXAMPLES_PER_CODE = 3;
const ESLINT_MAX_EXAMPLES_PER_RULE = 2;

export function filterEslint(output: string, _command: string): string {
	const lines = output.split('\n');
	const byRule = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		const match = line.match(/^\s+\d+:\d+\s+(error|warning)\s+(\S+)/);
		if (match) {
			const rule = match[2] ?? '';
			const bucket = byRule.get(rule);
			if (!bucket) {
				byRule.set(rule, [line]);
			} else if (bucket.length < ESLINT_MAX_EXAMPLES_PER_RULE) {
				bucket.push(line);
			} else if (bucket.length === ESLINT_MAX_EXAMPLES_PER_RULE) {
				bucket.push(`  ... (more ${rule} violations)`);
			}
		} else {
			other.push(line);
		}
	}

	return [...other, ...[...byRule.values()].flat()].join('\n');
}

export function filterPackageManager(output: string, _command: string): string {
	return output
		.split('\n')
		.filter((line) => !isPackageManagerNoise(line))
		.join('\n');
}

export function filterTestRunner(output: string, _command: string): string {
	const lines = output.split('\n');
	const kept: string[] = [];
	let passCount = 0;

	const flushPassCount = (): void => {
		if (passCount > 0) {
			kept.push(`[${passCount} test suite${passCount === 1 ? '' : 's'} passed]`);
			passCount = 0;
		}
	};

	for (const line of lines) {
		const isPassLine = /^\s*(✓|PASS\b|passed\b)/.test(line);
		const isFailLine = /^\s*(✗|✕|FAIL\b|×)/.test(line);
		const isSummaryLine = /^(Tests?|Test Files?|Suites?|Duration|Time|Ran all)/.test(line);

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

export function filterTsc(output: string, _command: string): string {
	const lines = output.split('\n');
	const errorsByCode = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		const match = line.match(/: (error|warning) (TS\d+):/);
		if (match) {
			const code = match[2] ?? '';
			const bucket = errorsByCode.get(code);
			if (!bucket) {
				errorsByCode.set(code, [line]);
			} else if (bucket.length < TSC_MAX_EXAMPLES_PER_CODE) {
				bucket.push(line);
			} else if (bucket.length === TSC_MAX_EXAMPLES_PER_CODE) {
				bucket.push(`  ... (more ${code} errors)`);
			}
		} else {
			other.push(line);
		}
	}

	return [...other, ...[...errorsByCode.values()].flat()].join('\n');
}

function isPackageManagerNoise(line: string): boolean {
	if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) return true;
	if (/^Progress:/.test(line)) return true;
	if (/^npm warn/i.test(line)) return true;
	if (/^warning /i.test(line)) return true;
	if (/^npm warn deprecated/i.test(line)) return true;
	if (/^warning ".+ >/.test(line)) return true;
	if (/^found \d+ vulnerabilit/i.test(line)) return true;
	return false;
}
