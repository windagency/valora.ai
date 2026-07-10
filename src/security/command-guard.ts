/**
 * Command Guard
 *
 * Validates terminal commands before execution. The primary gate is a
 * pragmatic allowlist of base commands; anything else is refused, regardless
 * of whether it appears in the older eval / network / exfiltration pattern
 * lists. Pattern lists remain as defence-in-depth for cases where an
 * allowlisted command is composed dangerously (e.g. `python3 -m http.server`).
 */

import { realpathSync, statSync } from 'fs';
import * as path from 'path';

import { getLogger } from 'output/logger';
import { getGlobalConfigDir, getRuntimeDataDir } from 'utils/paths';
import { resolveRealPathBestEffort } from 'utils/real-path';

import { getAuditSink } from './audit-sink';
import { createSecurityEvent, type SecurityEvent } from './security-event.types';

/**
 * Pragmatic allowlist of base commands an agent may execute. Any base command
 * not in this set is refused. Membership is matched against the *normalised*
 * basename of the first token of each chained / nested segment, so `python3
 * -m http.server` is decomposed and the dangerous flag combination is caught
 * by the eval / network pattern checks below — not by the allowlist alone.
 *
 * Adding a new entry here is a security review event: the command must be
 * incapable of network listening, arbitrary code interpretation, or
 * unbounded credential exfiltration on its own.
 */
const ALLOWED_BASE_COMMANDS = new Set<string>([
	// Node / TypeScript ecosystem
	'biome',
	'bun',
	'bunx',
	'eslint',
	'node',
	'npm',
	'npx',
	'pnpm',
	'prettier',
	'tsc',
	'tsx',
	'vitest',
	// Git and GitHub CLI
	'gh',
	'git',
	// Search and inspection
	'cat',
	'eza',
	'fd',
	'find',
	'grep',
	'head',
	'jq',
	'ls',
	'rg',
	'stat',
	'tail',
	'tree',
	'wc',
	'yq',
	// File operations (within working directory)
	'cp',
	'diff',
	'mkdir',
	'mv',
	'rm',
	'sort',
	'touch',
	'uniq',
	// Text processing
	'awk',
	'gunzip',
	'gzip',
	'sed',
	// Build / container tooling
	// Deliberately excludes `make`: a Makefile recipe is arbitrary shell in a
	// file, not a statically-extractable argv sub-command like find/xargs/env's
	// — there is no way to scope or recursively re-validate it, so `make
	// <target>` is a total, unconditional bypass of every check in this file.
	'docker',
	// Python / Rust ecosystems (`-c` / `-e` forms blocked by EVAL_PATTERNS)
	'cargo',
	'pip',
	'pip3',
	'pytest',
	'python',
	'python3',
	'ruff',
	// Shell-script primitives required for valid pipelines (`-c` form blocked
	// independently by EVAL_PATTERNS)
	'bash',
	'sh',
	'zsh',
	// Read-only shell exploration / environment scaffolding
	':',
	'[',
	'[[',
	'cd',
	'command',
	'date',
	'echo',
	'env',
	'false',
	'printf',
	'pwd',
	'sleep',
	'test',
	'true',
	'type',
	'which',
	// Pipeline plumbing
	'xargs'
]);

/**
 * Network commands kept as defence-in-depth: even though an attacker would
 * have to socially engineer them onto the allowlist, the explicit block also
 * surfaces a clearer "data exfiltration vector" reason.
 */
const NETWORK_COMMANDS = ['curl', 'wget', 'nc', 'ncat', 'netcat', 'socat', 'telnet'];

const REMOTE_ACCESS_COMMANDS = ['ssh', 'scp', 'rsync', 'ftp', 'sftp'];

const EVAL_PATTERNS: RegExp[] = [
	/\beval\s+/,
	/(?<!-)\bexec\s+/,
	/\bbash\s+-c\b/,
	/\bsh\s+-c\b/,
	/\bzsh\s+-c\b/,
	// No trailing \b: python's -c takes the rest of the same token as inline
	// code when unspaced (`-cprint(3+3)` behaves like `-c "print(3+3)"`), and
	// permits bundling with other single-char boolean flags (`-uc`) — a
	// boundary assertion right after the literal 'c' misses both forms.
	/\bpython[23]?\s+-[a-zA-Z]*c/,
	/\bpython[23]?\s+-m\s+http\.server\b/,
	// Node permits bundling -e (eval) with other single-char flags (`-pe`,
	// `-ep`) in one token, and separately supports the `--eval`/`--eval=`
	// long form — matching only the bare `-e` token missed both.
	/\bnode\s+-[a-zA-Z]*e/,
	/\bnode\s+--eval\b/,
	// `npx -c`/`--call` is a documented flag that runs an arbitrary shell
	// command — the same primitive as `python -c`/`node -e`, on an
	// allowlisted launcher that had no equivalent pattern.
	/\bnpx\s+(?:-[a-zA-Z]*c\b|--call\b)/,
	// `bun -e`/`--eval` mirrors node's own eval flag.
	/\bbun\s+-[a-zA-Z]*e/,
	/\bbun\s+--eval\b/,
	/\bruby\s+-e\b/,
	/\bperl\s+-e\b/
];

/**
 * Base commands that can be handed another program to run as an argument
 * rather than invoking it directly. The allowlist check alone only ever
 * inspects the leading token of a segment, so `fd --exec curl ...` would
 * otherwise pass validation while smuggling an unvalidated sub-command.
 * Each of these is decomposed by `extractEmbeddedSubCommands` and the
 * extracted sub-command is recursively re-validated through the same
 * `validateSegment` pipeline (allowlist, network/remote-access, eval
 * patterns, homoglyph check).
 */
const EXEC_ARGUMENT_LAUNCHERS = new Set(['env', 'fd', 'find', 'xargs']);

const FIND_EXEC_FLAGS = new Set(['--exec', '--exec-batch', '-exec', '-execdir', '-ok', '-okdir', '-X', '-x']);

/** Single-quoted fragment: everything literal until the closing `'`. Returns [decoded, nextIndex]. */
function decodeSingleQuoted(token: string, start: number): [string, number] {
	const end = token.indexOf("'", start + 1);
	const stop = end === -1 ? token.length : end;
	return [token.slice(start + 1, stop), stop + 1];
}

/** Double-quoted fragment: backslash escapes `"`, `\`, `$`, and `` ` `` only. Returns [decoded, nextIndex]. */
function decodeDoubleQuoted(token: string, start: number): [string, number] {
	let result = '';
	let i = start + 1;
	while (i < token.length && token[i] !== '"') {
		if (token[i] === '\\' && '"\\$`'.includes(token[i + 1] ?? '')) {
			result += token[i + 1];
			i += 2;
		} else {
			result += token[i];
			i += 1;
		}
	}
	return [result, i + 1];
}

/** Single-character bash ANSI-C escapes, mapped to the literal character they represent. */
const ANSI_C_NAMED_ESCAPES: Record<string, string> = {
	'"': '"',
	"'": "'",
	'?': '?',
	'\\': '\\',
	a: '\x07',
	b: '\b',
	e: '\x1b',
	E: '\x1b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v'
};

/** Max hex digits for each bash Unicode/hex escape introducer. */
const ANSI_C_HEX_ESCAPE_WIDTHS: Record<string, number> = { U: 8, u: 4, x: 2 };

