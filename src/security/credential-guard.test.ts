import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialGuard, resetCredentialGuard } from './credential-guard';

// Mock logger
vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

describe('CredentialGuard', () => {
	let guard: CredentialGuard;

	beforeEach(() => {
		resetCredentialGuard();
		guard = new CredentialGuard();
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

		it('allows normal files', () => {
			expect(guard.isSensitiveFile('README.md')).toBe(false);
			expect(guard.isSensitiveFile('src/index.ts')).toBe(false);
			expect(guard.isSensitiveFile('package.json')).toBe(false);
		});
	});
});
