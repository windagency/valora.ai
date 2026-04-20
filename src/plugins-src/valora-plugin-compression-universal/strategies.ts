const GIT_LOG_MAX_ENTRIES = 20;
const MAX_GREP_OUTPUT_LINES = 200; // mirrors config/constants.ts

export function filterDocker(output: string, _command: string): string {
	return output
		.split('\n')
		.filter((line) => !isDockerProgressLine(line))
		.join('\n');
}

export function filterGit(output: string, command: string): string {
	const subMatch = command.match(/git\s+(\w+)/);
	const sub = subMatch?.[1] ?? '';
	const subFilters: Record<string, (o: string) => string> = {
		diff: filterGitDiff,
		log: filterGitLog,
		status: filterGitStatus
	};
	return (subFilters[sub] ?? ((o: string) => o))(output);
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
	const deduped: string[] = [];
	for (const line of lines) {
		if (!seen.has(line)) {
			seen.add(line);
			deduped.push(line);
		}
	}
	return deduped.slice(0, MAX_GREP_OUTPUT_LINES).join('\n');
}

function extractSubject(line: string): string {
	const trimmed = line.trim();
	return trimmed && !isCommitMetaLine(line) ? trimmed : '';
}

function filterGitDiff(output: string): string {
	return output
		.split('\n')
		.filter((line) => !isGitDiffMetaLine(line))
		.join('\n');
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

function isCommitMetaLine(line: string): boolean {
	return /^(Author:|Date:|Merge:)/.test(line.trim());
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
