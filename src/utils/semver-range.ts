/**
 * Minimal semver range checker for plugin engine compatibility.
 *
 * Supports the subset of node-semver actually used by Valora plugin manifests:
 *   • exact match           — "1.2.3"
 *   • comparators           — ">=1.2.3", ">1.2.3", "<=1.2.3", "<1.2.3"
 *   • caret ranges          — "^1.2.3" (>=1.2.3 <2.0.0)
 *   • tilde ranges          — "~1.2.3" (>=1.2.3 <1.3.0)
 *   • space-joined AND      — ">=1.0.0 <2.0.0"
 *   • wildcard              — "*" or empty/undefined
 *
 * Pre-release and build metadata, OR-joined ranges, x-ranges, and the
 * 0.x caret special-case are intentionally not supported. If a manifest
 * needs anything beyond the above, the range is rejected.
 */

const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;
const COMPARATOR_REGEX = /^(>=|<=|>|<|=|\^|~)?\s*(\d+)\.(\d+)\.(\d+)$/;

interface Comparator {
	operator: '<' | '<=' | '=' | '>' | '>=';
	version: ParsedVersion;
}

interface ParsedVersion {
	major: number;
	minor: number;
	patch: number;
}

export function satisfiesSemverRange(version: string, range: string | undefined): boolean {
	if (range === undefined || range.trim() === '' || range.trim() === '*') return true;

	const parsedVersion = parseVersion(version);
	if (!parsedVersion) return false;

	const comparators = expandRange(range.trim());
	if (comparators === null) return false;

	return comparators.every((c) => evaluateComparator(parsedVersion, c));
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	return a.patch - b.patch;
}

function evaluateComparator(version: ParsedVersion, comparator: Comparator): boolean {
	const cmp = compareVersions(version, comparator.version);
	switch (comparator.operator) {
		case '<':
			return cmp < 0;
		case '<=':
			return cmp <= 0;
		case '=':
			return cmp === 0;
		case '>':
			return cmp > 0;
		case '>=':
			return cmp >= 0;
	}
}

function expandComparator(token: string): Comparator[] | null {
	const match = token.match(COMPARATOR_REGEX);
	if (!match) return null;

	const op = match[1] ?? '=';
	const version: ParsedVersion = {
		major: Number(match[2]),
		minor: Number(match[3]),
		patch: Number(match[4])
	};

	if (op === '^') {
		return [
			{ operator: '>=', version },
			{ operator: '<', version: { major: version.major + 1, minor: 0, patch: 0 } }
		];
	}

	if (op === '~') {
		return [
			{ operator: '>=', version },
			{ operator: '<', version: { major: version.major, minor: version.minor + 1, patch: 0 } }
		];
	}

	return [{ operator: op as Comparator['operator'], version }];
}

function expandRange(range: string): Comparator[] | null {
	const tokens = range.split(/\s+/).filter((t) => t.length > 0);
	const comparators: Comparator[] = [];
	for (const token of tokens) {
		const expanded = expandComparator(token);
		if (!expanded) return null;
		comparators.push(...expanded);
	}
	return comparators;
}

function parseVersion(input: string): null | ParsedVersion {
	const match = input.trim().match(VERSION_REGEX);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3])
	};
}
