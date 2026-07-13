import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	decryptSessionData,
	decryptValue,
	EncryptionUtil,
	encryptSessionData,
	encryptValue,
	SENSITIVE_SESSION_FIELDS,
	setEncryptionUtil
} from './encryption';

describe('EncryptionUtil', () => {
	describe('encrypt/decrypt round trip', () => {
		it('recovers the exact original value using an explicit password', () => {
			const util = new EncryptionUtil();
			const original = 'sk-ant-super-secret-api-key-1234567890';

			const encrypted = util.encrypt(original, 'a-strong-password');
			const result = util.decrypt(encrypted, 'a-strong-password');

			expect(result).toEqual({ data: original, success: true });
		});

		it('recovers the exact original value using the derived master key (no explicit password)', () => {
			const util = new EncryptionUtil({}, 'a-fixed-master-key-for-this-instance');

			const encrypted = util.encrypt('another secret value');
			const result = util.decrypt(encrypted);

			expect(result).toEqual({ data: 'another secret value', success: true });
		});

		it('round-trips unicode and multi-line content unchanged', () => {
			const util = new EncryptionUtil();
			const original = 'línea 1\nlínea 2 — emoji: 🔐\ttab';

			const encrypted = util.encrypt(original, 'password');
			const result = util.decrypt(encrypted, 'password');

			expect(result).toEqual({ data: original, success: true });
		});

		it('produces different ciphertext for the same plaintext on successive calls (random salt/iv)', () => {
			const util = new EncryptionUtil();

			const first = util.encrypt('same value', 'password');
			const second = util.encrypt('same value', 'password');

			expect(first.encrypted).not.toBe(second.encrypted);
			expect(first.iv).not.toBe(second.iv);
			expect(first.salt).not.toBe(second.salt);
		});
	});

	describe('tamper detection', () => {
		it('rejects ciphertext that has been modified after encryption', () => {
			const util = new EncryptionUtil();
			const encrypted = util.encrypt('secret value', 'password');
			const tampered = { ...encrypted, encrypted: flipLastChar(encrypted.encrypted) };

			const result = util.decrypt(tampered, 'password');

			expect(result.success).toBe(false);
			expect(result.data).toBeUndefined();
		});

		it('rejects a modified authentication tag', () => {
			const util = new EncryptionUtil();
			const encrypted = util.encrypt('secret value', 'password');
			const tampered = { ...encrypted, tag: flipLastChar(encrypted.tag!) };

			const result = util.decrypt(tampered, 'password');

			expect(result.success).toBe(false);
		});

		it('rejects decryption with the wrong password, without throwing', () => {
			const util = new EncryptionUtil();
			const encrypted = util.encrypt('secret value', 'correct-password');

			const result = util.decrypt(encrypted, 'wrong-password');

			expect(result).toEqual({ data: undefined, error: expect.stringContaining('Decryption failed'), success: false });
		});

		it('rejects decryption with a modified IV', () => {
			const util = new EncryptionUtil();
			const encrypted = util.encrypt('secret value', 'password');
			const tampered = { ...encrypted, iv: flipLastChar(encrypted.iv) };

			const result = util.decrypt(tampered, 'password');

			expect(result.success).toBe(false);
		});
	});

	describe('encryptObjectFields / decryptObjectFields', () => {
		it('encrypts only the named sensitive string fields, leaving others untouched', () => {
			const util = new EncryptionUtil();
			const obj = { apiKey: 'sk-secret', id: 42, name: 'my-session', nested: { untouched: true } };

			const encrypted = util.encryptObjectFields(obj, ['apiKey'], 'password');

			expect(encrypted.id).toBe(42);
			expect(encrypted.name).toBe('my-session');
			expect(encrypted.nested).toEqual({ untouched: true });
			expect(typeof encrypted.apiKey).toBe('object');
			expect(JSON.stringify(encrypted.apiKey)).not.toContain('sk-secret');
		});

		it('round-trips every named field back to its original plaintext value', () => {
			const util = new EncryptionUtil();
			const obj = { apiKey: 'sk-secret', token: 'tok_abc123' };

			const encrypted = util.encryptObjectFields(obj, ['apiKey', 'token'], 'password');
			const decrypted = util.decryptObjectFields(encrypted, ['apiKey', 'token'], 'password');

			expect(decrypted).toEqual(obj);
		});

		it('leaves a named field untouched if it is absent from the object', () => {
			const util = new EncryptionUtil();
			const obj = { name: 'my-session' };

			const encrypted = util.encryptObjectFields(obj, ['apiKey'], 'password');

			expect(encrypted).toEqual(obj);
		});

		it('leaves a named field untouched if it is not a string', () => {
			const util = new EncryptionUtil();
			const obj = { apiKey: { already: 'an object' } };

			const encrypted = util.encryptObjectFields(obj, ['apiKey'], 'password');

			expect(encrypted.apiKey).toEqual({ already: 'an object' });
		});

		it('decryptObjectFields leaves an unencrypted plain-string field untouched rather than throwing', () => {
			const util = new EncryptionUtil();
			const obj = { apiKey: 'never-encrypted-plain-value' };

			const result = util.decryptObjectFields(obj, ['apiKey'], 'password');

			expect(result.apiKey).toBe('never-encrypted-plain-value');
		});

		it('decryptObjectFields throws with a clear message when a field fails to decrypt', () => {
			const util = new EncryptionUtil();
			const encrypted = util.encryptObjectFields({ apiKey: 'sk-secret' }, ['apiKey'], 'correct-password');

			expect(() => util.decryptObjectFields(encrypted, ['apiKey'], 'wrong-password')).toThrow(
				/Failed to decrypt field apiKey/
			);
		});
	});

	describe('validateConfig', () => {
		it('reports valid: true for a working configuration', () => {
			// validateConfig() checks masterKey.length against keyLength * 2, assuming
			// a hex-encoded key of the configured byte length (as generateSecureKey
			// produces) — a shorter, human-chosen string fails that length check even
			// though it works fine as a PBKDF2 password (see encrypt/decrypt tests
			// elsewhere in this file, which use short fixed strings successfully).
			const util = new EncryptionUtil({}, EncryptionUtil.generateSecureKey(32));

			expect(util.validateConfig()).toEqual({ errors: [], valid: true });
		});
	});

	describe('EncryptionUtil.generateSecureKey', () => {
		it('generates a hex string of the requested byte length', () => {
			const key = EncryptionUtil.generateSecureKey(16);

			expect(key).toMatch(/^[0-9a-f]{32}$/);
		});

		it('generates a different key on each call', () => {
			expect(EncryptionUtil.generateSecureKey()).not.toBe(EncryptionUtil.generateSecureKey());
		});
	});
});

