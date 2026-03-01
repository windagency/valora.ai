/**
 * Command Validator - Handles command execution validation and rate limiting
 *
 * Validates command prerequisites before execution, including:
 * - Rate limiting checks
 * - File path argument validation
 */

import * as fs from 'fs';
import { getColorAdapter } from 'output/color-adapter.interface';
import * as path from 'path';
import { createErrorContext, ExecutionError } from 'utils/error-handler';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

export interface FileValidationResult {
	error?: ExecutionError;
	invalidFiles: Array<{ flag: string; path: string; reason: string }>;
	isValid: boolean;
}

export interface ValidationResult {
	error?: ExecutionError;
	isValid: boolean;
}

export class CommandValidator {
	/**
	 * Validate command execution prerequisites
	 */
	validateCommand(commandName: string): ValidationResult {
		try {
			// Check rate limiting
			const rateLimitResult = this.checkRateLimit(commandName);
			if (!rateLimitResult.isValid) {
				return rateLimitResult;
			}

			return { isValid: true };
		} catch (error) {
			return {
				error: new ExecutionError(
					`Command validation failed: ${commandName}`,
					{
						commandName,
						originalError: (error as Error).message
					},
					createErrorContext('command-validator', 'validate-command', { commandName })
				),
				isValid: false
			};
		}
	}

	/**
	 * Check rate limiting for command execution
	 */
	private checkRateLimit(commandName: string): ValidationResult {
		const rateLimitKey = `command:${commandName}`;

		if (!checkRateLimit(rateLimitKey, 'command_execution')) {
			const status = getRateLimitStatus(rateLimitKey, 'command_execution');
			const resetInSeconds = Math.ceil((status.resetTime - Date.now()) / 1000);

			return {
				error: new ExecutionError(
					`Command execution rate limit exceeded for '${commandName}'. Try again in ${resetInSeconds} seconds.`,
					{
						blockedUntil: status.blockedUntil,
						commandName,
						remaining: status.remaining,
						resetTime: status.resetTime
					},
					createErrorContext('command-validator', 'rate-limit-check', { commandName })
				),
				isValid: false
			};
		}

		return { isValid: true };
	}

	/**
	 * Validate file path arguments (e.g., --specs-file, --prd-file)
	 *
	 * Checks that any flag ending with '-file' or 'File' points to an existing file.
	 * This prevents wasted API calls when input files do not exist.
	 *
	 * @param commandName - The name of the command being executed
	 * @param flags - Parsed flags from Commander
	 * @param args - Additional args that may contain unparsed flags (e.g., --specs-file=path)
	 */
	validateFileArguments(
		commandName: string,
		flags: Record<string, boolean | string | undefined>,
		args: string[] = []
	): FileValidationResult {
		const invalidFiles: Array<{ flag: string; path: string; reason: string }> = [];

		// Extract file flags from parsed options and raw args
		const parsedFileFlags = this.extractFileFlagsFromOptions(flags);
		const argsFileFlags = this.extractFileFlagsFromArgs(args);
		const allFileFlags = [...parsedFileFlags, ...argsFileFlags];

		// Validate each file path
		for (const [flagName, filePath] of allFileFlags) {
			const validationError = this.validateSingleFilePath(filePath);
			if (validationError) {
				invalidFiles.push({
					flag: flagName,
					path: filePath,
					reason: validationError
				});
			}
		}

		if (invalidFiles.length === 0) {
			return { invalidFiles: [], isValid: true };
		}

		const color = getColorAdapter();
		const errorMessage = this.formatFileValidationError(commandName, invalidFiles, color);

		return {
			error: new ExecutionError(
				errorMessage,
				{ commandName, invalidFiles },
				createErrorContext('command-validator', 'file-validation', { commandName })
			),
			invalidFiles,
			isValid: false
		};
	}

	/**
	 * Extract file-related flags from parsed Commander options
	 */
	private extractFileFlagsFromOptions(flags: Record<string, boolean | string | undefined>): Array<[string, string]> {
		return Object.entries(flags)
			.filter(([key, value]) => {
				// Match flags like: specsFile, specs-file, prdFile, prd-file
				const isFileFlag = key.endsWith('File') || key.endsWith('-file') || key.includes('file');
				return isFileFlag && typeof value === 'string' && value.length > 0;
			})
			.map(([key, value]) => [key, value] as [string, string]);
	}

	/**
	 * Validate a single file path exists and is a file
	 *
	 * @returns Error message if invalid, undefined if valid
	 */
	private validateSingleFilePath(filePath: string): string | undefined {
		const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

		if (!fs.existsSync(resolvedPath)) {
			return 'File does not exist';
		}

		const stats = fs.statSync(resolvedPath);
		if (!stats.isFile()) {
			return 'Path is a directory, not a file';
		}

		return undefined;
	}

	/**
	 * Format file validation error message for display
	 */
	private formatFileValidationError(
		commandName: string,
		invalidFiles: Array<{ flag: string; path: string; reason: string }>,
		color: ReturnType<typeof getColorAdapter>
	): string {
		const lines = [`${color.red('✖')} File validation failed for '${commandName}'`, ''];

		for (const { flag, path: filePath, reason } of invalidFiles) {
			const flagDisplay = flag
				.replace(/([A-Z])/g, '-$1')
				.toLowerCase()
				.replace(/^-/, '');
			lines.push(`  ${color.yellow('--' + flagDisplay)}: ${filePath}`);
			lines.push(`    ${color.dim(reason)}`);
			lines.push('');
		}

		lines.push(color.dim('Please check the file path and try again.'));

		return lines.join('\n');
	}

	/**
	 * Extract file-related flags from command args array
	 *
	 * Parses args for patterns like:
	 * - --specs-file=path
	 * - --specs-file path
	 * - --prd-file=path
	 */
	private extractFileFlagsFromArgs(args: string[]): Array<[string, string]> {
		const fileFlags: Array<[string, string]> = [];

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			if (!this.isFileFlagArg(arg)) continue;

			if (arg.includes('=')) {
				const parsed = this.parseEqualsFormat(arg);
				if (parsed) fileFlags.push(parsed);
			} else {
				const parsed = this.parseSpaceFormat(arg, args[i + 1]);
				if (parsed) {
					fileFlags.push(parsed);
					i++; // Skip the value in next iteration
				}
			}
		}

		return fileFlags;
	}

	/**
	 * Check if an argument is a file-related flag
	 */
	private isFileFlagArg(arg: string | undefined): arg is string {
		if (!arg?.startsWith('--')) return false;
		return arg.includes('-file') || arg.includes('File');
	}

	/**
	 * Parse --flag=value format
	 */
	private parseEqualsFormat(arg: string): [string, string] | null {
		const [flag, ...valueParts] = arg.split('=');
		const value = valueParts.join('='); // Handle paths with = in them
		if (flag && value) {
			return [flag.replace(/^--/, ''), value];
		}
		return null;
	}

	/**
	 * Parse --flag value format
	 */
	private parseSpaceFormat(arg: string, nextArg: string | undefined): [string, string] | null {
		if (nextArg && !nextArg.startsWith('-')) {
			return [arg.replace(/^--/, ''), nextArg];
		}
		return null;
	}
}
