import { describe, expect, it } from 'vitest';

import { redactCredentials } from './credential-redaction';

describe('redactCredentials', () => {
	it('redacts an Anthropic-style API key', () => {
		const { redacted, result } = redactCredentials('key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
		expect(redacted).toBe(true);
		expect(result).not.toContain('sk-ant-api03');
		expect(result).toContain('[REDACTED]');
	});

	it('redacts a GitHub personal access token', () => {
		const { redacted, result } = redactCredentials('token=ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
		expect(redacted).toBe(true);
		expect(result).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
	});

	it('redacts an AWS access key', () => {
		const { redacted, result } = redactCredentials('AKIAABCDEFGHIJKLMNOP');
		expect(redacted).toBe(true);
		expect(result).toContain('[REDACTED]');
	});

	it('redacts the full body and footer of a private-key block, not just the header line', () => {
		// The old pattern (`-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----`, no body
		// consumption) only matched the opening marker line — the actual base64
		// key material and the `-----END...-----` footer passed through
		// completely unredacted.
		const pem =
			'-----BEGIN RSA PRIVATE KEY-----\n' +
			'MIIEpAIBAAKCAQEA1c7+9z5Pad7OejecsQ0bu3aumnAxuNooB6VD3TFReQFRAg==\n' +
			'-----END RSA PRIVATE KEY-----';
		const { redacted, result } = redactCredentials(pem);
		expect(redacted).toBe(true);
		expect(result).not.toContain('MIIEpAIBAAKCAQEA1c7');
		expect(result).not.toContain('-----END RSA PRIVATE KEY-----');
	});

	it('does not let a decoy inner BEGIN/END pair make the match stop before the real secret and real footer', () => {
		// Lazy [\s\S]*? stops at the FIRST position satisfying the terminator
		// — a decoy inner BEGIN/END block embedded inside real key material
		// makes it stop there, leaking everything after: the real secret's
		// back half plus the real footer. Live-verified before this fix.
		const withDecoy =
			'-----BEGIN RSA PRIVATE KEY-----\n' +
			'-----BEGIN FAKE PRIVATE KEY-----\n' +
			'-----END FAKE PRIVATE KEY-----\n' +
			'REALSECRETBACKHALF_SHOULD_THIS_LEAK\n' +
			'-----END RSA PRIVATE KEY-----';
		const { redacted, result } = redactCredentials(withDecoy);
		expect(redacted).toBe(true);
		expect(result).not.toContain('REALSECRETBACKHALF_SHOULD_THIS_LEAK');
		expect(result).not.toContain('-----END RSA PRIVATE KEY-----');
	});

	it('redacts two separate real private-key blocks in one string, each fully', () => {
		const twoKeys =
			'-----BEGIN RSA PRIVATE KEY-----\nSECRETONE\n-----END RSA PRIVATE KEY-----\n' +
			'plain text between\n' +
			'-----BEGIN EC PRIVATE KEY-----\nSECRETTWO\n-----END EC PRIVATE KEY-----';
		const { redacted, result } = redactCredentials(twoKeys);
		expect(redacted).toBe(true);
		expect(result).not.toContain('SECRETONE');
		expect(result).not.toContain('SECRETTWO');
	});

	it('redacts a truncated private-key block with no closing footer (streamed/cut-off tool output)', () => {
		// Regression guard: requiring a footer to match at all meant a
		// genuinely truncated key (a real case for streamed/cut-off stderr)
		// passed through completely unredacted, including the header line the
		// OLD (pre-body-consumption) pattern would have caught on its own.
		const truncated = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...';
		const { redacted, result } = redactCredentials(truncated);
		expect(redacted).toBe(true);
		expect(result).toContain('[REDACTED]');
		expect(result).not.toContain('MIIEowIBAAKCAQEA');
	});

	it('redacts EC/OPENSSH private-key blocks, not just RSA', () => {
		const pem =
			'-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ==\n-----END OPENSSH PRIVATE KEY-----';
		const { redacted, result } = redactCredentials(pem);
		expect(redacted).toBe(true);
		expect(result).not.toContain('b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ==');
	});

	it('redacts a GitHub OAuth token (gho_ prefix)', () => {
		const { redacted, result } = redactCredentials('token=gho_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
		expect(redacted).toBe(true);
		expect(result).not.toContain('gho_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
	});

	it('redacts a GitHub fine-grained personal access token (github_pat_ prefix)', () => {
		const { redacted, result } = redactCredentials(
			'token=github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ'
		);
		expect(redacted).toBe(true);
		expect(result).not.toContain('github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ');
	});

	it('redacts an AWS secret access key even when it contains a "/" (base64 charset the entropy fallback excludes)', () => {
		const { redacted, result } = redactCredentials('aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
		expect(redacted).toBe(true);
		expect(result).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
	});

	it('redacts a database connection string with embedded credentials', () => {
		const { redacted, result } = redactCredentials('postgres://user:hunter2@db.example.com:5432/app');
		expect(redacted).toBe(true);
		expect(result).not.toContain('hunter2');
	});

	it('leaves non-credential text untouched and reports redacted=false', () => {
		const { redacted, result } = redactCredentials('the quick brown fox jumps over the lazy dog');
		expect(redacted).toBe(false);
		expect(result).toBe('the quick brown fox jumps over the lazy dog');
	});

	it('passes through non-string input unchanged', () => {
		const { redacted, result } = redactCredentials(undefined as unknown as string);
		expect(redacted).toBe(false);
		expect(result).toBe(undefined);
	});

	describe('high-entropy fallback (no adjacent credential keyword)', () => {
		it('redacts a high-entropy token with no credential keyword nearby', () => {
			const highEntropy = 'xK9mP2vQrL4nJ8wZ1aY5bC7dF3gH6eI0jU2kM9nR5s';
			const { redacted, result } = redactCredentials(`Response header value: ${highEntropy}`);
			expect(redacted).toBe(true);
			expect(result).not.toContain(highEntropy);
		});

		it('does not redact a 40-char git SHA', () => {
			const sha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
			const { redacted, result } = redactCredentials(`commit ${sha}`);
			expect(redacted).toBe(false);
			expect(result).toContain(sha);
		});

		it('does not redact a repeated low-entropy string', () => {
			const lowEntropy = 'a'.repeat(42);
			const { result } = redactCredentials(`Padding value: ${lowEntropy}`);
			expect(result).toContain(lowEntropy);
		});

		it('does not redact a camelCase identifier', () => {
			const identifier = 'extractFromFeedbackOutputsSessionId';
			const { result } = redactCredentials(`Called ${identifier} with args`);
			expect(result).toContain(identifier);
		});

		it('does not redact a file path (contains slashes/hyphens, no single 20+ char run)', () => {
			const output = 'Scanning /workspace/project/node_modules/some-package/dist/index.js for issues';
			const { result } = redactCredentials(output);
			expect(result).toBe(output);
		});
	});
});