describe('encryptValue / decryptValue (module-level singleton helpers)', () => {
	beforeEach(() => {
		setEncryptionUtil(new EncryptionUtil({}, 'a-fixed-master-key-for-this-instance'));
	});

	it('round-trips a value through the singleton helpers', () => {
		const encrypted = encryptValue('a top-secret value');
		const result = decryptValue(encrypted);

		expect(result).toEqual({ data: 'a top-secret value', success: true });
	});
});

describe('encryptSessionData / decryptSessionData', () => {
	beforeEach(() => {
		setEncryptionUtil(new EncryptionUtil({}, 'a-fixed-master-key-for-this-instance'));
	});

	it('encrypts every populated field in SENSITIVE_SESSION_FIELDS, hiding all plaintext values', () => {
		const sessionData: Record<string, string> = {};
		for (const field of SENSITIVE_SESSION_FIELDS) {
			sessionData[field] = `plaintext-value-for-${field}`;
		}
		sessionData['sessionId'] = 'not-sensitive-session-id';

		const encrypted = encryptSessionData(sessionData);
		const serialized = JSON.stringify(encrypted);

		for (const field of SENSITIVE_SESSION_FIELDS) {
			expect(serialized).not.toContain(`plaintext-value-for-${field}`);
			expect(typeof encrypted[field]).toBe('object');
		}
		expect(encrypted['sessionId']).toBe('not-sensitive-session-id');
	});

	it('round-trips a full session object back to its original plaintext values', () => {
		const sessionData = {
			apiKey: 'sk-real-key',
			password: 'super-secret-password',
			sessionId: 'not-sensitive',
			token: 'tok_abc123'
		};

		const encrypted = encryptSessionData(sessionData);
		const decrypted = decryptSessionData(encrypted);

		expect(decrypted).toEqual(sessionData);
	});
});

describe('EncryptionUtil — fallback master key derivation (no explicit key configured)', () => {
	const originalEnv = process.env['AI_ENCRYPTION_KEY'];

	beforeEach(() => {
		delete process.env['AI_ENCRYPTION_KEY'];
	});

	afterEach(() => {
		vi.useRealTimers();
		if (originalEnv === undefined) delete process.env['AI_ENCRYPTION_KEY'];
		else process.env['AI_ENCRYPTION_KEY'] = originalEnv;
	});

	it('is stable across calls within the same instance/process', () => {
		const util = new EncryptionUtil();
		const encrypted = util.encrypt('secret value');

		// Same instance, later call — must still decrypt with the same fallback key.
		const result = util.decrypt(encrypted);

		expect(result).toEqual({ data: 'secret value', success: true });
	});

	it('KNOWN GAP: data encrypted by one process cannot be decrypted by a later process using the same fallback (no AI_ENCRYPTION_KEY set)', () => {
		// getMasterKey()'s fallback path derives the key from
		// `${machineId}:${appId}:${Date.now()}` — mixing the current timestamp
		// into what the surrounding comment ("derive a consistent key from
		// machine data") implies should be a *stable* machine-specific key.
		// Session data encrypted under this fallback in one CLI invocation can
		// never be decrypted in a later invocation (a fresh EncryptionUtil
		// instance derives a different key, since Date.now() differs), unless
		// AI_ENCRYPTION_KEY is explicitly configured. Flagged rather than fixed:
		// removing Date.now() would make the fallback key deterministic and
		// derivable from just hostname — a different, not obviously-safer,
		// security trade-off that needs a product decision, not a unilateral
		// one-line fix.
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const processA = new EncryptionUtil();
		const encrypted = processA.encrypt('secret value');

		vi.setSystemTime(2_000_000);
		const processB = new EncryptionUtil();
		const result = processB.decrypt(encrypted);

		expect(result.success).toBe(false);
	});
});

/** Flips a character within the data portion of a base64 string, avoiding any trailing `=` padding. */
/**
 * Flips every bit of the last decoded byte and re-encodes to base64. Mutating
 * the base64 *text* directly (e.g. changing its last character) is unreliable
 * for tamper tests: the final character of a base64 string can encode a byte
 * boundary where several source characters decode to the same meaningful
 * bits (the rest is encoding padding), so a naive character swap sometimes
 * produces a no-op and the "tampered" ciphertext round-trips successfully —
 * flaky-failing this exact class of test. Operating on the decoded bytes
 * guarantees an actual value change every time.
 */
function flipLastChar(base64: string): string {
	const buf = Buffer.from(base64, 'base64');
	buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
	return buf.toString('base64');
}
