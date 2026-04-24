const GIT_DIFF_MAX_PLUS_LINES_PER_HUNK = 15;
const GIT_LOG_MAX_ENTRIES = 20;
const MAX_GREP_OUTPUT_LINES = 200;
const MAX_RG_MATCHES_PER_FILE = 5;
const MAX_LS_ENTRIES = 50;
const MAX_CAT_LINES = 100;
const MAX_CURL_BODY_LINES = 50;
const MAX_JSON_LINES = 50;
const MAX_JSON_STRING_LENGTH = 80;

export function filterCat(output: string, _command: string): string {
	const lines = output.split('\n');
	if (lines.length <= MAX_CAT_LINES) return output;
	const hidden = lines.length - MAX_CAT_LINES;
	return [...lines.slice(0, MAX_CAT_LINES), `[... ${hidden} more lines]`].join('\n');
}

export function filterCurl(output: string, command: string): string {
	const isWget = /\bwget\b/.test(command);
	const filtered = output.split('\n').filter((line) => (isWget ? !isWgetNoiseLine(line) : !isCurlProgressLine(line)));
	if (filtered.length <= MAX_CURL_BODY_LINES) return filtered.join('\n');
	const hidden = filtered.length - MAX_CURL_BODY_LINES;
	return [...filtered.slice(0, MAX_CURL_BODY_LINES), `[... ${hidden} more lines]`].join('\n');
}

export function filterDiff(output: string, _command: string): string {
	return filterUnifiedDiff(output);
}

export function filterDocker(output: string, command: string): string {
	if (/docker(-compose)?\s+(compose\s+)?ps\b/.test(command) || /docker-compose\s+ps\b/.test(command)) {
		return filterDockerPs(output);
	}
	if (/docker\s+images?\b/.test(command)) {
		return filterDockerImages(output);
	}
	if (/docker\s+logs?\b/.test(command)) {
		return filterDockerLogs(output);
	}
	return output
		.split('\n')
		.filter((line) => !isDockerProgressLine(line) && !isBuildKitNoiseLine(line) && !isBuildKitExtendedNoiseLine(line))
		.join('\n');
}

export function filterGh(output: string, command: string): string {
	if (/gh\s+run\s+list\b/.test(command)) return filterGhRunList(output);
	return output;
}

export function filterGit(output: string, command: string): string {
	const subMatch = command.match(/git\s+(\w+)/);
	const sub = subMatch?.[1] ?? '';
	const subFilters: Record<string, (_: string) => string> = {
		diff: filterUnifiedDiff,
		log: filterGitLog,
		show: filterGitShow,
		status: filterGitStatus
	};
	return (subFilters[sub] ?? ((_o: string) => _o))(output);
}

export function filterJson(output: string, _command: string): string {
	const lines = output.split('\n');
	const truncated = lines.map((line) =>
		line.replace(/"([^"]{80,})"/g, (_, s: string) => `"${s.slice(0, MAX_JSON_STRING_LENGTH - 3)}..."`)
	);
	if (truncated.length <= MAX_JSON_LINES) return truncated.join('\n');
	const hidden = truncated.length - MAX_JSON_LINES;
	return [...truncated.slice(0, MAX_JSON_LINES), `[... ${hidden} more lines]`].join('\n');
}

export function filterLog(output: string, _command: string): string {
	return deduplicateLogLines(output.split('\n')).join('\n');
}

export function filterLs(output: string, _command: string): string {
	const lines = output.split('\n');
	const result: string[] = [];
	let hidden = 0;

	for (const line of lines) {
		if (!line.trim() || /^total \d+/.test(line)) continue;
		const formatted = formatLsLine(line);
		if (formatted === null) continue;
		if (result.length >= MAX_LS_ENTRIES) {
			hidden++;
		} else {
			result.push(formatted);
		}
	}

	if (hidden > 0) result.push(`[... ${hidden} more entries]`);
	return result.join('\n');
}

export function filterMake(output: string, _command: string): string {
	return output
		.split('\n')
		.filter((line) => !/^make\[\d+\]: (Entering|Leaving) directory/.test(line))
		.join('\n');
}

export function filterRg(output: string, _command: string): string {
	const lines = output.split('\n');
	const seen = new Set<string>();
	const fileMatchCounts = new Map<string, number>();
	const result: string[] = [];

	for (const line of lines) {
		if (seen.has(line)) continue;
		seen.add(line);

		const fileMatch = line.match(/^([^:\n]+?):(.*)/);
		if (!fileMatch) {
			result.push(line);
			continue;
		}

		const filePath = fileMatch[1] ?? '';
		const count = fileMatchCounts.get(filePath) ?? 0;
		fileMatchCounts.set(filePath, count + 1);
		if (count < MAX_RG_MATCHES_PER_FILE) {
			result.push(line);
		} else {
			const basename = filePath.split('/').pop() ?? filePath;
			applyFileCapSummary(result, count, basename);
		}
	}

	return result.slice(0, MAX_GREP_OUTPUT_LINES).join('\n');
}