/** `\xHH`/`\uHHHH`/`\UHHHHHHHH` starting at `raw[i]` (the backslash). Returns the matched hex digits, or undefined. */
function matchAnsiCHexEscape(raw: string, i: number): string | undefined {
	const width = ANSI_C_HEX_ESCAPE_WIDTHS[raw[i + 1] ?? ''];
	if (!width) return undefined;
	return raw.slice(i + 2, i + 2 + width).match(/^[0-9a-fA-F]+/)?.[0];
}

/** `\nnn` (1-3 octal digits) starting at `raw[i]` (the backslash). Returns the matched octal digits, or undefined. */
function matchAnsiCOctalEscape(raw: string, i: number): string | undefined {
	if (!/^[0-7]/.test(raw[i + 1] ?? '')) return undefined;
	return raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0];
}

/**
 * Decode bash ANSI-C (`$'...'`) backslash escapes to the actual characters
 * they represent. The previous implementation (`raw.replace(/\\(.)/g, '$1')`)
 * only stripped the backslash from single-character escapes — for a
 * multi-character escape like `\x3b` (hex), `\073` (octal), or `\u00xx`
 * (Unicode), it produced the literal 3+ character text (`x3b`) instead of the
 * one real character (`;`) bash actually decodes it to, so a hex/octal/Unicode
 * -encoded terminator or flag character silently failed every downstream
 * equality check that compares against the real decoded character. Handling
 * every escape form bash supports (not just the specific one a bypass PoC
 * used) closes the whole class at once, per this file's own established
 * lesson about enumerating quoting bypasses one at a time.
 *
 * KNOWN, INTENTIONAL divergence from real bash — do not "fix" without reading
 * this: for an escape this function doesn't recognise (`\;`, `\+`, `\q`,
 * etc.), real bash keeps the backslash literally (`$'\;'` decodes to the
 * 2-character string `\;`), but this function drops it (decoding to the
 * 1-character `;`). Verified with a live PoC (round 10) that "correcting"
 * this to match bash exactly *reopens* a real bypass: `find`'s clause-scanner
 * (`extractFindExecSubCommand`) falls back to merging everything up to the
 * next real terminator into one opaque sub-command (checking only its first
 * token) whenever it can't find a *near* terminator — matching bash exactly
 * here removes the near (mis-detected but safe) terminator match this
 * function currently produces for `\;`/`\+`, causing the scanner to skip past
 * it and merge a smuggled network command into an unchecked argument blob of
 * an allowlisted command instead. The current behaviour is deliberately
 * over-eager (treats more things as terminators than bash really would) —
 * that direction is safe for this specific downstream consumer; matching
 * bash exactly is not. See `command-guard.test.ts`'s "does not treat bash's
 * unrecognized-escape form" tests, which lock in the current (intentional)
 * behaviour rather than bash's literal one.
 */
function decodeAnsiCEscapes(raw: string): string {
	let result = '';
	let i = 0;
	while (i < raw.length) {
		if (raw[i] !== '\\' || i + 1 >= raw.length) {
			result += raw[i];
			i += 1;
			continue;
		}
		const hexDigits = matchAnsiCHexEscape(raw, i);
		if (hexDigits) {
			result += String.fromCodePoint(parseInt(hexDigits, 16));
			i += 2 + hexDigits.length;
			continue;
		}
		const octalDigits = matchAnsiCOctalEscape(raw, i);
		if (octalDigits) {
			result += String.fromCharCode(parseInt(octalDigits, 8) & 0xff);
			i += 1 + octalDigits.length;
			continue;
		}
		const next = raw[i + 1]!;
		if (next in ANSI_C_NAMED_ESCAPES) {
			result += ANSI_C_NAMED_ESCAPES[next];
			i += 2;
			continue;
		}
		// Unknown escape — see the docstring above `decodeAnsiCEscapes` for why
		// this deliberately does NOT match real bash (which keeps the
		// backslash) — dropping it here is a known, intentional divergence.
		result += next;
		i += 2;
	}
	return result;
}

/** Bash ANSI-C (`$'...'`) or locale (`$"..."`) quoted fragment. Returns [decoded, nextIndex]. */
function decodeDollarQuoted(token: string, start: number): [string, number] {
	const quote = token[start + 1]!;
	const end = token.indexOf(quote, start + 2);
	const stop = end === -1 ? token.length : end;
	const raw = token.slice(start + 2, stop);
	return [quote === "'" ? decodeAnsiCEscapes(raw) : raw, stop + 1];
}

/**
 * Decode a single already-whitespace-split shell word into the literal string
 * a real shell would pass to the program. `validateSegment` tokenizes on raw
 * whitespace with no quote awareness (`command.split(/\s+/)`), so a quoted or
 * escaped token reaches downstream checks with its quote/escape characters
 * still attached — and bash freely concatenates adjacent quoted/escaped
 * fragments with no intervening whitespace into ONE word (`\;''` is the
 * single word `;`, `-'i'` is the single word `-i`). Enumerating each quoting
 * style as a bypass surfaced one at a time didn't converge across three
 * audit rounds (bare -> `'...'` -> `'+'`/`$'...'` -> this concatenation gap);
 * decoding the word properly in one pass — tracking quote state and
 * concatenating every fragment — closes the whole class at once instead of
 * the next enumerated case.
 */
function decodeShellWord(token: string): string {
	let result = '';
	let i = 0;
	while (i < token.length) {
		const ch = token[i]!;
		if (ch === '\\') {
			result += token[i + 1] ?? '';
			i += 2;
			continue;
		}
		if (ch === "'") {
			const [fragment, next] = decodeSingleQuoted(token, i);
			result += fragment;
			i = next;
			continue;
		}
		if (ch === '"') {
			const [fragment, next] = decodeDoubleQuoted(token, i);
			result += fragment;
			i = next;
			continue;
		}
		if (ch === '$' && (token[i + 1] === "'" || token[i + 1] === '"')) {
			const [fragment, next] = decodeDollarQuoted(token, i);
			result += fragment;
			i = next;
			continue;
		}
		result += ch;
		i += 1;
	}
	return result;
}

/**
 * POSIX `find` also accepts a shell-quoted or escape-concatenated semicolon
 * or plus (`-exec cmd ';'`, `-exec cmd '+'`, `-exec cmd \;''`) as a
 * terminator, not just the bare form. A validator that only recognises the
 * unquoted tokens would fail to find the boundary of a clause terminated
 * this way, merging it with whatever follows and letting a smuggled
 * command's base name slip past the per-clause allowlist check.
 */
function isFindExecTerminator(token: string): boolean {
	const decoded = decodeShellWord(token);
	return decoded === ';' || decoded === '+';
}

/**
 * xargs flags that consume the following token as a value, not a sub-command
 * start. Deliberately excludes `-l` (lowercase): GNU xargs' `-l` is a
 * deprecated boolean-ish flag defaulting max-lines to 1, with only an
 * *optional attached* number (`-l2`) — it never consumes a separate token.
 * `-L` (uppercase, `--max-lines`) is a distinct flag that genuinely requires
 * a separate-token value. Treating `-l` as value-taking swallowed the next
 * token (a sub-command's own base command, e.g. `ssh` in `xargs -l ssh`) as
 * `-l`'s "value", producing an empty extracted sub-command and skipping
 * re-validation entirely.
 */
