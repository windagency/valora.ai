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
