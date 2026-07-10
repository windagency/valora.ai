/**
 * Provenance signing for vault entries.
 *
 * Threat model: a memory entry recalled into a future agent's context is a
 * trusted channel with no other integrity check (the frontmatter's
 * `content_hash` is self-referential — anyone with filesystem write access to
 * the vault can compute a valid one for injected content). Signing with a key
 * stored outside the vault directory means an entry not written through
 * `MemoryManager.create()` fails verification and is excluded from context
 * injection by default.
 *
 * What this DOES defend against today: hand-edited or externally-authored
 * files (an Obsidian edit, a stray write from outside the Valora process)
 * that never went through `create()`.
 *
 * What this does NOT defend against today: a malicious plugin. Plugin code
 * loads via a plain `import()` into the same Node process as the host — there
 * is no VM/worker isolation yet, and `fs-read`/`fs-write` are currently
 * unenforced plugin permissions (see `plugin-loader.service.ts`'s
 * `UNENFORCED_PERMISSIONS`). Any plugin with `code-exec` can read this key
 * file directly and forge valid signatures. Do not describe this scheme as
 * protecting against "a lower-privileged plugin" until process/worker
 * isolation between the host and plugin code actually exists — right now
 * there is no privilege boundary between them to raise the bar against.
 *
 * The signing key itself must resolve globally (`getGlobalConfigDir()`),
 * NEVER `getRuntimeDataDir()` — that helper prefers a project-local `.valora/`
 * whenever one exists, which it always will in exactly the scenario this key
 * exists to gate (a malicious repo needs its own `.valora/` to plant a forged
 * vault entry at all). If the key lived there too, the repo could ship a
 * hand-written `vault-signing.key` alongside the forged entry and sign it
 * itself — the forgery would verify as trusted, not merely lack a signature.
 * This is unrelated to `getDefaultVaultDir()`'s own use of `getRuntimeDataDir()`
 * for the vault *content*, which is intentional per-project scoping.
 */

import { getGlobalConfigDir } from '@windagency/valora-runtime';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import { atomicWriteFile } from './file-format.js';

const KEY_LENGTH_BYTES = 32;
const DEFAULT_KEY_FILENAME = 'vault-signing.key';

let keyPathOverride: string | undefined;

/**
 * Encodes as a JSON array rather than joining with a fixed delimiter
 * character: any single delimiter lets an attacker who can get that exact
 * character embedded in `content` shift the content/agentRole boundary and
 * produce a signature collision without ever needing the signing key.
 * JSON.stringify escapes embedded quotes/backslashes per field, so no such
 * re-partitioning is possible.
 */
function buildSignaturePayload(content: string, agentRole: string, createdAt: string): string {
	return JSON.stringify([content, agentRole, createdAt]);
}

function getOrCreateSigningKey(): Buffer {
	const keyPath = getSigningKeyPath();
	if (existsSync(keyPath)) {
		return Buffer.from(readFileSync(keyPath, 'utf-8').trim(), 'hex');
	}

	const key = randomBytes(KEY_LENGTH_BYTES);
	atomicWriteFile(keyPath, key.toString('hex'));
	chmodSync(keyPath, 0o600);
	return key;
}

function getSigningKeyPath(): string {
	return keyPathOverride ?? path.join(getGlobalConfigDir(), DEFAULT_KEY_FILENAME);
}

/** Sign an entry's content/agentRole/createdAt with the local vault signing key. */
export function signProvenance(content: string, agentRole: string, createdAt: string): string {
	const key = getOrCreateSigningKey();
	return createHmac('sha256', key)
		.update(buildSignaturePayload(content, agentRole, createdAt))
		.digest('hex');
}

/** Verify a persisted signature against the entry's current content/agentRole/createdAt. */
export function verifyProvenance(
	content: string,
	agentRole: string,
	createdAt: string,
	signature: string | undefined
): boolean {
	if (!signature) return false;

	const expected = signProvenance(content, agentRole, createdAt);
	const expectedBuf = Buffer.from(expected, 'hex');
	const actualBuf = Buffer.from(signature, 'hex');
	if (expectedBuf.length !== actualBuf.length) return false;

	return timingSafeEqual(expectedBuf, actualBuf);
}

/** Test-only: redirect signing-key storage to an isolated path. */
export function setSigningKeyPathForTests(testPath: string): void {
	keyPathOverride = testPath;
}

/** Test-only: restore default signing-key path resolution. */
export function resetSigningKeyPathForTests(): void {
	keyPathOverride = undefined;
}
