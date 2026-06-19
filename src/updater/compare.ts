/**
 * Semver comparison utilities (no external dependencies).
 *
 * Supports: major.minor.patch with optional prerelease (`-rc.1`) and build
 * metadata (`+build`). Build metadata is stripped before comparison. A
 * version with a prerelease tag is less than the same version without one.
 */

interface ParsedVersion {
	major: number;
	minor: number;
	patch: number;
	prerelease: null | string[];
}

function parse(version: string): null | ParsedVersion {
	if (typeof version !== 'string' || version.length === 0) return null;

	// Strip build metadata
	const plusIdx = version.indexOf('+');
	const withoutBuild = plusIdx === -1 ? version : version.slice(0, plusIdx);

	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/.exec(withoutBuild);
	if (!match) return null;

	const [, maj, min, pat, pre] = match;
	const major = Number(maj);
	const minor = Number(min);
	const patch = Number(pat);

	if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
		return null;
	}

	return {
		major,
		minor,
		patch,
		prerelease: pre ? pre.split('.') : null
	};
}

// Returns positive when b-identifier > a-identifier, negative when a > b, 0 when equal.
function compareIdentifier(av: string, bv: string): number {
	const aIsNum = /^\d+$/.test(av);
	const bIsNum = /^\d+$/.test(bv);
	if (aIsNum && bIsNum) {
		const diff = Number(bv) - Number(av);
		return diff === 0 ? 0 : diff > 0 ? 1 : -1;
	}
	if (aIsNum) return 1; // numeric < alphanumeric per semver
	if (bIsNum) return -1;
	return av < bv ? 1 : av > bv ? -1 : 0;
}

/**
 * Returns positive when b > a, negative when a > b, zero when equal.
 * Per semver: a release version has higher precedence than a prerelease;
 * numeric identifiers have lower precedence than alphanumeric ones.
 */
function comparePrerelease(a: null | string[], b: null | string[]): number {
	if (a === null && b === null) return 0;
	if (a === null) return -1; // a is release, b is prerelease → a > b
	if (b === null) return 1; // b is release, a is prerelease → b > a

	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const av = a[i];
		const bv = b[i];
		if (av === undefined) return 1; // b has more identifiers → b > a
		if (bv === undefined) return -1; // a has more identifiers → a > b
		const cmp = compareIdentifier(av, bv);
		if (cmp !== 0) return cmp;
	}
	return 0;
}

/**
 * Returns true when `latest` is strictly newer than `current`.
 * Returns false on malformed input or equal versions.
 */
export function isNewerVersion(current: string, latest: string): boolean {
	const a = parse(current);
	const b = parse(latest);
	if (!a || !b) return false;

	if (a.major !== b.major) return b.major > a.major;
	if (a.minor !== b.minor) return b.minor > a.minor;
	if (a.patch !== b.patch) return b.patch > a.patch;

	return comparePrerelease(a.prerelease, b.prerelease) > 0;
}