const XARGS_VALUE_FLAGS = new Set(['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s']);

/**
 * env flags that consume the following token as a value, not a sub-command
 * start. Long forms (`--chdir`/`--split-string`/`--unset`) are just as
 * value-taking as their short equivalents (GNU env's own `--help` confirms
 * all six) — omitting them let the unattached long form advance the parser
 * by only 1 token instead of 2, misreading a smuggled sub-command's own base
 * name as the flag's value and letting it evade re-validation entirely.
 */
const ENV_VALUE_FLAGS = new Set(['--chdir', '--split-string', '--unset', '-C', '-S', '-u']);

const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * True if `envArgs` (env's own args, not including `env` itself) carries a
 * `-C`/`--chdir` flag in any form. `env -C <dir>` changes the *real* working
 * directory the recursively-validated sub-command runs in — every
 * cwd-relative scoping check (`rm`/`cp`/docker mounts) evaluates the
 * sub-command's paths against the guard's own unchanged `process.cwd()`, not
 * the real chdir target, so `env -C /etc rm passwd` looks like an ordinary
 * in-cwd delete but actually deletes `/etc/passwd` at runtime. No downstream
 * check can safely account for a runtime chdir, so this must be blocked
 * outright rather than threaded through every scoping check.
 */
function hasEnvChdirFlag(envArgs: string[]): boolean {
	return envArgs.some((t) => t === '-C' || t === '--chdir' || t.startsWith('--chdir='));
}

/**
 * Script-execution primitives embedded *inside* an allowlisted command's own
 * script argument (as opposed to a nested argv sub-command). `awk`'s
 * `system()` and GNU `sed`'s `e` command/flag both shell out directly from
 * within an otherwise-inert text-processing invocation.
 */
const SCRIPT_INJECTION_PATTERNS: ReadonlyArray<{ baseCommand: string; pattern: RegExp }> = [
	{ baseCommand: 'awk', pattern: /\bsystem\s*\(/ },
	{ baseCommand: 'sed', pattern: /\/e(?:\s|;|'|$)/ },
	{ baseCommand: 'sed', pattern: /(?:^|[;'\s])[0-9]*e\s+\S/ }
];

/**
 * `docker` flags that grant host-level access incompatible with treating the
 * container as an isolation boundary. Checked against the whole argument
 * string rather than per-token since some (e.g. `--cap-add=ALL`) are only
 * meaningful with their attached value.
 */
const DOCKER_DANGEROUS_FLAG_PATTERNS: RegExp[] = [
	/--privileged\b/,
	/--cap-add(?:=|\s)/,
	/--pid[=\s]host\b/,
	/--network[=\s]host\b/,
	/--security-opt\b/
];

/**
 * `git` flags/config-keys that grant an immediate or persistent
 * arbitrary-command execution primitive, checked against the whole joined
 * argument string (mirroring `DOCKER_DANGEROUS_FLAG_PATTERNS`) since some are
 * only meaningful with their attached value and can appear as either `-c
 * key=value` (immediate, this invocation only) or `git config key value`
 * (persistent, written to the repo/global config for every future
 * invocation). `credential\.\S*helper` also matches URL-scoped keys
 * (`credential.https://x.com.helper`), not just the bare form.
 */
const GIT_DANGEROUS_PATTERNS: RegExp[] = [
	/\bext::/,
	/--exec-path\b/,
	/\bcore\.hooksPath\b/i,
	/\bcredential\.\S*helper\b/i
];

/** `docker <group> <subcommand>` prefixes whose long form must resolve to the same subcommand as the top-level shortcut. */
const DOCKER_COMMAND_GROUP_PREFIXES = new Set(['container', 'image']);

/** docker subcommands whose `-i`/`-o` (or `--input`/`--output`) flag takes a real host file path, not stdin/stdout. */
const DOCKER_HOST_PATH_IO_SUBCOMMANDS: Record<string, 'input' | 'output'> = {
	export: 'output',
	load: 'input',
	save: 'output'
};

/**
 * Single-char boolean flags docker's pflag-based CLI permits bundling
 * *before* the value-taking `-i`/`-o` short flag in the same token (e.g.
 * `docker load -qi /path` bundles `-q` (quiet, boolean) + `-i` (input,
 * value-taking) — pflag consumes bundled boolean chars left-to-right, then
 * treats the value flag's own remainder, or the next argv token, as its
 * value). `save`/`export` have no other short boolean flags to bundle.
 */
const DOCKER_IO_BUNDLABLE_BOOLEAN_FLAGS: Record<string, Set<string>> = {
	load: new Set(['q'])
};

/** docker `import`'s flags that consume the following token as their value, so the scan can find the true first positional (the source). */
const DOCKER_IMPORT_VALUE_FLAGS = new Set(['--change', '--message', '--platform', '-c', '-m']);

/**
 * Matches `token` against a bundled-short-flag cluster ending in `shortLetter`
 * (docker's value-taking `-i`/`-o`), where every character before it is one of
 * `allowedBoolChars` — e.g. `-qi` for `load`'s `-q` bundled ahead of `-i`.
 * Returns the value: the token's own remainder if attached (`-qi/path`), the
 * empty string if none is attached (caller falls back to the next token), or
 * `undefined` if the token isn't a match for this cluster at all.
 */
function matchDockerBundledShortFlag(
	token: string,
	shortLetter: string,
	allowedBoolChars: Set<string>
): string | undefined {
	const bundleMatch = new RegExp(`^-([a-z]*)${shortLetter}(.*)$`).exec(token);
	if (!bundleMatch) return undefined;
	const [, boolChars, remainder] = bundleMatch;
	if (![...boolChars!].every((c) => allowedBoolChars.has(c))) return undefined;
	return remainder;
}

/** `--flag value` / `--flag=value` matching for a single long flag name. Returns the value, or `undefined` if `token` isn't this flag. */
function matchLongFlagValue(token: string, longFlag: string, nextToken: string | undefined): string | undefined {
	if (token === longFlag) return nextToken;
	if (token.startsWith(`${longFlag}=`)) return token.slice(longFlag.length + 1);
	return undefined;
}

/** Extracts BuildKit `-o`/`--output`'s `dest=<path>` sub-value from its comma-separated key=value spec (e.g. `type=local,dest=/tmp/x`). */
function extractDockerOutputDest(spec: string): string | undefined {
	return /(?:^|,)dest=([^,]+)/.exec(spec)?.[1];
}

/**
 * Substituted for `$(...)`, backticks, and `<(...)`/`>(...)` in the outer
 * command text before per-argument checks tokenize it (see
 * `stripNestedConstructs`). The substitution's actual output can't be known
 * statically — it was previously replaced with blank space, which made the
 * argument silently disappear from the outer command's token list entirely
 * (`rm $(echo target)` reached `validateRmArgs` as `rm` with NO arguments),
 * letting every per-argument scoping/protected-file check pass by default.
 * Any token containing this placeholder must fail closed instead: it's
 * checked as its own independent segment (so `curl` inside a subshell is
 * still caught there), but wherever it lands as an argument, treat it as an
 * unverifiable value for commands that have a per-argument rule.
 */
const UNRESOLVED_SUBSHELL_PLACEHOLDER = '__valora_unresolved_subshell__';

/**
 * Every other shell-expansion form that can turn one literal-looking argument
 * token into something a per-argument check never sees: brace expansion
 * (`{a,b}` splits into separate words), glob wildcards (`*`, `?`, `[...]`
 * pathname expansion), and tilde expansion (`~`/`~user` expands to a home
 * directory, never the guard's cwd-relative literal reading). Same fail-closed
 * treatment as the command-substitution placeholder above: the real
 * post-expansion value can't be known statically, so a command with a
 * per-argument rule must not treat an argument carrying any of these as
 * verified-safe just because its literal text doesn't match anything
 * dangerous.
 */
function isUnresolvableArgument(token: string): boolean {
	if (token.includes(UNRESOLVED_SUBSHELL_PLACEHOLDER)) return true;
	if (/\{[^{}]*,[^{}]*\}/.test(token)) return true;
	if (/[*?]/.test(token) || /\[[^[\]]+\]/.test(token)) return true;
	if (/^~[a-zA-Z0-9_-]*(\/.*)?$/.test(token)) return true;
	return false;
}

/**
 * Basenames whose deletion, relocation, truncation, or in-place edit would
 * erase the security forensic trail or defeat a trust decision.
 * `trusted-workspaces.json` (workspace-trust.service.ts) grants project
 * hooks/LSP servers permission to run — tampering with it is equivalent to
 * forging that grant, the same severity as erasing the audit log.
 */
const PROTECTED_INFRASTRUCTURE_BASENAMES = new Set([
	'mcp-baselines.json',
	'security-audit.jsonl',
	'trusted-workspaces.json',
	'vault-signing.key'
]);

/**
 * Absolute expected paths for each protected file, matching exactly how each
 * owning module resolves its own path (`audit-sink.ts`/`tool-integrity-monitor.ts`
 * use `getRuntimeDataDir()`; `workspace-trust.service.ts`/`provenance.ts` use
 * `getGlobalConfigDir()` only). Recomputed on each call rather than cached — a
 * protected file may not exist yet when this module first loads but be
 * created later.
 */
function getProtectedFileAbsolutePaths(): string[] {
	return [
		path.join(getRuntimeDataDir(), 'security-audit.jsonl'),
		path.join(getRuntimeDataDir(), 'mcp-baselines.json'),
		path.join(getGlobalConfigDir(), 'trusted-workspaces.json'),
		path.join(getGlobalConfigDir(), 'vault-signing.key')
	];
}

/**
 * True if `candidatePath` shares an inode (device + inode number) with one of
 * the protected files' real locations — catching a **hardlink** alias, which
 * a basename/realpath check cannot: a hardlink is a second directory entry
 * for the same inode with no distinct link component to resolve, so
 * `realpathSync` on the alias returns the alias's own path, not the
 * original's. Skips any protected file that doesn't exist yet (nothing to
 * compare against).
 */
function sharesInodeWithProtectedFile(candidatePath: string): boolean {
	let candidateStat;
	try {
		candidateStat = statSync(candidatePath);
	} catch {
		return false;
	}
	for (const protectedPath of getProtectedFileAbsolutePaths()) {
		try {
			const protectedStat = statSync(protectedPath);
			if (candidateStat.dev === protectedStat.dev && candidateStat.ino === protectedStat.ino) return true;
		} catch {
			// Protected file doesn't exist yet — nothing to compare against.
		}
	}
	return false;
}

/**
 * Commands whose default behaviour targeting a file argument is destructive
 * (delete, overwrite, or replace-and-remove) — the same tamper primitive as
 * `rm`, just via a tool that doesn't read as file deletion at a glance.
 * `sed`/`awk` are checked separately since they're only destructive to their
 * target when an in-place-edit flag is present.
 */
const PROTECTED_INFRASTRUCTURE_DESTRUCTIVE_COMMANDS = new Set(['cp', 'gunzip', 'gzip', 'mv', 'rm']);

/** Does `sed`'s token list carry an in-place-edit flag, in any position (`-i`, `-i.bak`, `--in-place[=...]`)? */
/**
 * GNU sed permits bundling short options together in one token (`-ni` is
 * "quiet + in-place", not a single unrecognised flag) — checking only for an
 * exact `-i`/`-i.`-prefixed token misses `-i` bundled anywhere alongside
 * other short flags, in either order.
 */
function hasSedInPlaceFlag(decodedTokens: string[]): boolean {
	return decodedTokens.some(
		(t) =>
			t === '--in-place' ||
			t.startsWith('--in-place=') ||
			(/^-[a-zA-Z]+$/.test(t) && t.includes('i')) ||
			/^-[a-zA-Z]*i\.\S*$/.test(t)
	);
}

/** Does `awk`'s token list carry gawk's `-i inplace` extension or `--in-place[=...]`, in any position? */
function hasAwkInPlaceFlag(decodedTokens: string[]): boolean {
	return decodedTokens.some(
		(t, i) => (t === '-i' && decodedTokens[i + 1] === 'inplace') || t === '--in-place' || t.startsWith('--in-place=')
	);
}

const ENV_ACCESS_PATTERNS: RegExp[] = [
	/\$ANTHROPIC_/,
	/\$OPENAI_/,
	/\$GOOGLE_/,
	/\$AWS_/,
	/\$AZURE_/,
	/\$\{?[A-Z_]*API_KEY\}?/,
	/\$\{?[A-Z_]*TOKEN\}?/,
	/\$\{?[A-Z_]*SECRET\}?/,
	/\$\{?[A-Z_]*PASSWORD\}?/,
	/\$\{?DATABASE_URL\}?/,
	/\$\{?REDIS_URL\}?/,
	/\$\{?PRIVATE_KEY\}?/
];

const EXFILTRATION_PATTERNS: RegExp[] = [
	/cat\s+.*\.env.*\|/,
	/cat\s+.*id_rsa.*\|/,
	/cat\s+.*\.pem.*\|/,
	/base64\s+.*\.env/,
	/base64\s+.*id_rsa/,
	/base64\s+.*\.pem/,
	/base64\s+.*\.key/,
	/\$\(.*\$[A-Z_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)/
];

export interface CommandValidationResult {
	allowed: boolean;
	reason?: string;
}

export class CommandGuard {
	private events: SecurityEvent[] = [];

	clearEvents(): void {
		this.events = [];
	}

	getEvents(): SecurityEvent[] {
		return [...this.events];
	}

	validate(command: string): CommandValidationResult {
		if (!command || typeof command !== 'string') {
			return { allowed: false, reason: 'Empty or invalid command' };
		}

		const normalized = command.normalize('NFKC');

		const protectedInfraResult = this.checkProtectedInfrastructurePatterns(normalized);
		if (!protectedInfraResult.allowed) return protectedInfraResult;

		const exfilResult = this.checkExfiltrationPatterns(normalized);
		if (!exfilResult.allowed) return exfilResult;

		const envResult = this.checkEnvAccess(normalized);
		if (!envResult.allowed) return envResult;

		const segments = this.splitAllSegments(normalized);

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;
			const result = this.validateSegment(trimmed);
			if (!result.allowed) return result;
		}

		return { allowed: true };
	}

	/**
	 * Decompose a command into every leaf segment that is reachable for
	 * execution: chain operators, subshells `$(...)`, process substitutions
	 * `<(...)` / `>(...)`, and backtick command substitutions are all
	 * recursively peeled apart so each leaf base command can be checked
	 * against the allowlist.
	 */
	private block(command: string, reason: string): CommandValidationResult {
		this.logEvent(command, reason);
		return { allowed: false, reason };
	}

	private checkEnvAccess(command: string): CommandValidationResult {
		for (const pattern of ENV_ACCESS_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Environment variable credential access detected: ${pattern.source}`);
			}
		}
		return { allowed: true };
	}

	private checkExfiltrationPatterns(command: string): CommandValidationResult {
		for (const pattern of EXFILTRATION_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Exfiltration pattern detected: ${pattern.source}`);
			}
		}
		return { allowed: true };
	}

	/**
	 * Blocks deleting, relocating, truncating, or in-place-editing the security
	 * audit log or MCP integrity baseline file, independent of per-agent
	 * forbidden_paths — the forensic trail must not be tamperable even by an
	 * agent otherwise allowed to run `rm`/`mv`/`sed`/etc within its working
	 * directory. Operates per-segment (chain operators split commands apart
	 * before this runs elsewhere too) on decoded tokens rather than whole-string
	 * substring regexes, so neither argument order (`sed file -i` is as valid as
	 * `sed -i file`) nor shell quoting/escaping can hide the flag or filename
	 * from detection. Every filename-shaped argument is also checked against
	 * its resolved real path, so a symlink with an unrelated name pointing at
	 * the protected file is caught, not just a literal name match.
	 */
	private checkProtectedInfrastructurePatterns(command: string): CommandValidationResult {
		for (const segment of this.splitAllSegments(command)) {
			if (this.segmentTargetsProtectedInfrastructure(segment.trim())) {
				return this.block(command, 'Tampering with security infrastructure file blocked');
			}
		}
		return { allowed: true };
	}

	private segmentRedirectsToProtectedFile(tokens: string[]): boolean {
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i]!;
			if ((token === '>' || token === '>>') && tokens[i + 1] && this.tokenReferencesProtectedFile(tokens[i + 1]!)) {
				return true;
			}
			if (/^>{1,2}\S/.test(token) && this.tokenReferencesProtectedFile(token.replace(/^>{1,2}/, ''))) {
				return true;
			}
		}
		return false;
	}

	private segmentTargetsProtectedInfrastructure(segment: string): boolean {
		const rawTokens = segment.split(/\s+/).filter(Boolean);
		if (rawTokens.length === 0) return false;

		const tokens = rawTokens.map((t) => decodeShellWord(t));
		const baseCommand = (tokens[0] ?? '').replace(/^.*\//, '');

		if (this.segmentRedirectsToProtectedFile(tokens)) return true;

		const isDestructiveByDefault = PROTECTED_INFRASTRUCTURE_DESTRUCTIVE_COMMANDS.has(baseCommand);
		const isInPlaceEdit =
			(baseCommand === 'sed' && hasSedInPlaceFlag(tokens)) || (baseCommand === 'awk' && hasAwkInPlaceFlag(tokens));
		if (!isDestructiveByDefault && !isInPlaceEdit) return false;

		return tokens.slice(1).some((t) => this.tokenReferencesProtectedFile(t));
	}

	/**
	 * True if the argument names a protected file directly, or resolves (via
	 * a symlink, at any path depth) to one — so an alias with an unrelated
	 * name can't hide the real target. Also true for an unresolved command
	 * substitution placeholder: its real value can't be verified as safe, so
	 * it's treated as a potential reference rather than silently passed.
	 */
	private tokenReferencesProtectedFile(token: string): boolean {
		if (!token || token.startsWith('-')) return false;
		if (isUnresolvableArgument(token)) return true;
		if (PROTECTED_INFRASTRUCTURE_BASENAMES.has(path.basename(token))) return true;
		const resolvedPath = path.resolve(process.cwd(), token);
		try {
			const resolved = realpathSync(resolvedPath);
			if (PROTECTED_INFRASTRUCTURE_BASENAMES.has(path.basename(resolved))) return true;
		} catch {
			// Doesn't exist / unresolvable symlink — fall through to the inode check.
		}
		return sharesInodeWithProtectedFile(resolvedPath);
	}

	/**
	 * Extract the embedded sub-command(s) a "launcher" base command hands off
	 * to another program, so they can be recursively re-validated. Returns an
	 * empty array when no sub-command is found (e.g. `find -name '*.ts'` with
	 * no `-exec`).
	 */
	private extractDockerHostPath(token: string, nextToken: string | undefined): string | undefined {
		if (token === '-v' || token === '--volume') {
			return nextToken?.split(':')[0];
		}
		if (token.startsWith('--volume=')) {
			return token.slice('--volume='.length).split(':')[0];
		}
		if (token === '--mount') {
			return this.extractMountSource(nextToken ?? '');
		}
		if (token.startsWith('--mount=')) {
			return this.extractMountSource(token.slice('--mount='.length));
		}
		return undefined;
	}

	private extractEmbeddedSubCommands(baseCommand: string, args: string[]): string[] {
		switch (baseCommand) {
			case 'env':
				return this.extractEnvSubCommand(args);
			case 'fd':
			case 'find':
				return this.extractFindExecSubCommand(args);
			case 'xargs':
				return this.extractXargsSubCommand(args);
			default:
				return [];
		}
	}

	/**
	 * `env` with no sub-command at all dumps the entire process environment —
	 * including any secret pulled in via `$ANTHROPIC_*`/`$*_API_KEY`/etc — with
	 * no `$VAR` sigil anywhere in the command string, so `ENV_ACCESS_PATTERNS`'
	 * textual `$VAR` matching never fires and `extractEnvSubCommand` finds
	 * nothing to recurse into either. Bare `env` (or `env` piped/chained with
	 * no sub-command of its own) must be blocked outright; `env VAR=x cmd...`
	 * stays allowed since it hands off to a specific, recursively-revalidated
	 * sub-command.
	 */
	private extractEnvSubCommand(args: string[]): string[] {
		let i = 0;
		while (i < args.length) {
			const token = args[i]!;
			if (token === '--') {
				i += 1;
				break;
			}
			if (ENV_VALUE_FLAGS.has(token)) {
				i += 2;
				continue;
			}
			if (token.startsWith('-')) {
				i += 1;
				continue;
			}
			if (ENV_ASSIGNMENT_PATTERN.test(token)) {
				i += 1;
				continue;
			}
			break;
		}
		const subArgs = args.slice(i);
		return subArgs.length > 0 ? [subArgs.join(' ')] : [];
	}

	private validateEnvArgs(tokens: string[]): CommandValidationResult {
		const rest = tokens.slice(1);
		if (hasEnvChdirFlag(rest)) {
			return {
				allowed: false,
				reason:
					'env -C/--chdir blocked — changes the real working directory a recursively-validated sub-command runs in, which no cwd-relative scoping check can safely account for'
			};
		}
		const subCommands = this.extractEnvSubCommand(rest);
		if (subCommands.length === 0) {
			return {
				allowed: false,
				reason: 'Bare env invocation blocked — dumps the full process environment, a credential exposure vector'
			};
		}
		return { allowed: true };
	}

	/**
	 * `find`/`fd` support multiple `-exec ... \;` (or `-ok`/`-okdir`) clauses
	 * per invocation — extracting only the first, as a single `findIndex`
	 * would, lets a second clause smuggle an unvalidated sub-command past a
	 * benign-looking first one (e.g. `find . -exec true \; -exec curl ... \;`).
	 * This scans the whole argument list and returns every clause found.
	 */
	private extractFindExecSubCommand(args: string[]): string[] {
		const subCommands: string[] = [];
		let i = 0;

		while (i < args.length) {
			if (!FIND_EXEC_FLAGS.has(args[i]!)) {
				i += 1;
				continue;
			}

			const rest = args.slice(i + 1);
			const terminatorIndex = rest.findIndex((arg) => isFindExecTerminator(arg));
			const subArgs = terminatorIndex === -1 ? rest : rest.slice(0, terminatorIndex);
			if (subArgs.length > 0) subCommands.push(subArgs.join(' '));

			// No terminator means the rest of the command is consumed by this
			// clause with no clear boundary — stop scanning for further clauses.
			i = terminatorIndex === -1 ? args.length : i + 1 + terminatorIndex + 1;
		}

		return subCommands;
	}

	private extractMountSource(mountSpec: string): string | undefined {
		const match = /(?:^|,)(?:source|src)=([^,]+)/.exec(mountSpec);
		return match?.[1];
	}

	private extractNestedSegments(command: string): string[] {
		const found: string[] = [];

		// $(...) — balanced; descend recursively to handle $( $( ) )
		const dollarParenRe = /\$\(([\s\S]*?)\)/g;
		for (const match of command.matchAll(dollarParenRe)) {
			const inner = match[1];
			if (inner !== undefined) {
				found.push(...this.splitAllSegments(inner));
			}
		}

		// <(...) and >(...) — process substitution
		const procSubRe = /[<>]\(([\s\S]*?)\)/g;
		for (const match of command.matchAll(procSubRe)) {
			const inner = match[1];
			if (inner !== undefined) {
				found.push(...this.splitAllSegments(inner));
			}
		}

		// Backticks — `cmd`
		const backtickRe = /`([^`]*)`/g;
		for (const match of command.matchAll(backtickRe)) {
			const inner = match[1];
			if (inner !== undefined) {
				found.push(...this.splitAllSegments(inner));
			}
		}

		return found;
	}

	private extractXargsSubCommand(args: string[]): string[] {
		let i = 0;
		while (i < args.length) {
			const token = args[i]!;
			if (XARGS_VALUE_FLAGS.has(token)) {
				i += 2;
				continue;
			}
			if (token.startsWith('-')) {
				i += 1;
				continue;
			}
			break;
		}
		const subArgs = args.slice(i);
		return subArgs.length > 0 ? [subArgs.join(' ')] : [];
	}

	private handleQuote(
		char: string,
		inSingleQuote: boolean,
		inDoubleQuote: boolean
	): null | { inDoubleQuote: boolean; inSingleQuote: boolean } {
		if (char === "'" && !inDoubleQuote) {
			return { inDoubleQuote, inSingleQuote: !inSingleQuote };
		}
		if (char === '"' && !inSingleQuote) {
			return { inDoubleQuote: !inDoubleQuote, inSingleQuote };
		}
		return null;
	}

	/**
	 * Resolve symlinks in `candidatePath` as far as the filesystem allows.
	 * `fs.realpathSync` requires every path component to exist, which throws
	 * for a not-yet-created target (e.g. a file `rm` will delete, or a mount
	 * source that doesn't exist yet) even when an intermediate symlinked
	 * directory component does. Walking up to the deepest existing ancestor,
	 * resolving that, and reattaching the missing tail handles both cases —
	 * without this, a symlinked directory under cwd pointing outside it would
	 * lexically "look" contained while actually escaping on disk.
	 */
	private isOutsideWorkingDirectory(candidatePath: string): boolean {
		// Variables/subshell output can't be statically resolved — leave those
		// to the eval/exfiltration pattern checks rather than false-blocking.
		if (!candidatePath || candidatePath.startsWith('$')) return false;
		const lexicallyResolved = path.resolve(process.cwd(), candidatePath);
		const resolved = resolveRealPathBestEffort(lexicallyResolved);
		const cwd = resolveRealPathBestEffort(process.cwd());
		return resolved === path.parse(resolved).root || (resolved !== cwd && !resolved.startsWith(cwd + path.sep));
	}

	private logEvent(command: string, reason: string): void {
		const event = createSecurityEvent('command_blocked', 'critical', {
			command: command.slice(0, 200),
			reason
		});
		this.events.push(event);
		getAuditSink().append(event);

		const logger = getLogger();
		logger.warn(`[Security] Command blocked`, { command: command.slice(0, 200), reason });
	}

	private matchOperator(command: string, i: number): null | number {
		const char = command[i];
		if (char === ';') return 0;
		if (char === '|' && command[i + 1] === '|') return 1;
		if (char === '&' && command[i + 1] === '&') return 1;
		if (char === '|') return 0;
		return null;
	}

	private splitAllSegments(command: string): string[] {
		const inner = this.extractNestedSegments(command);
		const flat = this.splitOnChainOperators(this.stripNestedConstructs(command));
		return [...flat, ...inner];
	}

	private splitOnChainOperators(command: string): string[] {
		const segments: string[] = [];
		let current = '';
		let inSingleQuote = false;
		let inDoubleQuote = false;
		let escaped = false;

		for (let i = 0; i < command.length; i++) {
			const char = command[i]!;

			if (escaped) {
				current += char;
				escaped = false;
				continue;
			}

			if (char === '\\') {
				current += char;
				escaped = true;
				continue;
			}

			const quoteResult = this.handleQuote(char, inSingleQuote, inDoubleQuote);
			if (quoteResult !== null) {
				inSingleQuote = quoteResult.inSingleQuote;
				inDoubleQuote = quoteResult.inDoubleQuote;
				current += char;
				continue;
			}

			if (!inSingleQuote && !inDoubleQuote) {
				const split = this.matchOperator(command, i);
				if (split !== null) {
					segments.push(current);
					current = '';
					i += split;
					continue;
				}
			}

			current += char;
		}

		if (current.trim()) {
			segments.push(current);
		}

		return segments;
	}

	private stripNestedConstructs(command: string): string {
		return command
			.replace(/\$\([\s\S]*?\)/g, UNRESOLVED_SUBSHELL_PLACEHOLDER)
			.replace(/[<>]\([\s\S]*?\)/g, UNRESOLVED_SUBSHELL_PLACEHOLDER)
			.replace(/`[^`]*`/g, UNRESOLVED_SUBSHELL_PLACEHOLDER);
	}

	private validateDockerArgs(tokens: string[]): CommandValidationResult {
		const rest = tokens.slice(1);
		const joined = rest.join(' ');

		for (const pattern of DOCKER_DANGEROUS_FLAG_PATTERNS) {
			if (pattern.test(joined)) {
				return { allowed: false, reason: `Dangerous docker flag blocked: matches pattern ${pattern.source}` };
			}
		}

		// `docker container cp`/`docker container export`/`docker image save`/
		// `docker image load` are documented long-form aliases for their
		// top-level shortcuts — dispatching on rest[0] alone would miss them.
		const subcommandIndex = DOCKER_COMMAND_GROUP_PREFIXES.has(rest[0] ?? '') ? 1 : 0;
		const subcommand = rest[subcommandIndex];

		const hostPathResult = this.checkDockerHostPaths(rest, subcommand);
		if (!hostPathResult.allowed) return hostPathResult;

		if (subcommand === 'cp') {
			return this.validateDockerCpArgs(rest.slice(subcommandIndex + 1));
		}
		if (subcommand === 'import') {
			return this.validateDockerImportArgs(rest.slice(subcommandIndex + 1));
		}

		return { allowed: true };
	}

	/**
	 * `git` had zero scoping at all: `git -C <path> clean -fdx` deletes
	 * arbitrary files outside cwd (the same escape primitive `rm`/`cp`/docker
	 * mounts are scoped against), the `ext::` remote-helper transport forks an
	 * arbitrary program, and `core.hooksPath`/`credential.helper` (immediate
	 * `-c`/`--config`, or persistent `git config`) set an arbitrary-command
	 * hook. Live-verified: all four bypasses actually executed the smuggled
	 * command/deleted the file in this sandbox before this fix.
	 */
	private validateGitArgs(tokens: string[]): CommandValidationResult {
		const rest = tokens.slice(1);
		const joined = rest.join(' ');

		for (const pattern of GIT_DANGEROUS_PATTERNS) {
			if (pattern.test(joined)) {
				return { allowed: false, reason: `Dangerous git flag/config blocked: matches pattern ${pattern.source}` };
			}
		}

		for (let i = 0; i < rest.length; i++) {
			if (rest[i] !== '-C') continue;
			const target = rest[i + 1];
			if (target === undefined) continue;
			if (isUnresolvableArgument(target) || this.isOutsideWorkingDirectory(target)) {
				return { allowed: false, reason: `git -C target outside working directory blocked: ${target}` };
			}
		}

		return { allowed: true };
	}

	/** Checks every bind-mount (-v/--mount) and I/O (-i/-o, save/load/export) host path for cwd-escape and protected-file targeting. */
	private checkDockerHostPaths(rest: string[], subcommand: string | undefined): CommandValidationResult {
		for (let i = 0; i < rest.length; i++) {
			const hostPath =
				this.extractDockerHostPath(rest[i]!, rest[i + 1]) ??
				this.extractDockerIoHostPath(subcommand, rest[i]!, rest[i + 1]) ??
				this.extractDockerBuildPathFlag(subcommand, rest[i]!, rest[i + 1]);
			if (hostPath === undefined) continue;
			if (isUnresolvableArgument(hostPath) || this.isOutsideWorkingDirectory(hostPath)) {
				return {
					allowed: false,
					reason: `Docker bind-mount source outside working directory blocked: ${hostPath}`
				};
			}
			if (this.tokenReferencesProtectedFile(hostPath)) {
				return {
					allowed: false,
					reason: `Docker command targeting protected security-infrastructure file blocked: ${hostPath}`
				};
			}
		}
		return { allowed: true };
	}

	/**
	 * `-o`/`--output` (`save`, `export`) and `-i`/`--input` (`load`) take a
	 * real host file path exactly like `-v`/`--mount`'s bind-mount source, but
	 * are subcommand-specific — `-i` means something entirely different
	 * ("interactive", no value) for `run`/`create`/`exec`, so this must only
	 * fire for the subcommands where `-i`/`-o` really are host-path flags.
	 * Also matches the short flag bundled with other single-char boolean
	 * flags docker permits combining into one token (`-qi`) — see
	 * `DOCKER_IO_BUNDLABLE_BOOLEAN_FLAGS`.
	 */
	private extractDockerIoHostPath(
		subcommand: string | undefined,
		token: string,
		nextToken: string | undefined
	): string | undefined {
		const kind = subcommand ? DOCKER_HOST_PATH_IO_SUBCOMMANDS[subcommand] : undefined;
		if (!kind) return undefined;
		const shortLetter = kind === 'input' ? 'i' : 'o';
		const longFlag = kind === 'input' ? '--input' : '--output';

		const longValue = matchLongFlagValue(token, longFlag, nextToken);
		if (longValue !== undefined) return longValue;

		const allowedBoolChars = DOCKER_IO_BUNDLABLE_BOOLEAN_FLAGS[subcommand ?? ''] ?? new Set<string>();
		const remainder = matchDockerBundledShortFlag(token, shortLetter, allowedBoolChars);
		if (remainder === undefined) return undefined;
		return remainder.length > 0 ? remainder : nextToken;
	}

	/**
	 * `build`'s `-f`/`--file` (an arbitrary host file read as the Dockerfile),
	 * `--iidfile`/`--metadata-file` (arbitrary host file writes), and
	 * `-o`/`--output`'s `dest=<path>` sub-value (BuildKit's arbitrary
	 * host-directory export write, e.g. `type=local,dest=/tmp/exfil`) are all
	 * real host-path flags, but `build` was never dispatched to any
	 * docker-specific path check at all until round 11 added `-f`/`--iidfile`.
	 */
	private extractDockerBuildPathFlag(
		subcommand: string | undefined,
		token: string,
		nextToken: string | undefined
	): string | undefined {
		if (subcommand !== 'build') return undefined;
		if (token === '-f') return nextToken;

		const plainPathFlag =
			matchLongFlagValue(token, '--file', nextToken) ??
			matchLongFlagValue(token, '--iidfile', nextToken) ??
			matchLongFlagValue(token, '--metadata-file', nextToken);
		if (plainPathFlag !== undefined) return plainPathFlag;

		return this.extractDockerBuildOutputPathFlag(token, nextToken);
	}

	/** `-o`/`--output type=local,dest=<path>` (BuildKit export) — its value is a comma-separated spec, not a bare path, so `dest=` must be pulled out separately from the plain path flags above. */
	private extractDockerBuildOutputPathFlag(token: string, nextToken: string | undefined): string | undefined {
		if (token === '-o' || token === '--output') return nextToken ? extractDockerOutputDest(nextToken) : undefined;
		if (token.startsWith('--output=')) return extractDockerOutputDest(token.slice('--output='.length));
		return undefined;
	}

	/**
	 * `docker cp SRC DEST` uses positional arguments, not -v/--mount flags —
	 * completely invisible to the bind-mount scoping loop above, which only
	 * ever inspects flag tokens. Exactly one side is a `CONTAINER:PATH`
	 * reference (not a host filesystem path at all, so cwd-scoping doesn't
	 * apply); the other is a real host path and must resolve inside cwd,
	 * same as `cp`'s own scoping.
	 */
	private validateDockerCpArgs(positionalArgs: string[]): CommandValidationResult {
		for (const token of positionalArgs) {
			if (token.startsWith('-')) continue;
			if (this.isDockerCpContainerReference(token)) continue;
			if (isUnresolvableArgument(token) || this.isOutsideWorkingDirectory(token)) {
				return { allowed: false, reason: `docker cp host path outside working directory blocked: ${token}` };
			}
			if (this.tokenReferencesProtectedFile(token)) {
				return {
					allowed: false,
					reason: `docker cp targeting protected security-infrastructure file blocked: ${token}`
				};
			}
		}
		return { allowed: true };
	}

	/** `docker cp`'s CONTAINER:PATH syntax, or bare "-" for stdin/stdout — neither is a host filesystem path. */
	private isDockerCpContainerReference(token: string): boolean {
		return token === '-' || token.includes(':');
	}

	/**
	 * `docker import file|URL|- [REPOSITORY[:TAG]]` — the source is a bare
	 * positional argument, not a `-v`/`--mount`/`-i` flag, so it was invisible
	 * to every existing docker host-path check. A URL or `-` (stdin) isn't a
	 * host filesystem path; only the first positional (the source) is ever a
	 * path — the second positional is a `REPOSITORY[:TAG]` string, not one.
	 */
	private validateDockerImportArgs(positionalArgs: string[]): CommandValidationResult {
		for (let i = 0; i < positionalArgs.length; i++) {
			const token = positionalArgs[i]!;
			// Must be checked before the startsWith('-') branch below: '-'.startsWith('-')
			// is true, so that branch would otherwise always catch it first and this
			// check would never run, falling through to treat the NEXT positional
			// (REPOSITORY[:TAG], not a filesystem path) as the host-path candidate.
			if (token === '-' || /^https?:\/\//.test(token)) return { allowed: true };
			if (token.startsWith('-')) {
				if (DOCKER_IMPORT_VALUE_FLAGS.has(token)) i += 1;
				continue;
			}
			if (isUnresolvableArgument(token) || this.isOutsideWorkingDirectory(token)) {
				return { allowed: false, reason: `docker import source outside working directory blocked: ${token}` };
			}
			if (this.tokenReferencesProtectedFile(token)) {
				return {
					allowed: false,
					reason: `docker import targeting protected security-infrastructure file blocked: ${token}`
				};
			}
			return { allowed: true };
		}
		return { allowed: true };
	}

	private validateRmArgs(tokens: string[]): CommandValidationResult {
		const rest = tokens.slice(1);

		if (rest.includes('--no-preserve-root')) {
			return { allowed: false, reason: 'rm --no-preserve-root blocked — root-deletion override' };
		}

		for (const token of rest) {
			if (token.startsWith('-')) continue;
			if (isUnresolvableArgument(token) || this.isOutsideWorkingDirectory(token)) {
				return { allowed: false, reason: `rm target outside working directory blocked: ${token}` };
			}
		}

		return { allowed: true };
	}

	/**
	 * `cp` had no path scoping at all — it can read from or write to any path
	 * the process can reach (`cp /dev/null /etc/hosts`), with no equivalent to
	 * rm's cwd check. Scoped the same way: every non-flag argument (source and
	 * destination alike) must resolve inside the working directory.
	 */
	private validateCpArgs(tokens: string[]): CommandValidationResult {
		for (const token of tokens.slice(1)) {
			if (token.startsWith('-')) continue;
			if (isUnresolvableArgument(token) || this.isOutsideWorkingDirectory(token)) {
				return { allowed: false, reason: `cp target outside working directory blocked: ${token}` };
			}
		}
		return { allowed: true };
	}

	/**
	 * Cheap, name-only checks on the base command: homoglyph obfuscation,
	 * network commands, remote-access commands. Split out of `validateSegment`
	 * to keep its own cyclomatic complexity down.
	 */
	private checkBaseCommandSafety(baseCommand: string, command: string): CommandValidationResult {
		// Reject any non-ASCII byte in the base command — homoglyph defence.
		// Allowlist entries are all ASCII, so a Cyrillic/Greek lookalike will
		// fail the membership check, but we surface a clearer reason here.
		if (/[^ -~]/.test(baseCommand)) {
			return this.block(command, `Non-ASCII characters in base command — possible homoglyph: ${baseCommand}`);
		}

		if (NETWORK_COMMANDS.includes(baseCommand)) {
			return this.block(command, `Network command blocked: ${baseCommand} — potential data exfiltration vector`);
		}

		if (REMOTE_ACCESS_COMMANDS.includes(baseCommand)) {
			return this.block(command, `Remote access command blocked: ${baseCommand} — potential data exfiltration vector`);
		}

		return { allowed: true };
	}

	private validateSegment(segment: string): CommandValidationResult {
		const command = segment.trim();
		const tokens = command.split(/\s+/);
		const baseCommandRaw = tokens[0] ?? '';
		// Strip path prefix; keep the basename only
		const baseCommand = baseCommandRaw.replace(/^.*\//, '');

		const baseCommandSafety = this.checkBaseCommandSafety(baseCommand, command);
		if (!baseCommandSafety.allowed) return baseCommandSafety;

		for (const pattern of EVAL_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Arbitrary code execution blocked: matches pattern ${pattern.source}`);
			}
		}

		for (const { baseCommand: scriptCommand, pattern } of SCRIPT_INJECTION_PATTERNS) {
			if (baseCommand === scriptCommand && pattern.test(command)) {
				return this.block(
					command,
					`Script-execution primitive blocked in '${baseCommand}': matches pattern ${pattern.source}`
				);
			}
		}

		if (!ALLOWED_BASE_COMMANDS.has(baseCommand)) {
			return this.block(
				command,
				`Command '${baseCommand}' not in allowlist. Add it to ALLOWED_BASE_COMMANDS in src/security/command-guard.ts after a security review, or use an existing tool.`
			);
		}

		return this.validateCommandSpecificRules(baseCommand, command, tokens);
	}

	/**
	 * Rules that only apply to specific allowlisted base commands: docker flag
	 * scoping, rm path scoping, and embedded sub-command validation for
	 * exec-argument launchers. Split out of `validateSegment` to keep its own
	 * cyclomatic complexity down.
	 */
	private validateCommandSpecificRules(
		baseCommand: string,
		command: string,
		tokens: string[]
	): CommandValidationResult {
		const scopedResult = this.checkScopedPathCommand(baseCommand, tokens);
		if (!scopedResult.allowed)
			return this.block(command, scopedResult.reason ?? `Unsafe ${baseCommand} target blocked`);

		if (EXEC_ARGUMENT_LAUNCHERS.has(baseCommand)) {
			const subCommands = this.extractEmbeddedSubCommands(baseCommand, tokens.slice(1));
			for (const subCommand of subCommands) {
				const subResult = this.validateSegment(subCommand);
				if (!subResult.allowed) {
					return this.block(command, `Embedded sub-command in '${baseCommand}' blocked: ${subResult.reason}`);
				}
			}
		}

		return { allowed: true };
	}

	/** Dispatches to the per-command path/flag scoping check, if this base command has one. */
	private checkScopedPathCommand(baseCommand: string, tokens: string[]): CommandValidationResult {
		if (baseCommand === 'docker') return this.validateDockerArgs(tokens);
		if (baseCommand === 'git') return this.validateGitArgs(tokens);
		if (baseCommand === 'rm') return this.validateRmArgs(tokens);
		if (baseCommand === 'cp') return this.validateCpArgs(tokens);
		if (baseCommand === 'env') return this.validateEnvArgs(tokens);
		return { allowed: true };
	}
}

let instance: CommandGuard | null = null;

export function getCommandGuard(): CommandGuard {
	instance ??= new CommandGuard();
	return instance;
}

export function resetCommandGuard(): void {
	instance = null;
}
