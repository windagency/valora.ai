/**
 * Command discovery utilities - handles command file discovery and listing
 */

import { getLogger } from 'output/logger';
import * as path from 'path';
import { ValidationError } from 'utils/error-handler';
import { fileExists, getFileStats, listFiles, resolveAIPath } from 'utils/file-utils';
import { isNonEmptyString } from 'utils/type-guards';

/**
 * Default commands directory
 */
export const DEFAULT_COMMANDS_DIR = resolveAIPath('commands');

/**
 * Command file extension
 */
export const COMMAND_FILE_EXTENSION = '.md';

/**
 * Maximum allowed length for command names
 */
export const MAX_COMMAND_NAME_LENGTH = 50;

/**
 * Maximum allowed size for command files (in bytes)
 */
export const MAX_COMMAND_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Validate command name for security
 * Prevents path traversal and injection attacks
 */
export function validateCommandName(commandName: string): void {
	if (!isNonEmptyString(commandName)) {
		throw new ValidationError('Command name must be a non-empty string', {
			commandName
		});
	}

	if (commandName.length > MAX_COMMAND_NAME_LENGTH) {
		throw new ValidationError(
			`Command name too long: ${commandName.length} characters (max: ${MAX_COMMAND_NAME_LENGTH})`,
			{
				commandName,
				length: commandName.length
			}
		);
	}

	// Check for path traversal characters
	// eslint-disable-next-line no-control-regex
	const dangerousChars = /[<>:"|?*\x00-\x1f\\/]/;
	if (dangerousChars.test(commandName)) {
		throw new ValidationError('Command name contains invalid characters', {
			commandName,
			reason: 'Path traversal or special characters not allowed'
		});
	}

	// Check for path traversal patterns
	const traversalPatterns = /\.\./;
	if (traversalPatterns.test(commandName)) {
		throw new ValidationError('Command name contains path traversal', {
			commandName,
			reason: 'Directory traversal (..) not allowed'
		});
	}

	// Check for Windows-specific dangerous patterns
	const windowsPatterns = /^[a-zA-Z]:|^\\\\|^\//;
	if (windowsPatterns.test(commandName)) {
		throw new ValidationError('Command name contains absolute path', {
			commandName,
			reason: 'Absolute paths not allowed'
		});
	}

	// Must be alphanumeric with dashes, underscores, or dots only
	const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_.]*$/;
	if (!validNamePattern.test(commandName)) {
		throw new ValidationError('Command name contains invalid characters', {
			commandName,
			reason: 'Only alphanumeric characters, dashes, underscores, and dots allowed'
		});
	}
}

/**
 * Validate commands directory path
 */
export function validateCommandsDirectory(commandsDir: string): void {
	if (!isNonEmptyString(commandsDir)) {
		throw new ValidationError('Commands directory must be a non-empty string', {
			commandsDir
		});
	}

	// Resolve to absolute path and check if it's within the AI directory
	const resolvedPath = path.resolve(commandsDir);
	const aiRoot = resolveAIPath('');

	// Ensure the commands directory is within the AI root
	if (!resolvedPath.startsWith(aiRoot)) {
		throw new ValidationError('Commands directory must be within the AI root directory', {
			aiRoot,
			commandsDir,
			resolvedPath
		});
	}

	// Check for dangerous path patterns
	const dangerousPathPatterns = /\.\./;
	if (dangerousPathPatterns.test(commandsDir)) {
		throw new ValidationError('Commands directory path contains traversal', {
			commandsDir,
			reason: 'Directory traversal (..) not allowed'
		});
	}
}

/**
 * Discover all available command files
 */
export async function discoverCommandFiles(commandsDir: string = DEFAULT_COMMANDS_DIR): Promise<string[]> {
	return listFiles(commandsDir, COMMAND_FILE_EXTENSION);
}

/**
 * Filter out template and meta files from command list
 */
export function filterCommandFiles(files: string[]): string[] {
	return files.filter((f) => !f.startsWith('_'));
}

/**
 * Extract command name from file name with validation
 */