function applyFileCapSummary(result: string[], count: number, basename: string): void {
	const hidden = count + 1 - MAX_RG_MATCHES_PER_FILE;
	const summaryLine = `[... ${hidden} more in ${basename}]`;
	if (count === MAX_RG_MATCHES_PER_FILE) {
		result.push(summaryLine);
		return;
	}
	let lastIdx = -1;
	for (let j = result.length - 1; j >= 0; j--) {
		if (result[j]?.endsWith(` in ${basename}]`)) {
			lastIdx = j;
			break;
		}
	}
	if (lastIdx >= 0) result[lastIdx] = summaryLine;
}

function deduplicateLogLines(lines: string[]): string[] {
	const result: string[] = [];
	let prevMsg = '';
	let repeatCount = 0;

	const flush = (): void => {
		if (repeatCount > 1) result.push(`[repeated ${repeatCount} times]`);
		repeatCount = 0;
	};

	for (const line of lines) {
		const msg = line.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(\s?[+-]\d{4}|Z)?\s+/, '');
		if (msg === prevMsg && msg) {
			repeatCount++;
		} else {
			flush();
			result.push(line);
			prevMsg = msg;
			repeatCount = 1;
		}
	}
	flush();
	return result;
}

function extractSubject(line: string): string {
	const trimmed = line.trim();
	return trimmed && !isCommitMetaLine(line) ? trimmed : '';
}

function filterDockerImages(output: string): string {
	return output
		.split('\n')
		.map((line) => line.replace(/\s+[0-9a-f]{12}\s+/, '  '))
		.join('\n');
}

function filterDockerLogs(output: string): string {
	return deduplicateLogLines(output.split('\n')).join('\n');
}

