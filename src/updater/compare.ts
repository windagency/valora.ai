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
	prerelease: string[] | null;
}

function parse(version: string): ParsedVersion | null {
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
		prerelease: pre ? pre.split('.') : null,
	};
}

/**
 * Returns positive when b > a, negative when a > b, zero when equal.
 * Per semver: a release version has higher precedence than a prerelease;
 * numeric identifiers have lower precedence than alphanumeric ones.
 */
function comparePrerelease(a: string[] | null, b: string[] | null): number {
	if (a === null && b === null) return 0;
	if (a === null) return -1; // a is release, b is prerelease → a > b → return negative
	if (b === null) return 1; // a is prerelease, b is release → b > a → return positive

	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const av = a[i];
		const bv = b[i];
		// Longer identifier chain wins when prefixes are equal
		if (av === undefined) return 1; // b has more → b > a
		if (bv === undefined) return -1; // a has more → a > b

		const aNum = /^\d+$/.test(av) ? Number(av) : null;
		const bNum = /^\d+$/.test(bv) ? Number(bv) : null;

		if (aNum !== null && bNum !== null) {
			if (aNum !== bNum) return aNum < bNum ? 1 : -1;
		} else if (aNum !== null) {
			// numeric < alphanumeric → a is lower → b > a
			return 1;
		} else if (bNum !== null) {
			return -1;
		} else if (av !== bv) {
			return av < bv ? 1 : -1;
		}
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
