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
	const lines = output.split('\n');
	const result: string[] = [];
	let addedCount = 0;

	const flushAdded = (): void => {
		if (addedCount > 0) {
			result.push(`[${addedCount} packages added]`);
			addedCount = 0;
		}
	};

	for (const line of lines) {
		if (isPackageManagerNoise(line)) continue;
		if (/^\+ \S+@\S+/.test(line)) {
			addedCount++;
			continue;
		}
		flushAdded();
		result.push(line);
	}

	flushAdded();
	return result.join('\n');
}

export function filterTestRunner(output: string, _command: string): string {
	const lines = collapseCoverageTables(output.split('\n'));
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
	let lines = output.split('\n');
	if (lines.some((l) => /^\[\d+:\d+:\d+ [AP]M\]/.test(l))) lines = extractLastWatchCycle(lines);
	if (lines.some((l) => /^={8} Resolving module /.test(l))) lines = foldTraceResolution(lines);
	const errorsByCode = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		if (isCodeFrameLine(line)) continue;
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

function collapseCoverageTables(lines: string[]): string[] {
	const result: string[] = [];
	let fileCount = 0;
	let overall = '';
	let inTable = false;

	const flushTable = (): void => {
		result.push(`[coverage: ${fileCount} files, overall ${overall}%]`);
		fileCount = 0;
		overall = '';
		inTable = false;
	};

	for (const line of lines) {
		if (/^\s*%\s*Coverage report/.test(line)) {
			inTable = true;
			continue;
		}
		if (!inTable) {
			result.push(line);
			continue;
		}
		if (isCoverageTableNoiseLine(line)) continue;
		const allFilesMatch = line.match(/^All files\s*\|\s*([\d.]+)/);
		if (allFilesMatch) {
			overall = allFilesMatch[1] ?? '';
			continue;
		}
		if (/^\s+\S/.test(line) && line.includes('|')) {
			fileCount++;
			continue;
		}
		flushTable();
		result.push(line);
	}

	if (inTable) flushTable();
	return result;
}

function extractLastWatchCycle(lines: string[]): string[] {
	const MARKER = /^\[\d+:\d+:\d+ [AP]M\] (Starting compilation in watch mode|File change detected)/;
	let lastIdx = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (MARKER.test(lines[i] ?? '')) {
			lastIdx = i;
			break;
		}
	}
	return lastIdx >= 0 ? lines.slice(lastIdx) : lines;
}

function foldTraceResolution(lines: string[]): string[] {
	const result: string[] = [];
	let inBlock = false;
	for (const line of lines) {
		if (/^={8} Resolving module /.test(line)) {
			inBlock = true;
			continue;
		}
		if (/^={8} Module name /.test(line)) {
			result.push(line);
			inBlock = false;
			continue;
		}
		if (!inBlock) result.push(line);
	}
	return result;
}

function isCodeFrameLine(line: string): boolean {
	if (/^\s*\d+\s/.test(line)) return true;
	if (/^\s*[~^]+\s*$/.test(line)) return true;
	return false;
}

function isCoverageTableNoiseLine(line: string): boolean {
	if (/^-+\|/.test(line)) return true;
	if (/^-+/.test(line.trim())) return true;
	if (/File\s+\|/.test(line)) return true;
	return false;
}

function isPackageManagerNoise(line: string): boolean {
	if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) return true;
	if (/^Progress:/.test(line)) return true;
	if (/^npm warn/i.test(line)) return true;
	if (/^warning /i.test(line)) return true;
	if (/^warning ".+ >/.test(line)) return true;
	if (/^found \d+ vulnerabilit/i.test(line)) return true;
	if (/^npm notice/i.test(line)) return true;
	if (/\d+\s+packages?\s+are?\s+looking\s+for\s+funding/i.test(line)) return true;
	if (/npm\s+fund/i.test(line)) return true;
	return false;
}
