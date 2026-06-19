/**
 * Command Guard
 *
 * Validates terminal commands before execution. The primary gate is a
 * pragmatic allowlist of base commands; anything else is refused, regardless
 * of whether it appears in the older eval / network / exfiltration pattern
 * lists. Pattern lists remain as defence-in-depth for cases where an
 * allowlisted command is composed dangerously (e.g. `python3 -m http.server`).
 */

import { getLogger } from 'output/logger';

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
	'docker',
	'make',
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
	/\bpython[23]?\s+-c\b/,
	/\bpython[23]?\s+-m\s+http\.server\b/,
	/\bnode\s+-e\b/,
	/\bruby\s+-e\b/,
	/\bperl\s+-e\b/
];

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
			.replace(/\$\([\s\S]*?\)/g, ' ')
			.replace(/[<>]\([\s\S]*?\)/g, ' ')
			.replace(/`[^`]*`/g, ' ');
	}

	private validateSegment(segment: string): CommandValidationResult {
		const command = segment.trim();
		const baseCommandRaw = command.split(/\s+/)[0] ?? '';
		// Strip path prefix; keep the basename only
		const baseCommand = baseCommandRaw.replace(/^.*\//, '');

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

		for (const pattern of EVAL_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Arbitrary code execution blocked: matches pattern ${pattern.source}`);
			}
		}

		if (!ALLOWED_BASE_COMMANDS.has(baseCommand)) {
			return this.block(
				command,
				`Command '${baseCommand}' not in allowlist. Add it to ALLOWED_BASE_COMMANDS in src/security/command-guard.ts after a security review, or use an existing tool.`
			);
		}

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
