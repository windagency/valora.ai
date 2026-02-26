/**
 * Input Validator - Security validation for user inputs
 *
 * Validates and sanitizes user inputs to prevent injection attacks
 */

import * as path from 'path';

import { isNonEmptyString } from './type-guards';

/**
 * Validation result for tool call arguments
 */
export interface ValidationResult {
	errors: string[];
	metrics: {
		inputDepth: number;
		inputSizeBytes: number;
		maxArrayLength: number;
	};
	valid: boolean;
	warnings: string[];
}

export class InputValidationError extends Error {
	constructor(
		message: string,
		public readonly field: string,
		public readonly value: string
	) {
		super(message);
		this.name = 'InputValidationError';
	}
}

/**
 * Configuration options for InputValidator instance
 */
export interface InputValidatorOptions {
	maxArrayLength?: number;
	maxObjectDepth?: number;
	maxStringLength?: number;
	maxTotalSize?: number;
}

/**
 * Malicious patterns to detect in input strings
 */
const MALICIOUS_PATTERNS = [
	// Path traversal
	{ name: 'path_traversal', pattern: /\.\.[/\\]/ },
	{ name: 'absolute_path_unix', pattern: /^\/(?:etc|proc|sys|root|home|var|usr)(?:\/|$)/ },
	{ name: 'absolute_path_windows', pattern: /^[A-Za-z]:\\(?:Windows|Program Files|Users)/i },
	{ name: 'home_dir', pattern: /^~(?:root|[a-zA-Z0-9_-]+)?(?:\/|\\)/ },

	// Command injection
	{ name: 'command_injection_semicolon', pattern: /;\s*(?:rm|cat|echo|wget|curl|bash|sh|python|node|eval)/ },
	{ name: 'command_injection_pipe', pattern: /\|\s*(?:rm|cat|echo|wget|curl|bash|sh|python|node)/ },
	{ name: 'command_injection_backtick', pattern: /`[^`]+`/ },
	{ name: 'command_injection_subshell', pattern: /\$\([^)]+\)/ },
	{ name: 'command_injection_and', pattern: /&&\s*(?:rm|cat|echo|wget|curl|bash|sh)/ },
	{ name: 'command_injection_or', pattern: /\|\|\s*(?:rm|cat|echo|wget|curl|bash|sh)/ },

	// Environment variable manipulation
	{ name: 'ld_preload', pattern: /LD_PRELOAD\s*=/ },
	{ name: 'path_manipulation', pattern: /PATH\s*=.*\/(?:evil|tmp|malicious)/ },

	// Dangerous options
	{ name: 'dangerous_exec', pattern: /--exec\s+(?:rm|cat|wget|curl|bash|sh)/ },

	// Script injection
	{ name: 'xss_script', pattern: /<script[^>]*>/i },
	{ name: 'javascript_url', pattern: /javascript:/i },
	{ name: 'data_url', pattern: /data:\s*text\/html/i }
];

/**
 * Validation utilities for security-critical inputs
 */
export class InputValidator {
	/**
	 * Maximum safe length for various inputs
	 */
	private static readonly MAX_LENGTHS = {
		BRANCH_NAME: 255,
		PATH: 4096,
		REASON: 500
	};

	/**
	 * Instance configuration for validate() method
	 */
	private readonly config: Required<InputValidatorOptions>;

	constructor(options: InputValidatorOptions = {}) {
		this.config = {
			maxArrayLength: options.maxArrayLength ?? 10000,
			maxObjectDepth: options.maxObjectDepth ?? 10,
			maxStringLength: options.maxStringLength ?? 10 * 1024 * 1024, // 10MB
			maxTotalSize: options.maxTotalSize ?? 10 * 1024 * 1024 // 10MB
		};
	}

	/**
	 * Validate any input value against configured limits and malicious patterns
	 */
	validate(input: unknown): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		let maxDepth = 0;
		let maxArrayLen = 0;

		// eslint-disable-next-line complexity
		const checkValue = (value: unknown, depth: number): void => {
			if (depth > maxDepth) {
				maxDepth = depth;
			}

			if (depth > this.config.maxObjectDepth) {
				errors.push(`Maximum nesting depth ${this.config.maxObjectDepth} exceeded at depth ${depth}`);
				return;
			}

			if (typeof value === 'string') {
				if (value.length > this.config.maxStringLength) {
					errors.push(`String length ${value.length} exceeds limit of ${this.config.maxStringLength}`);
				}
				// Check for malicious patterns
				this.checkMaliciousPatterns(value, warnings);
			} else if (Array.isArray(value)) {
				if (value.length > maxArrayLen) {
					maxArrayLen = value.length;
				}
				if (value.length > this.config.maxArrayLength) {
					errors.push(`Array length ${value.length} exceeds limit of ${this.config.maxArrayLength}`);
				} else {
					for (const item of value) {
						checkValue(item, depth + 1);
					}
				}
			} else if (value !== null && typeof value === 'object') {
				for (const v of Object.values(value)) {
					checkValue(v, depth + 1);
				}
			}
		};

		// Check total size for objects
		if (input !== null && typeof input === 'object') {
			try {
				const jsonStr = JSON.stringify(input);
				const size = Buffer.byteLength(jsonStr, 'utf8');
				if (size > this.config.maxTotalSize) {
					errors.push(`Total size ${size} bytes exceeds limit of ${this.config.maxTotalSize}`);
				}
			} catch {
				// Circular reference or other serialisation issue
				warnings.push('Could not calculate total size (possible circular reference)');
			}
		}

		checkValue(input, 0);

		return {
			errors,
			metrics: {
				inputDepth: maxDepth,
				inputSizeBytes: 0,
				maxArrayLength: maxArrayLen
			},
			valid: errors.length === 0,
			warnings
		};
	}

	/**
	 * Check for malicious patterns in a string
	 */
	private checkMaliciousPatterns(value: string, warnings: string[]): void {
		for (const { name, pattern } of MALICIOUS_PATTERNS) {
			if (pattern.test(value)) {
				warnings.push(`Potentially malicious pattern detected: ${name}`);
			}
		}
	}

	/**
	 * Validate git branch name
	 *
	 * Git branch names must:
	 * - Not contain special shell characters
	 * - Not start with . or /
	 * - Not contain ..
	 * - Only contain alphanumeric, -, _, /
	 * - Not end with .lock
	 * - Not be empty
	 */
	static validateBranchName(name: string): void {
		this.checkBranchNameBasics(name);
		this.checkBranchNameSecurity(name);
		this.checkBranchNameGitRules(name);
		this.checkBranchNameCharacters(name);
	}

	private static checkBranchNameBasics(name: string): void {
		if (!isNonEmptyString(name)) {
			throw new InputValidationError('Branch name is required', 'branch', name);
		}

		if (name.length > this.MAX_LENGTHS.BRANCH_NAME) {
			throw new InputValidationError(
				`Branch name too long (max ${this.MAX_LENGTHS.BRANCH_NAME} chars)`,
				'branch',
				name
			);
		}
	}

	private static checkBranchNameCharacters(name: string): void {
		const validPattern = /^[a-zA-Z0-9/_-]+$/;
		if (!validPattern.test(name)) {
			throw new InputValidationError('Branch name contains invalid characters', 'branch', name);
		}
	}

	private static checkBranchNameGitRules(name: string): void {
		if (name.startsWith('.') || name.startsWith('/')) {
			throw new InputValidationError('Branch name cannot start with . or /', 'branch', name);
		}

		if (name.endsWith('.lock')) {
			throw new InputValidationError('Branch name cannot end with .lock', 'branch', name);
		}

		if (name.includes('//') || name.includes('@{')) {
			throw new InputValidationError('Branch name contains invalid git sequences', 'branch', name);
		}
	}

	private static checkBranchNameSecurity(name: string): void {
		if (name.includes('..')) {
			throw new InputValidationError('Branch name cannot contain ".."', 'branch', name);
		}

		const shellMetachars = /[;&|`$()<>{}[\]\\'"!\n\r\t]/;
		if (shellMetachars.test(name)) {
			throw new InputValidationError('Branch name contains invalid characters', 'branch', name);
		}
	}

	/**
	 * Validate and sanitize file path
	 *
	 * Ensures path:
	 * - Is within allowed directory
	 * - Doesn't contain path traversal (..)
	 * - Is not a symbolic link outside allowed area
	 * - Doesn't contain null bytes
	 */
	static validatePath(targetPath: string, allowedRoot: string): string {
		if (!isNonEmptyString(targetPath)) {
			throw new InputValidationError('Path is required', 'path', targetPath);
		}

		if (targetPath.length > this.MAX_LENGTHS.PATH) {
			throw new InputValidationError(`Path too long (max ${this.MAX_LENGTHS.PATH} chars)`, 'path', targetPath);
		}

		// Check for null bytes (path injection)
		if (targetPath.includes('\0')) {
			throw new InputValidationError('Path contains null bytes', 'path', targetPath);
		}

		// Resolve to absolute path
		const absolutePath = path.resolve(targetPath);
		const absoluteRoot = path.resolve(allowedRoot);

		// Check if path is within allowed root
		if (!absolutePath.startsWith(absoluteRoot)) {
			throw new InputValidationError('Path is outside allowed directory', 'path', targetPath);
		}

		// Additional check for .. after resolution (should be caught above, but defense in depth)
		if (absolutePath.includes('..')) {
			throw new InputValidationError('Path contains directory traversal', 'path', targetPath);
		}

		return absolutePath;
	}

	/**
	 * Validate git ref (branch, tag, commit)
	 *
	 * Refs must:
	 * - Only contain safe characters
	 * - Not contain shell metacharacters
	 * - Not be excessively long
	 */
	static validateGitRef(ref: string): void {
		if (!isNonEmptyString(ref)) {
			throw new InputValidationError('Git ref is required', 'ref', ref);
		}

		if (ref.length > this.MAX_LENGTHS.BRANCH_NAME) {
			throw new InputValidationError(`Git ref too long (max ${this.MAX_LENGTHS.BRANCH_NAME} chars)`, 'ref', ref);
		}

		// Check for shell metacharacters
		const shellMetachars = /[;&|`$()<>{}[\]\\'"!\n\r\t]/;
		if (shellMetachars.test(ref)) {
			throw new InputValidationError('Git ref contains invalid characters', 'ref', ref);
		}

		// Check for path traversal
		if (ref.includes('..')) {
			throw new InputValidationError('Git ref cannot contain ".."', 'ref', ref);
		}

		// Allow refs/heads/, refs/tags/, commit hashes, HEAD, etc.
		const validPattern = /^[a-zA-Z0-9/_.-]+$/;
		if (!validPattern.test(ref)) {
			throw new InputValidationError('Git ref contains invalid characters', 'ref', ref);
		}
	}

	/**
	 * Validate and sanitize reason text
	 *
	 * Used for lock reasons, commit messages, etc.
	 */
	static validateReasonText(text: string): string {
		if (!isNonEmptyString(text)) {
			return 'No reason provided';
		}

		// Truncate if too long
		if (text.length > this.MAX_LENGTHS.REASON) {
			text = text.substring(0, this.MAX_LENGTHS.REASON);
		}

		// Remove dangerous characters but preserve readability
		// Allow alphanumeric, spaces, basic punctuation (NOT semicolons or quotes)
		text = text.replace(/[^\w\s.,!?:()-]/g, '');

		// Remove multiple spaces
		text = text.replace(/\s+/g, ' ').trim();

		return text || 'No reason provided';
	}

	/**
	 * Validate exploration ID format
	 *
	 * Should match pattern: exp-{nanoid}
	 */
	static validateExplorationId(id: string): void {
		if (!isNonEmptyString(id)) {
			throw new InputValidationError('Exploration ID is required', 'id', id);
		}

		// Should match nanoid pattern (alphanumeric, -, _)
		const validPattern = /^exp-[a-zA-Z0-9_-]+$/;
		if (!validPattern.test(id)) {
			throw new InputValidationError('Invalid exploration ID format', 'id', id);
		}

		if (id.length > 50) {
			throw new InputValidationError('Exploration ID too long', 'id', id);
		}
	}

	/**
	 * Validate numeric input
	 */
	static validateNumber(value: number, min: number, max: number, name: string): void {
		if (typeof value !== 'number' || isNaN(value)) {
			throw new InputValidationError(`${name} must be a number`, name, String(value));
		}

		if (value < min || value > max) {
			throw new InputValidationError(`${name} must be between ${min} and ${max}`, name, String(value));
		}
	}

	/**
	 * Sanitize command output
	 *
	 * Remove potentially dangerous content from command output
	 * before logging or displaying
	 */
	static sanitizeCommandOutput(output: string): string {
		if (!isNonEmptyString(output)) {
			return '';
		}

		// Remove ANSI escape codes
		// eslint-disable-next-line no-control-regex
		output = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

		// Remove control characters except newline and tab
		// eslint-disable-next-line no-control-regex
		output = output.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

		return output;
	}
}

/**
 * Validate MCP tool call arguments for security and resource constraints
 *
 * Checks for:
 * - Maximum input size (prevent DoS)
 * - Maximum nesting depth (prevent stack overflow)
 * - Maximum array lengths (prevent memory exhaustion)
 * - Malicious patterns in strings
 */
export function validateToolCallArgs(args: Record<string, unknown>): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Calculate input size
	const jsonString = JSON.stringify(args);
	const inputSizeBytes = Buffer.byteLength(jsonString, 'utf8');

	// Security limits
	const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB
	const MAX_DEPTH = 10;
	const MAX_ARRAY_LENGTH = 10000;
	const WARN_INPUT_SIZE = 5 * 1024 * 1024; // 5MB

	// Check input size
	if (inputSizeBytes > MAX_INPUT_SIZE) {
		errors.push(`Input too large: ${inputSizeBytes} bytes (max ${MAX_INPUT_SIZE})`);
	} else if (inputSizeBytes > WARN_INPUT_SIZE) {
		warnings.push(`Large input detected: ${inputSizeBytes} bytes`);
	}

	// Check nesting depth and array lengths
	let maxDepth = 0;
	let maxArrayLength = 0;

	function checkDepth(depth: number): boolean {
		if (depth > maxDepth) {
			maxDepth = depth;
		}

		if (depth > MAX_DEPTH) {
			errors.push(`Nesting depth exceeds maximum: ${depth} (max ${MAX_DEPTH})`);
			return false;
		}

		return true;
	}

	function validateArray(arr: unknown[], depth: number): void {
		if (arr.length > maxArrayLength) {
			maxArrayLength = arr.length;
		}

		if (arr.length > MAX_ARRAY_LENGTH) {
			errors.push(`Array too long: ${arr.length} elements (max ${MAX_ARRAY_LENGTH})`);
			return;
		}

		for (const item of arr) {
			traverse(item, depth + 1);
		}
	}

	function validateObject(obj: Record<string, unknown>, depth: number): void {
		for (const value of Object.values(obj)) {
			traverse(value, depth + 1);
		}
	}

	function validateString(str: string): void {
		if (str.includes('\0')) {
			errors.push('Null bytes detected in string input');
		}

		// Check for malicious patterns
		for (const { name, pattern } of MALICIOUS_PATTERNS) {
			if (pattern.test(str)) {
				errors.push(`Potentially malicious pattern detected: ${name}`);
			}
		}
	}

	function traverse(obj: unknown, depth: number): void {
		if (!checkDepth(depth)) {
			return;
		}

		if (Array.isArray(obj)) {
			validateArray(obj, depth);
		} else if (obj !== null && typeof obj === 'object') {
			validateObject(obj as Record<string, unknown>, depth);
		} else if (typeof obj === 'string') {
			validateString(obj);
		}
	}

	traverse(args, 0);

	return {
		errors,
		metrics: {
			inputDepth: maxDepth,
			inputSizeBytes,
			maxArrayLength
		},
		valid: errors.length === 0,
		warnings
	};
}

/**
 * Validate completion options (similar to validateToolCallArgs but for LLM completions)
 *
 * This is a wrapper around validateToolCallArgs for completion-specific validation
 */
export function validateCompletionOptions(options: Record<string, unknown>): ValidationResult {
	// Reuse the same validation logic as tool call args
	return validateToolCallArgs(options);
}

/**
 * Validate any input using the InputValidator
 *
 * Convenience function for validating arbitrary inputs
 */
export function validateInput(input: unknown): ValidationResult {
	const validator = new InputValidator();
	return validator.validate(input);
}

/**
 * Paths that are forbidden from any write, delete, or modification operations.
 * These paths contain system configuration and should never be modified by commands, agents, or prompts.
 * All patterns use forward slashes (paths are normalised before matching).
 */
const FORBIDDEN_WRITE_PATHS = ['.ai/'] as const;

/**
 * Normalise a file path to use forward slashes consistently
 */
function normalisePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

/**
 * Check if a normalised path matches a forbidden pattern
 */
function matchesForbiddenPath(normalizedPath: string, forbiddenPattern: string): boolean {
	// Check if path starts with forbidden path (relative path)
	// or contains the forbidden path anywhere (for absolute paths)
	return normalizedPath.startsWith(forbiddenPattern) || normalizedPath.includes(`/${forbiddenPattern}`);
}

/**
 * Create a forbidden path error with consistent messaging
 */
function createForbiddenPathError(operation: string, originalPath: string): Error {
	return new Error(
		`Cannot ${operation} files in .ai/ - this folder contains system configuration ` +
			`for VALORA commands, agents, and prompts. Path: ${originalPath}`
	);
}

/**
 * Validate that a path is not in the forbidden write paths.
 * Throws an error if the path targets the .ai/ folder or other protected system paths.
 *
 * @param path - The path to validate (can be relative or absolute)
 * @param operation - The operation being attempted (e.g., "write to", "delete", "modify")
 * @throws Error if the path is forbidden
 */
export function validateNotForbiddenPath(path: string, operation: string): void {
	const normalizedPath = normalisePath(path);

	const isForbidden = FORBIDDEN_WRITE_PATHS.some((forbidden) => matchesForbiddenPath(normalizedPath, forbidden));

	if (isForbidden) {
		throw createForbiddenPathError(operation, path);
	}
}

/**
 * Check if a path is forbidden without throwing an error.
 * Useful for conditional logic where you need to check before attempting an operation.
 *
 * @param path - The path to check (can be relative or absolute)
 * @returns true if the path is forbidden, false otherwise
 */
export function isForbiddenPath(path: string): boolean {
	const normalizedPath = normalisePath(path);
	return FORBIDDEN_WRITE_PATHS.some((forbidden) => matchesForbiddenPath(normalizedPath, forbidden));
}
