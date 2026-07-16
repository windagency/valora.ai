import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialGuard, getCredentialGuard, resetCredentialGuard } from './credential-guard';

// Mock logger with a stable spy (not recreated per getLogger() call) so tests can assert on it
const loggerWarn = vi.fn();
vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: loggerWarn
	})
}));

describe('CredentialGuard', () => {
	let guard: CredentialGuard;

	beforeEach(() => {
		resetCredentialGuard();
		guard = new CredentialGuard();
		loggerWarn.mockClear();
	});

	afterEach(() => {
		guard.clearEvents();
	});

	describe('isSensitiveEnvVar', () => {
		it('blocks API key patterns', () => {
			expect(guard.isSensitiveEnvVar('ANTHROPIC_API_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('OPENAI_API_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('MY_SERVICE_API_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('STRIPE_API_KEY')).toBe(true);
		});

		it('blocks token patterns', () => {
			expect(guard.isSensitiveEnvVar('GITHUB_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('NPM_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('AUTH_TOKEN')).toBe(true);
		});

		it('blocks secret patterns', () => {
			expect(guard.isSensitiveEnvVar('JWT_SECRET')).toBe(true);
			expect(guard.isSensitiveEnvVar('APP_SECRET')).toBe(true);
		});

		it('blocks password patterns', () => {
			expect(guard.isSensitiveEnvVar('DB_PASSWORD')).toBe(true);
			expect(guard.isSensitiveEnvVar('ADMIN_PASSWORD')).toBe(true);
		});

		it('blocks provider prefixes', () => {
			expect(guard.isSensitiveEnvVar('ANTHROPIC_MODEL')).toBe(true);
			expect(guard.isSensitiveEnvVar('OPENAI_ORG')).toBe(true);
			expect(guard.isSensitiveEnvVar('AWS_ACCESS_KEY_ID')).toBe(true);
			expect(guard.isSensitiveEnvVar('AZURE_SUBSCRIPTION')).toBe(true);
			expect(guard.isSensitiveEnvVar('GOOGLE_PROJECT')).toBe(true);
		});

		it('blocks database URLs', () => {
			expect(guard.isSensitiveEnvVar('DATABASE_URL')).toBe(true);
			expect(guard.isSensitiveEnvVar('REDIS_URL')).toBe(true);
		});

		it('allows non-sensitive variables', () => {
			expect(guard.isSensitiveEnvVar('NODE_ENV')).toBe(false);
			expect(guard.isSensitiveEnvVar('HOME')).toBe(false);
			expect(guard.isSensitiveEnvVar('PATH')).toBe(false);
			expect(guard.isSensitiveEnvVar('TERM')).toBe(false);
			expect(guard.isSensitiveEnvVar('SHELL')).toBe(false);
		});

		// --- New explicit env-var names ---
		it('blocks explicit CI/CD credential variable names', () => {
			expect(guard.isSensitiveEnvVar('GH_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('NPM_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('DOCKER_PASSWORD')).toBe(true);
			expect(guard.isSensitiveEnvVar('DOCKER_AUTH')).toBe(true);
			expect(guard.isSensitiveEnvVar('SLACK_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('CIRCLE_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('BUILDKITE_AGENT_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('VAULT_TOKEN')).toBe(true);
			expect(guard.isSensitiveEnvVar('KUBECONFIG')).toBe(true);
		});

		it('blocks non-exact-match private/encryption key variable names', () => {
			expect(guard.isSensitiveEnvVar('SSH_PRIVATE_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('TLS_ENCRYPTION_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('APP_PRIVATE_KEY')).toBe(true);
		});

		it('requires provider prefixes to be at the start of the name, not just present', () => {
			expect(guard.isSensitiveEnvVar('MY_ANTHROPIC_VAR')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_OPENAI_VAR')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_GOOGLE_VAR')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_AWS_VAR')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_AZURE_VAR')).toBe(false);
		});

		it('requires _API_KEY/_TOKEN/_SECRET/_PASSWORD/_CREDENTIAL suffixes to be at the end, not just present', () => {
			expect(guard.isSensitiveEnvVar('MY_API_KEY_BACKUP')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_TOKEN_ID')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_SECRET_VALUE')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_PASSWORD_HINT')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_CREDENTIAL_ID')).toBe(false);
		});

		it('requires DATABASE_URL/REDIS_URL/MONGO_URI to match exactly, not as a prefix or suffix', () => {
			expect(guard.isSensitiveEnvVar('DATABASE_URL_BACKUP')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_DATABASE_URL')).toBe(false);
			expect(guard.isSensitiveEnvVar('REDIS_URL_BACKUP')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_REDIS_URL')).toBe(false);
			expect(guard.isSensitiveEnvVar('MONGO_URI_BACKUP')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_MONGO_URI')).toBe(false);
		});

		it('blocks bare PRIVATE_KEY/ENCRYPTION_KEY names, not only underscore-prefixed ones', () => {
			expect(guard.isSensitiveEnvVar('PRIVATE_KEY')).toBe(true);
			expect(guard.isSensitiveEnvVar('ENCRYPTION_KEY')).toBe(true);
		});

		it('requires PRIVATE_KEY/ENCRYPTION_KEY to be at the end of the name, not just present', () => {
			expect(guard.isSensitiveEnvVar('MY_PRIVATE_KEY_BACKUP')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_ENCRYPTION_KEY_BACKUP')).toBe(false);
		});

		it('requires explicit CI/CD credential names to match exactly, not as a prefix', () => {
			expect(guard.isSensitiveEnvVar('GITHUB_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('GH_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('NPM_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('DOCKER_PASSWORD_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('DOCKER_AUTH_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('SLACK_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('CIRCLE_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('BUILDKITE_AGENT_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('VAULT_TOKEN_EXTRA')).toBe(false);
			expect(guard.isSensitiveEnvVar('KUBECONFIG_EXTRA')).toBe(false);
		});

		it('requires DOCKER_AUTH/KUBECONFIG to match exactly, not as a suffix', () => {
			expect(guard.isSensitiveEnvVar('MY_DOCKER_AUTH')).toBe(false);
			expect(guard.isSensitiveEnvVar('MY_KUBECONFIG')).toBe(false);
		});
	});

	describe('sanitiseEnvironment', () => {
		it('redacts sensitive variables', () => {
			const env: NodeJS.ProcessEnv = {
				ANTHROPIC_API_KEY: 'sk-ant-123',
				HOME: '/home/user',
				NODE_ENV: 'production',
				OPENAI_API_KEY: 'sk-456',
				PATH: '/usr/bin'
			};

			const sanitized = guard.sanitizeEnvironment(env);

			expect(sanitized['ANTHROPIC_API_KEY']).toBe('[REDACTED]');
			expect(sanitized['OPENAI_API_KEY']).toBe('[REDACTED]');
			expect(sanitized['HOME']).toBe('/home/user');
			expect(sanitized['NODE_ENV']).toBe('production');
			expect(sanitized['PATH']).toBe('/usr/bin');
		});

		it('records events for redacted variables', () => {
			guard.sanitizeEnvironment({ MY_API_KEY: 'secret' });
			const events = guard.getEvents();
			expect(events.length).toBeGreaterThan(0);
			expect(events[0]!.type).toBe('credential_redacted');
		});
	});

	describe('scanOutput', () => {
		it('redacts API keys in output', () => {
			const output = 'API key is sk-abcdefghijklmnopqrstuvwxyz1234';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234');
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts AWS access keys', () => {
			const output = 'Key: AKIAIOSFODNN7EXAMPLE';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('AKIAIOSFODNN7EXAMPLE');
		});

		it('redacts bearer tokens', () => {
			const output = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
		});

		it('redacts private key blocks', () => {
			const output = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...';
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts connection strings with credentials', () => {
			const output = 'mongodb://admin:password123@localhost:27017/db';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('password123');
		});

		it('passes through clean output unchanged', () => {
			const output = 'Hello world\nFile saved successfully';
			expect(guard.scanOutput(output)).toBe(output);
		});

		it('handles null/empty input', () => {
			expect(guard.scanOutput('')).toBe('');
			expect(guard.scanOutput(null as unknown as string)).toBeNull();
		});

		// --- New patterns: GitHub tokens ---
		it('redacts GitHub personal access tokens (ghp_)', () => {
			const output = 'export GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts GitHub Actions tokens (ghs_)', () => {
			const output = 'token: ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts GitHub Actions runner tokens (ghu_)', () => {
			const output = 'runner token: ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts GitHub App installation tokens (ghr_)', () => {
			const output = 'app token: ghr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('ghr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
			expect(scanned).toContain('[REDACTED]');
		});

		// --- New patterns: JWT ---
		it('redacts JWT tokens', () => {
			const jwt =
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			const output = `Authorization header contains ${jwt}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain(jwt);
			expect(scanned).toContain('[REDACTED]');
		});

		// --- New patterns: high-entropy fallback ---
		it('redacts high-entropy strings adjacent to credential-suggesting words', () => {
			// 32+ char alphanumeric with entropy >= 4.5 next to "token"
			const output = 'token=xK9mP2vQrL4nJ8wZ1aY5bC7dF3gH6eI0';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('xK9mP2vQrL4nJ8wZ1aY5bC7dF3gH6eI0');
			expect(scanned).toContain('[REDACTED]');
		});

		it('redacts high-entropy strings adjacent to "secret" keyword', () => {
			const output = 'secret: aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890ab';
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain('aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890ab');
			expect(scanned).toContain('[REDACTED]');
		});

		// --- False-positive avoidance ---
		it('does not redact 40-char git SHAs', () => {
			const sha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
			const output = `commit ${sha}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain(sha);
		});

		it('does not redact npm lockfile sha512 hashes', () => {
			const hash = 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
			const output = `integrity: ${hash}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain(hash);
		});

		it('does not redact short 16-char hex identifiers', () => {
			const hex = 'deadbeefcafebabe';
			const output = `trace_id=${hex}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain(hex);
		});

		it('does not redact plain dictionary words like node_modules path', () => {
			const output = 'Scanning /workspace/project/node_modules/some-package/dist/index.js for issues';
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain('node_modules');
		});

		// --- Genuine entropy fallback: no adjacent credential keyword ---
		it('redacts a high-entropy token with no adjacent credential keyword', () => {
			const highEntropy = 'xK9mP2vQrL4nJ8wZ1aY5bC7dF3gH6eI0jU2kM9nR5s';
			const output = `Response header value: ${highEntropy}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).not.toContain(highEntropy);
			expect(scanned).toContain('[REDACTED]');
		});

		it('does not redact a low-entropy repetitive string with no adjacent keyword', () => {
			const lowEntropy = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
			const output = `Padding value: ${lowEntropy}`;
			const scanned = guard.scanOutput(output);
			expect(scanned).toContain(lowEntropy);
		});
	});

	describe('isSensitiveFile', () => {
		it('blocks .env files', () => {
			expect(guard.isSensitiveFile('.env')).toBe(true);
			expect(guard.isSensitiveFile('.env.production')).toBe(true);
			expect(guard.isSensitiveFile('.env.local')).toBe(true);
			expect(guard.isSensitiveFile('/project/.env')).toBe(true);
		});

		it('blocks key files', () => {
			expect(guard.isSensitiveFile('server.pem')).toBe(true);
			expect(guard.isSensitiveFile('private.key')).toBe(true);
			expect(guard.isSensitiveFile('id_rsa')).toBe(true);
			expect(guard.isSensitiveFile('id_ed25519')).toBe(true);
		});

		it('blocks credential files', () => {
			expect(guard.isSensitiveFile('credentials')).toBe(true);
			expect(guard.isSensitiveFile('credentials.json')).toBe(true);
			expect(guard.isSensitiveFile('token.json')).toBe(true);
		});

		it('blocks SSH directory files', () => {
			const home = process.env['HOME'] ?? '/home/user';
			expect(guard.isSensitiveFile(`${home}/.ssh/config`)).toBe(true);
			expect(guard.isSensitiveFile(`${home}/.ssh/known_hosts`)).toBe(true);
		});

		it('blocks AWS directory files', () => {
			const home = process.env['HOME'] ?? '/home/user';
			expect(guard.isSensitiveFile(`${home}/.aws/credentials`)).toBe(true);
		});

		it('blocks gnupg and gcloud config directory files regardless of home directory', () => {
			expect(guard.isSensitiveFile('/x/.gnupg/pubring.kbx')).toBe(true);
			expect(guard.isSensitiveFile('/x/.config/gcloud/application_default_credentials.json')).toBe(true);
		});

		it('blocks ssh/aws directory files even outside the home directory', () => {
			expect(guard.isSensitiveFile('/some/random/.ssh/config')).toBe(true);
			expect(guard.isSensitiveFile('/some/random/.aws/config')).toBe(true);
		});

		it('normalises Windows-style backslash paths before matching the basename', () => {
			expect(guard.isSensitiveFile('C:\\Users\\foo\\id_rsa')).toBe(true);
		});

		it('normalises Windows-style backslash paths before matching the directory, when the basename alone is not sensitive', () => {
			expect(guard.isSensitiveFile('C:\\Users\\foo\\.ssh\\config')).toBe(true);
		});

		it('requires the .env basename to match exactly, not merely end or start with .env', () => {
			expect(guard.isSensitiveFile('foo.env')).toBe(false);
			expect(guard.isSensitiveFile('.envrc')).toBe(false);
		});

		it('requires .env.<suffix> files to have a non-empty suffix and start at the basename root', () => {
			expect(guard.isSensitiveFile('.env.ab')).toBe(true);
			expect(guard.isSensitiveFile('backup.env.local')).toBe(false);
		});

		it('requires .pem/.key files to end with the extension, not merely contain it', () => {
			expect(guard.isSensitiveFile('server.pem.bak')).toBe(false);
			expect(guard.isSensitiveFile('private.key.bak')).toBe(false);
		});

		it('requires id_rsa/id_ed25519/id_ecdsa/id_dsa basenames to match exactly', () => {
			expect(guard.isSensitiveFile('id_rsa_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_id_rsa')).toBe(false);
			expect(guard.isSensitiveFile('id_ed25519_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_id_ed25519')).toBe(false);
			expect(guard.isSensitiveFile('id_ecdsa_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_id_ecdsa')).toBe(false);
			expect(guard.isSensitiveFile('id_dsa_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_id_dsa')).toBe(false);
		});

		it('requires credentials/credentials.json/token.json basenames to match exactly', () => {
			expect(guard.isSensitiveFile('credentials_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_credentials')).toBe(false);
			expect(guard.isSensitiveFile('credentials.json.bak')).toBe(false);
			expect(guard.isSensitiveFile('my_credentials.json')).toBe(false);
			expect(guard.isSensitiveFile('token.json.bak')).toBe(false);
			expect(guard.isSensitiveFile('my_token.json')).toBe(false);
		});

		it('requires .keystore/.jks files to end with the extension, not merely contain it', () => {
			expect(guard.isSensitiveFile('my.keystore.bak')).toBe(false);
			expect(guard.isSensitiveFile('app.jks.bak')).toBe(false);
		});

		it('requires known_hosts/authorized_keys basenames to match exactly', () => {
			expect(guard.isSensitiveFile('known_hosts_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_known_hosts')).toBe(false);
			expect(guard.isSensitiveFile('authorized_keys_backup')).toBe(false);
			expect(guard.isSensitiveFile('my_authorized_keys')).toBe(false);
		});

		it('allows normal files', () => {
			expect(guard.isSensitiveFile('README.md')).toBe(false);
			expect(guard.isSensitiveFile('src/index.ts')).toBe(false);
			expect(guard.isSensitiveFile('package.json')).toBe(false);
		});
	});

	describe('event recording', () => {
		it('records a medium-severity event with the variable name when redacting an env var', () => {
			guard.sanitizeEnvironment({ MY_API_KEY: 'secret' });
			const events = guard.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				details: { source: 'environment', variable: 'MY_API_KEY' },
				severity: 'medium',
				type: 'credential_redacted'
			});
		});

		it('records a high-severity event when scanOutput redacts a credential', () => {
			guard.scanOutput('API key is sk-abcdefghijklmnopqrstuvwxyz1234');
			const events = guard.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				details: { source: 'tool_output' },
				severity: 'high',
				type: 'credential_redacted'
			});
		});

		it('does not record an event when scanOutput finds nothing to redact', () => {
			guard.scanOutput('Hello world');
			expect(guard.getEvents()).toHaveLength(0);
		});

		it('logs a warning through the logger whenever an event is recorded', () => {
			guard.sanitizeEnvironment({ MY_API_KEY: 'secret' });
			expect(loggerWarn).toHaveBeenCalledWith(
				'[Security] credential_redacted',
				expect.objectContaining({
					source: 'environment',
					variable: 'MY_API_KEY'
				})
			);
		});

		it('empties recorded events on clearEvents', () => {
			guard.sanitizeEnvironment({ MY_API_KEY: 'secret' });
			expect(guard.getEvents().length).toBeGreaterThan(0);

			guard.clearEvents();

			expect(guard.getEvents()).toEqual([]);
		});
	});

	describe('singleton lifecycle', () => {
		it('creates a fresh instance after resetCredentialGuard', () => {
			const first = getCredentialGuard();

			resetCredentialGuard();
			const second = getCredentialGuard();

			expect(second).not.toBe(first);
		});

		it('returns the same instance across calls without a reset', () => {
			expect(getCredentialGuard()).toBe(getCredentialGuard());
		});
	});
});
