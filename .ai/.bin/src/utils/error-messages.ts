/**
 * Centralized error message templates with user-friendly messages and fix suggestions
 */

export interface ErrorMessageTemplate {
	docsLink?: string;
	fixes: string[];
	message: string;
	title: string;
}

export const ERROR_MESSAGES: Record<string, ErrorMessageTemplate> = {
	API_KEY_INVALID: {
		fixes: [
			'Verify your API key is correct',
			'Check if the API key has expired',
			'Generate a new API key from your provider dashboard',
			'Try using a different provider: valora plan --provider=cursor'
		],
		message: 'The API key provided is invalid or has been revoked.',
		title: 'Invalid API Key'
	},

	API_RATE_LIMIT: {
		fixes: [
			'Wait a few minutes and try again',
			'Upgrade your provider plan for higher rate limits',
			'Use a different provider: valora plan --provider=anthropic',
			'Enable rate limiting in config: valora config setup'
		],
		message: 'You have exceeded the rate limit for your API provider.',
		title: 'Rate Limit Exceeded'
	},

	COMMAND_NOT_FOUND: {
		docsLink: 'https://docs.ai-orchestration.dev/commands',
		fixes: [
			'Run: valora list (to see all available commands)',
			'Check for typos in the command name',
			'Run: valora help (for command documentation)',
			'View available commands at the docs link above'
		],
		message: 'The command you specified does not exist or could not be found.',
		title: 'Command Not Found'
	},

	CONFIGURATION_INVALID: {
		docsLink: 'https://docs.ai-orchestration.dev/configuration',
		fixes: [
			'Run: valora config setup (to reconfigure)',
			'Check the configuration file for syntax errors',
			'Validate your YAML syntax',
			'Delete the config file and run setup again'
		],
		message:
			'The configuration file exists but contains invalid or malformed data. The configuration must be valid YAML and match the expected schema.',
		title: 'Invalid Configuration'
	},

	CONFIGURATION_NOT_FOUND: {
		docsLink: 'https://docs.ai-orchestration.dev/setup',
		fixes: [
			'Run: valora config setup (interactive setup)',
			'Set environment variable: export ANTHROPIC_API_KEY=your-key',
			'Use Cursor provider: valora plan --provider=cursor (no config needed)',
			'Create config manually at ~/.ai/config.yaml'
		],
		message:
			'The AI orchestration engine requires configuration before it can be used. You need to set up at least one AI provider or use the Cursor provider.',
		title: 'Configuration Not Found'
	},

	EXECUTION_TIMEOUT: {
		fixes: [
			'Try again with a simpler task',
			'Break down the task into smaller steps',
			'Check your network connection',
			'Increase timeout: valora plan --timeout=300'
		],
		message: 'The command execution exceeded the maximum allowed time.',
		title: 'Execution Timeout'
	},

	FILE_PERMISSION_DENIED: {
		fixes: [
			'Check file permissions: ls -la <file>',
			'Run with appropriate permissions',
			'Ensure the directory is writable',
			'Check if file is locked by another process'
		],
		message: 'Permission denied when trying to access a file or directory.',
		title: 'Permission Denied'
	},

	NETWORK_CONNECTION_FAILED: {
		fixes: [
			'Check your internet connection',
			'Verify firewall settings',
			'Try using a different network',
			'Check if the AI provider is experiencing outages',
			'Use a VPN if the provider is blocked in your region'
		],
		message: 'Failed to establish a network connection to the AI provider.',
		title: 'Network Connection Failed'
	},

	PROVIDER_NOT_CONFIGURED: {
		docsLink: 'https://docs.ai-orchestration.dev/providers',
		fixes: [
			'Run: valora config setup (to configure providers)',
			'Set API key environment variable for your provider',
			'Use Cursor provider: --provider=cursor (no config needed)',
			'Specify a different provider: --provider=anthropic'
		],
		message:
			'The specified AI provider is not configured. You need to add API credentials or use the Cursor provider which requires no configuration.',
		title: 'Provider Not Configured'
	},

	PROVIDER_SERVICE_ERROR: {
		fixes: [
			'Check provider status page for outages',
			'Try again in a few minutes',
			'Use a different provider: valora plan --provider=openai',
			'Contact provider support if issue persists'
		],
		message: 'The AI provider service returned an error or is temporarily unavailable.',
		title: 'Provider Service Error'
	},

	SESSION_CORRUPTED: {
		fixes: [
			'Delete corrupted session: valora session delete <session-id>',
			'Start a new session: valora plan (without --session flag)',
			'Check session directory permissions',
			'Clean up sessions: valora session clean'
		],
		message: 'The session data is corrupted or cannot be loaded.',
		title: 'Session Corrupted'
	},

	SESSION_NOT_FOUND: {
		fixes: [
			'List available sessions: valora session list',
			'Check session ID spelling',
			'Start a new session: valora plan (without --session flag)',
			'Sessions may have been cleaned up due to retention policy'
		],
		message: 'The specified session does not exist or has been deleted.',
		title: 'Session Not Found'
	},

	VALIDATION_FAILED: {
		fixes: [
			'Check the command arguments and options',
			'Run: valora help <command> (for usage examples)',
			'Ensure required arguments are provided',
			'Verify argument types and formats'
		],
		message: 'The command arguments or options failed validation.',
		title: 'Validation Failed'
	}
};

/**
 * Get error message template by error code
 */
export function getErrorMessage(code: string): ErrorMessageTemplate | undefined {
	return ERROR_MESSAGES[code];
}

/**
 * Check if error code has a template
 */
export function hasErrorMessage(code: string): boolean {
	return code in ERROR_MESSAGES;
}

/**
 * Get all error codes
 */
export function getErrorCodes(): string[] {
	return Object.keys(ERROR_MESSAGES);
}
