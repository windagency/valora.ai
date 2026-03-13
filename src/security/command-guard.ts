/**
 * Command Guard
 *
 * Validates terminal commands before execution to prevent:
 * - Data exfiltration via network tools
 * - Arbitrary code execution via eval/exec patterns
 * - Environment variable credential theft
 * - Chained command exploitation
 */

import { getLogger } from 'output/logger';

import { createSecurityEvent, type SecurityEvent } from './security-event.types';

/**
 * Commands that enable network data exfiltration.
 */
const NETWORK_COMMANDS = ['curl', 'wget', 'nc', 'ncat', 'netcat'];

/**
 * Commands that enable arbitrary remote access.
 */
const REMOTE_ACCESS_COMMANDS = ['ssh', 'scp', 'rsync', 'ftp', 'sftp'];

/**
 * Eval/exec patterns that enable arbitrary code execution.
 */
const EVAL_PATTERNS: RegExp[] = [
	/\beval\s+/,
	/\bexec\s+/,
	/\bbash\s+-c\b/,
	/\bsh\s+-c\b/,
	/\bzsh\s+-c\b/,
	/\bpython[23]?\s+-c\b/,
	/\bnode\s+-e\b/,
	/\bruby\s+-e\b/,
	/\bperl\s+-e\b/
];

/**
 * Patterns that indicate environment variable credential access in commands.
 */
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

/**
 * Exfiltration patterns: data extraction piped to network commands.
 */
const EXFILTRATION_PATTERNS: RegExp[] = [
	// Reading credentials and piping to network
	/cat\s+.*\.env.*\|/,
	/cat\s+.*id_rsa.*\|/,
	/cat\s+.*\.pem.*\|/,
	// Base64 encoding of credential files
	/base64\s+.*\.env/,
	/base64\s+.*id_rsa/,
	/base64\s+.*\.pem/,
	/base64\s+.*\.key/,
	// Subshell reading env vars
	/\$\(.*\$[A-Z_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)/
];

export interface CommandValidationResult {
	allowed: boolean;
	reason?: string;
}

export class CommandGuard {
	private events: SecurityEvent[] = [];

	/**
	 * Validate a command string before execution.
	 */
	validate(command: string): CommandValidationResult {
		if (!command || typeof command !== 'string') {
			return { allowed: false, reason: 'Empty or invalid command' };
		}

		// Check exfiltration patterns on the full command first
		const exfilResult = this.checkExfiltrationPatterns(command);
		if (!exfilResult.allowed) return exfilResult;

		// Check env var access patterns on the full command
		const envResult = this.checkEnvAccess(command);
		if (!envResult.allowed) return envResult;

		// Split on chain operators and validate each segment
		const segments = this.splitCommand(command);

		for (const segment of segments) {
			const trimmed = segment.trim();
			if (!trimmed) continue;

			const result = this.validateSegment(trimmed);
			if (!result.allowed) return result;
		}

		return { allowed: true };
	}

	/**
	 * Get recorded security events.
	 */
	getEvents(): SecurityEvent[] {
		return [...this.events];
	}

	/**
	 * Clear recorded events.
	 */
	clearEvents(): void {
		this.events = [];
	}

	/**
	 * Split a command string on shell chain operators.
	 */
	private splitCommand(command: string): string[] {
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
					i += split; // skip extra chars for && or ||
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

	/**
	 * Check if the character toggles a quote state. Returns null if not a quote.
	 */
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
	 * Match a chain operator at position i. Returns extra chars to skip, or null.
	 */
	private matchOperator(command: string, i: number): null | number {
		const char = command[i];
		if (char === ';') return 0;
		if (char === '|' && command[i + 1] === '|') return 1;
		if (char === '&' && command[i + 1] === '&') return 1;
		if (char === '|') return 0;
		return null;
	}

	/**
	 * Validate a single command segment.
	 */
	private validateSegment(segment: string): CommandValidationResult {
		const command = segment.trim();
		// Extract the base command (first word)
		const baseCommand = command.split(/\s+/)[0]?.replace(/^.*\//, '') ?? '';

		// Check network commands
		if (NETWORK_COMMANDS.includes(baseCommand)) {
			return this.block(command, `Network command blocked: ${baseCommand} — potential data exfiltration vector`);
		}

		// Check remote access commands
		if (REMOTE_ACCESS_COMMANDS.includes(baseCommand)) {
			return this.block(command, `Remote access command blocked: ${baseCommand} — potential data exfiltration vector`);
		}

		// Check eval/exec patterns
		for (const pattern of EVAL_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Arbitrary code execution blocked: matches pattern ${pattern.source}`);
			}
		}

		return { allowed: true };
	}

	/**
	 * Check for data exfiltration patterns.
	 */
	private checkExfiltrationPatterns(command: string): CommandValidationResult {
		for (const pattern of EXFILTRATION_PATTERNS) {
			if (pattern.test(command)) {
				return this.block(command, `Exfiltration pattern detected: ${pattern.source}`);
			}
		}
		return { allowed: true };
	}

	/**
	 * Check for environment variable credential access.
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

	private logEvent(command: string, reason: string): void {
		const event = createSecurityEvent('command_blocked', 'critical', {
			command: command.slice(0, 200),
			reason
		});
		this.events.push(event);

		const logger = getLogger();
		logger.warn(`[Security] Command blocked`, { command: command.slice(0, 200), reason });
	}
}

/**
 * Singleton instance
 */
let instance: CommandGuard | null = null;

export function getCommandGuard(): CommandGuard {
	instance ??= new CommandGuard();
	return instance;
}

export function resetCommandGuard(): void {
	instance = null;
}
