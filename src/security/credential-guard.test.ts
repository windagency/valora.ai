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

			const sanitised = guard.sanitiseEnvironment(env);

			expect(sanitised['ANTHROPIC_API_KEY']).toBe('[REDACTED]');
			expect(sanitised['OPENAI_API_KEY']).toBe('[REDACTED]');
			expect(sanitised['HOME']).toBe('/home/user');
			expect(sanitised['NODE_ENV']).toBe('production');
			expect(sanitised['PATH']).toBe('/usr/bin');
		});

		it('records events for redacted variables', () => {
			guard.sanitiseEnvironment({ MY_API_KEY: 'secret' });
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