export function extractCommandName(fileName: string): string {
	if (!isNonEmptyString(fileName)) {
		throw new ValidationError('File name must be a non-empty string', {
			fileName
		});
	}

	// Validate file extension
	if (!fileName.endsWith(COMMAND_FILE_EXTENSION)) {
		throw new ValidationError('File name must have .md extension', {
			expectedExtension: COMMAND_FILE_EXTENSION,
			fileName
		});
	}

	// Extract command name
	const commandName = fileName.slice(0, -COMMAND_FILE_EXTENSION.length);

	// Validate the extracted command name
	validateCommandName(commandName);

	return commandName;
}

/**
 * Convert command files to command names
 */
export function filesToCommandNames(files: string[]): string[] {
	return filterCommandFiles(files).map(extractCommandName);
}

/**
 * Get all available command names
 */
export async function listAvailableCommands(commandsDir: string = DEFAULT_COMMANDS_DIR): Promise<string[]> {
	const files = await discoverCommandFiles(commandsDir);
	return filesToCommandNames(files);
}

/**
 * Check if a command file exists
 */
export async function commandFileExists(
	commandName: string,
	commandsDir: string = DEFAULT_COMMANDS_DIR
): Promise<boolean> {
	const commands = await listAvailableCommands(commandsDir);
	return commands.includes(commandName);
}

/**
 * Get the full path to a command file
 * Validates inputs to prevent path traversal attacks
 */
export function getCommandFilePath(commandName: string, commandsDir: string = DEFAULT_COMMANDS_DIR): string {
	// Validate inputs
	validateCommandName(commandName);
	validateCommandsDirectory(commandsDir);

	// Construct safe path
	const fileName = `${commandName}${COMMAND_FILE_EXTENSION}`;
	const fullPath = path.join(commandsDir, fileName);

	// Double-check the final path is within the commands directory
	const resolvedCommandsDir = path.resolve(commandsDir);
	const resolvedFullPath = path.resolve(fullPath);

	if (!resolvedFullPath.startsWith(resolvedCommandsDir)) {
		throw new ValidationError('Command file path resolves outside commands directory', {
			commandName,
			commandsDir,
			fullPath,
			resolvedCommandsDir,
			resolvedFullPath
		});
	}

	return fullPath;
}

/**
 * Validate command file size and accessibility
 */
export async function validateCommandFile(filePath: string, commandName: string): Promise<void> {
	if (!fileExists(filePath)) {
		throw new ValidationError('Command file does not exist', {
			commandName,
			filePath
		});
	}

	const stats = await getFileStats(filePath);
	const fileSize = stats.size;

	if (fileSize > MAX_COMMAND_FILE_SIZE) {
		throw new ValidationError(`Command file too large: ${fileSize} bytes (max: ${MAX_COMMAND_FILE_SIZE})`, {
			commandName,
			filePath,
			fileSize,
			maxSize: MAX_COMMAND_FILE_SIZE
		});
	}

	if (fileSize === 0) {
		throw new ValidationError('Command file is empty', {
			commandName,
			filePath
		});
	}
}

/**
 * Load all command files with error handling
 */
export async function loadAllCommandFiles(
	commandsDir: string = DEFAULT_COMMANDS_DIR
): Promise<{ invalid: Array<{ error: string; name: string }>; valid: string[] }> {
	const logger = getLogger();

	// Validate commands directory
	validateCommandsDirectory(commandsDir);

	const files = await discoverCommandFiles(commandsDir);

	// Process files in parallel and categorize results
	const results = await Promise.all(
		files
			.filter((file) => !file.startsWith('_')) // Skip template and meta files
			.map(async (file) => {
				try {
					const commandName = extractCommandName(file);
					const filePath = getCommandFilePath(commandName, commandsDir);

					// Validate file accessibility and size
					await validateCommandFile(filePath, commandName);

					return { status: 'valid' as const, value: commandName };
				} catch (error) {
					const errorMessage = (error as Error).message;
					const fallbackName = file.replace(COMMAND_FILE_EXTENSION, '');
					logger.warn(`Failed to validate command file ${fallbackName}`, { error: errorMessage });
					return { status: 'invalid' as const, value: { error: errorMessage, name: fallbackName } };
				}
			})
	);

	// Separate valid and invalid results
	return results.reduce(
		(acc, result) => {
			if (result.status === 'valid') {
				acc.valid.push(result.value);
			} else {
				acc.invalid.push(result.value);
			}
			return acc;
		},
		{ invalid: [], valid: [] } as { invalid: Array<{ error: string; name: string }>; valid: string[] }
	);
}
