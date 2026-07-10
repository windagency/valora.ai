/**
 * Shared credential-redaction patterns for tool/pipeline output text.
 *
 * Lives in valora-runtime (not src/security/) so both the CLI's
 * CredentialGuard and packages that cannot import from the root app's
 * private `src/` (e.g. valora-plugin-memory-vault) share one pattern list
 * instead of maintaining independent copies that can drift apart.
 */

export interface RedactionResult {
	redacted: boolean;
	result: string;
}

/**
 * Patterns for detecting credentials in tool output text.
 */
export const OUTPUT_CREDENTIAL_PATTERNS: RegExp[] = [
	// API keys with common prefixes (sk-ant-api03-..., sk-proj-..., etc.)
	/sk-[a-zA-Z0-9_-]{20,}/g,
	/pk-[a-zA-Z0-9_-]{20,}/g,
	/api[_-]?key[=:]\s*["']?[a-zA-Z0-9_-]{16,}/gi,
	// AWS access key IDs (long-term) and STS temporary session key IDs
	/A(?:KIA|SIA)[0-9A-Z]{16}/g,
	// AWS secret access keys have no fixed prefix (unlike the access key ID
	// above) — anchored to the common env-var/config key name to avoid
	// matching arbitrary base64-ish text. Charset includes `/`, unlike the
	// entropy fallback's deliberately narrower one (see its own comment) —
	// real AWS secret keys are base64 and often contain `/`.
	/aws[_-]?secret[_-]?access[_-]?key[=:]\s*["']?[A-Za-z0-9/+=]{20,}/gi,
	// GitHub tokens (PAT, OAuth, Actions, runner, App installation)
	/gh[opsru]_[A-Za-z0-9_]{36}/g,
	// GitHub fine-grained personal access tokens
	/github_pat_[A-Za-z0-9_]{20,}/g,
	// JWT — three base64url segments starting with eyJ (header), eyJ (payload), signature
	/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
	// Bearer tokens
	/Bearer\s+[a-zA-Z0-9_\-.]{20,}/g,
	// Generic long secrets (base64-ish with prefix)
	/(?:token|secret|password|credential)[=:]\s*["']?[a-zA-Z0-9+/=_-]{20,}/gi,
	// Private key blocks — consumes the whole body and footer, not just the
	// opening marker line, and covers RSA/EC/DSA/OPENSSH/encrypted variants
	// (any all-caps qualifier before "PRIVATE KEY"), not just RSA/unqualified.
	/-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z ]*PRIVATE\s+KEY-----/g,
	// Connection strings with credentials
	/(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi
];

const REDACTED = '[REDACTED]';

/**
 * Candidate substrings for the high-entropy fallback: 20+ contiguous
 * token-safe characters. Deliberately excludes `/` and `-` so file paths and
 * URLs (which are full of long slash/hyphen-joined runs) don't get swept into
 * one long "token" and false-positive on the entropy check.
 *
 * Known accepted limitation: excluding `-` means a secret deliberately
 * chunked into <20-char hyphen-separated runs (e.g. "abcd1234-efgh5678-...")
 * evades this fallback — each run alone is too short to trigger it. Named
 * prefix patterns above (sk-, gh_, AKIA, etc.) are unaffected since they
 * don't depend on this charset. Widening the charset to include `-` would
 * reopen the path/URL false-positive problem this comment describes solving;
 * this fallback is a last-resort heuristic layer, not a complete defence —
 * see the module docstring.
 */
const ENTROPY_CANDIDATE_PATTERN = /[A-Za-z0-9+=_]{20,}/g;

/**
 * Minimum Shannon entropy (bits/char) for the fallback to redact a candidate.
 * Calibrated so real camelCase identifiers (~4.0-4.2) and hex-only hashes
 * (max 4.0 for uniform hex) stay below the bar, while genuinely random
 * alphanumeric tokens (~5.0-5.9) clear it with margin.
 */
const ENTROPY_THRESHOLD_BITS_PER_CHAR = 4.5;

function shannonEntropy(value: string): number {
	const frequency = new Map<string, number>();
	for (const char of value) {
		frequency.set(char, (frequency.get(char) ?? 0) + 1);
	}

	let entropy = 0;
	for (const count of frequency.values()) {
		const probability = count / value.length;
		entropy -= probability * Math.log2(probability);
	}
	return entropy;
}

/**
 * Last-resort fallback for credentials that don't match any named pattern
 * (unknown vendor format, internal token scheme) and have no adjacent
 * "token"/"secret" keyword. Runs after all named patterns so those still take
 * precedence — this only evaluates whatever text they left behind.
 */
function redactHighEntropyTokens(content: string): RedactionResult {
	let result = content;
	let redacted = false;

	result = result.replace(ENTROPY_CANDIDATE_PATTERN, (candidate) => {
		if (shannonEntropy(candidate) >= ENTROPY_THRESHOLD_BITS_PER_CHAR) {
			redacted = true;
			return REDACTED;
		}
		return candidate;
	});

	return { redacted, result };
}

/**
 * Scan text for credential-shaped substrings and redact them.
 */
export function redactCredentials(content: string): RedactionResult {
	if (!content || typeof content !== 'string') return { redacted: false, result: content };

	let result = content;
	let redacted = false;

	for (const pattern of OUTPUT_CREDENTIAL_PATTERNS) {
		const regex = new RegExp(pattern.source, pattern.flags);
		if (regex.test(result)) {
			redacted = true;
			result = result.replace(new RegExp(pattern.source, pattern.flags), REDACTED);
		}
	}

	const entropyResult = redactHighEntropyTokens(result);
	result = entropyResult.result;
	redacted = redacted || entropyResult.redacted;

	return { redacted, result };
}
