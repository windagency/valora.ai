/**
 * Workspace trust for project-declared hook commands.
 *
 * `.valora/config.json`'s `hooks` field lets a PROJECT declare shell commands
 * that run automatically on every tool call (PreToolUse/PostToolUse) with no
 * confirmation and the full inherited environment — the same "unconfirmed
 * shell exec from untrusted declared content" class as a plugin manifest's
 * `checkCommand`/`installCommand`, except reachable just by cloning a repo
 * and running any `valora` command inside it, no install step required.
 * `hook-execution.service.ts` only honours project-declared hooks once the
 * project directory has been explicitly trusted via `trustWorkspace()`
 * (wired to `valora config trust`), mirroring editors' workspace-trust
 * model. Global (`~/.valora/config.json`) and bundled/plugin hooks are
 * unaffected — those are already fully under the user's own control.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { getGlobalConfigDir } from 'utils/paths';
import { resolveRealPathBestEffort } from 'utils/real-path';

const TRUST_STORE_FILENAME = 'trusted-workspaces.json';

interface TrustStore {
	trusted?: string[];
}

/**
 * Always the global config dir (`~/.valora/`), NEVER `getRuntimeDataDir()`/
 * `getProjectConfigDir()` — those prefer a project-local `.valora/` whenever
 * one exists, which it always will in exactly the scenario this store exists
 * to gate (a project needs its own `.valora/` to declare hooks at all). If
 * the trust store lived there, the project could ship a hand-written
 * `trusted-workspaces.json` and self-grant its own trust.
 */
function getTrustStorePath(): string {
	return join(getGlobalConfigDir(), TRUST_STORE_FILENAME);
}

function readTrustedDirs(storePath: string): Set<string> {
	try {
		const raw = readFileSync(storePath, 'utf-8');
		const parsed = JSON.parse(raw) as TrustStore;
		return new Set(parsed.trusted ?? []);
	} catch {
		return new Set();
	}
}

function writeTrustedDirs(storePath: string, dirs: Set<string>): void {
	mkdirSync(dirname(storePath), { recursive: true });
	writeFileSync(storePath, JSON.stringify({ trusted: [...dirs].sort() }, null, 2));
}

/**
 * Symlink-aware trust key for `projectDir` — a lexical `resolve()` alone
 * would let a symlinked project directory be trusted/checked under two
 * different keys (the symlink path and its real target), same class of gap
 * as `command-guard.ts`'s path-scoping checks elsewhere in this session.
 */
function trustKey(projectDir: string): string {
	return resolveRealPathBestEffort(resolve(projectDir));
}

/** Is `projectDir` (a resolved or resolvable path) explicitly trusted to run project-declared hook commands? */
export function isWorkspaceTrusted(projectDir: string, storePath: string = getTrustStorePath()): boolean {
	if (!existsSync(storePath)) return false;
	return readTrustedDirs(storePath).has(trustKey(projectDir));
}

/** Explicitly trust `projectDir`'s project-declared hook commands. */
export function trustWorkspace(projectDir: string, storePath: string = getTrustStorePath()): void {
	const dirs = readTrustedDirs(storePath);
	dirs.add(trustKey(projectDir));
	writeTrustedDirs(storePath, dirs);
}

/** Revoke trust previously granted to `projectDir`. */
export function revokeWorkspaceTrust(projectDir: string, storePath: string = getTrustStorePath()): void {
	const dirs = readTrustedDirs(storePath);
	dirs.delete(trustKey(projectDir));
	writeTrustedDirs(storePath, dirs);
}