function filterDockerPs(output: string): string {
	return output
		.split('\n')
		.map((line) => line.replace(/\s+"[^"]*"\s+/, '  '))
		.join('\n');
}

function filterGhRunList(output: string): string {
	const lines = output.split('\n');
	const result: string[] = [];
	let successCount = 0;

	const flush = (): void => {
		if (successCount > 0) {
			result.push(`[${successCount} successful runs]`);
			successCount = 0;
		}
	};

	for (const line of lines) {
		if (/\bsuccess\b/i.test(line) && !/\bfail/i.test(line)) {
			successCount++;
		} else {
			flush();
			result.push(line);
		}
	}
	flush();
	return result.join('\n');
}

function filterGitLog(output: string): string {
	const lines = output.split('\n');
	const entries: string[] = [];
	let currentHash = '';
	let currentSubject = '';

	for (const line of lines) {
		const commitMatch = line.match(/^commit ([0-9a-f]{7,40})/);
		if (commitMatch) {
			if (currentHash) entries.push(`${currentHash.slice(0, 7)} ${currentSubject}`);
			if (entries.length >= GIT_LOG_MAX_ENTRIES) break;
			currentHash = commitMatch[1] ?? '';
			currentSubject = '';
		} else if (currentHash && !currentSubject) {
			currentSubject = extractSubject(line);
		}
	}

	if (currentHash && entries.length < GIT_LOG_MAX_ENTRIES) {
		entries.push(`${currentHash.slice(0, 7)} ${currentSubject}`);
	}

	return entries.join('\n');
}

function filterGitShow(output: string): string {
	const lines = output.split('\n');
	const diffStart = lines.findIndex((l) => l.startsWith('diff --git '));
	if (diffStart === -1) return output;

	const header = lines.slice(0, diffStart);
	const hashLine = header.find((l) => l.startsWith('commit '));
	const hash = hashLine?.match(/^commit ([0-9a-f]{7,})/)?.[1]?.slice(0, 7) ?? '';
	let subject = '';
	for (const line of header) {
		const trimmed = line.trim();
		if (trimmed && !isCommitMetaLine(line) && !line.startsWith('commit ')) {
			subject = trimmed;
			break;
		}
	}

	const diffBody = filterUnifiedDiff(lines.slice(diffStart).join('\n'));
	return [`${hash} ${subject}`, diffBody].filter(Boolean).join('\n');
}

function filterGitStatus(output: string): string {
	const lines = output.split('\n').filter((l) => l.trim());
	const kept: string[] = [];

	for (const line of lines) {
		if (/^(On branch|HEAD detached|No commits)/.test(line)) {
			kept.push(line);
			continue;
		}
		if (/^\t(modified|new file|deleted|renamed|copied|both|Untracked)/.test(line)) {
			kept.push(line.trim());
			continue;
		}
		if (/^(Changes|Untracked|nothing|Your branch)/.test(line)) {
			kept.push(line);
			continue;
		}
	}

	return kept.join('\n');
}

function filterUnifiedDiff(output: string): string {
	const lines = output.split('\n');
	const result: string[] = [];
	let plusCount = 0;
	let minusCount = 0;
	let hiddenPlus = 0;
	let hiddenMinus = 0;

	const flushHiddenPlus = (): void => {
		if (hiddenPlus > 0) {
			result.push(`[... ${hiddenPlus} more +lines]`);
			hiddenPlus = 0;
		}
	};

	const flushHiddenMinus = (): void => {
		if (hiddenMinus > 0) {
			result.push(`[... ${hiddenMinus} more -lines]`);
			hiddenMinus = 0;
		}
	};

	const flushHidden = (): void => {
		flushHiddenPlus();
		flushHiddenMinus();
	};

	for (const line of lines) {
		if (isGitDiffMetaLine(line)) continue;
		if (line.startsWith('@@ ')) {
			flushHidden();
			plusCount = 0;
			minusCount = 0;
			result.push(line);
		} else if (line.startsWith('+') && !line.startsWith('+++')) {
			flushHiddenMinus();
			if (plusCount < GIT_DIFF_MAX_PLUS_LINES_PER_HUNK) {
				plusCount++;
				result.push(line);
			} else {
				hiddenPlus++;
			}
		} else if (line.startsWith('-') && !line.startsWith('---')) {
			flushHiddenPlus();
			if (minusCount < GIT_DIFF_MAX_PLUS_LINES_PER_HUNK) {
				minusCount++;
				result.push(line);
			} else {
				hiddenMinus++;
			}
		} else {
			flushHidden();
			result.push(line);
		}
	}
	flushHidden();
	return result.join('\n');
}

function formatLsLine(line: string): null | string {
	const m = line.match(/^([-dlcbspT]\S+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+(.+)$/);
	if (!m) return line;
	const name = (m[3] ?? '').trim();
	if (name === '.' || name === '..') return null;
	const size = m[2] ?? '';
	const isDir = m[1]?.[0] === 'd';
	return `${size.padStart(8)}  ${name}${isDir ? '/' : ''}`;
}

function isBuildKitExtendedNoiseLine(line: string): boolean {
	if (/^-{4,}$/.test(line)) return true;
	if (/^ > \[/.test(line)) return true;
	if (/^\d+\.\d+ /.test(line)) return true;
	if (/^Dockerfile\d*:\d+$/.test(line)) return true;
	if (/^\s+\d+ \|/.test(line)) return true;
	if (/^#\d+ \d+\.\d+ \t(--|from )/.test(line)) return true;
	return false;
}

function isBuildKitNoiseLine(line: string): boolean {
	if (/^#0 /.test(line)) return true;
	if (/^#\d+ \[internal\]/.test(line)) return true;
	if (/^#\d+ transferring /.test(line)) return true;
	if (/^#\d+ sha256:[0-9a-f]{64}/.test(line)) return true;
	if (/^#\d+ extracting sha256:/.test(line)) return true;
	if (/^#\d+ resolve /.test(line)) return true;
	if (/^#\d+ \d+\.\d+ \s*(Collecting|Downloading)\s/.test(line)) return true;
	if (/^#\d+ \d+\.\d+ .*━/.test(line)) return true;
	if (/^#\d+ \d+\.\d+ \s*\[notice\]/.test(line)) return true;
	return false;
}

function isCommitMetaLine(line: string): boolean {
	return /^(Author:|Date:|Merge:)/.test(line.trim());
}

function isCurlProgressLine(line: string): boolean {
	if (/^\s*%\s+Total\s+%\s+Received/.test(line)) return true;
	if (/^\s+Dload\s+Upload/.test(line)) return true;
	if (/^\s*\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+/.test(line)) return true;
	return false;
}

function isDockerProgressLine(line: string): boolean {
	if (/^Pulling from /.test(line)) return true;
	if (/^Pulling fs layer/.test(line)) return true;
	if (/^Waiting$/.test(line.trim())) return true;
	if (/^Downloading/.test(line)) return true;
	if (/^Extracting/.test(line)) return true;
	if (/^Pull complete/.test(line)) return true;
	if (/^Already exists/.test(line)) return true;
	return false;
}

function isGitDiffMetaLine(line: string): boolean {
	if (/^index [0-9a-f]+\.\.[0-9a-f]+/.test(line)) return true;
	if (/^(old|new) mode \d+$/.test(line)) return true;
	return false;
}

function isWgetNoiseLine(line: string): boolean {
	if (/\d+%\[=+>?\s*\]/.test(line)) return true;
	return false;
}
