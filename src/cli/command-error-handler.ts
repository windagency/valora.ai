/**
 * Command Error Handler - Handles error processing and recovery for command execution
 */

import type { SessionLifecycle } from 'session/lifecycle';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getHeaderFormatter } from 'output/header-formatter';
import { getLogger } from 'output/logger';
import { getProgress } from 'output/progress';
import { getEnvironmentSummary, isSandboxedEnvironment } from 'utils/environment';
import { BaseError, createErrorContext, ExecutionError, safeAsync } from 'utils/error-handler';
import { getErrorMessage, hasErrorMessage } from 'utils/error-messages';

export interface ErrorHandlingContext {
	commandName: string;
	duration: number;
	sessionId?: string;
	sessionLifecycle: SessionLifecycle;
}

export class CommandErrorHandler {
	private color = getColorAdapter();
	private console = getConsoleOutput();
	private logger = getLogger();
	private progress = getProgress();

	/**
	 * Handle command execution error with comprehensive error handling
	 */
	async handleExecutionError(error: Error, context: ErrorHandlingContext): Promise<never> {
		const errorContext = createErrorContext('command-executor', 'execute', {
			command: context.commandName,
			duration: context.duration,
			sandboxed: isSandboxedEnvironment(),
			sessionId: context.sessionId,
			...getEnvironmentSummary()
		});

		this.logger.error('Command execution failed', error, errorContext);
		this.progress.fail(`Command failed: ${context.commandName}`);

		// Display appropriate error message
		this.displayError(error, context);

		// Handle session cleanup
		await this.handleSessionCleanup(error, context);

		// Re-throw with enhanced context if needed
		if (!(error instanceof ExecutionError)) {
			throw new ExecutionError(
				`Command execution failed: ${context.commandName}`,
				{
					commandName: context.commandName,
					originalError: error.message
				},
				errorContext
			);
		}

		throw error;
	}

	/**
	 * Display appropriate error message based on environment
	 */
	private displayError(error: Error, _context: ErrorHandlingContext): void {
		// Check if this is a BaseError with user-friendly information
		if (this.shouldDisplayFriendlyError(error)) {
			this.displayFriendlyError(error as BaseError);
			return;
		}

		// Check for error template by code
		if (this.shouldDisplayTemplatedError(error)) {
			this.displayTemplatedError(error as BaseError);
			return;
		}

		// Fallback to legacy error display
		this.displayLegacyError(error.message);
	}

	/**
	 * Check if error should use friendly display
	 */
	private shouldDisplayFriendlyError(error: Error): boolean {
		return (
			error instanceof BaseError &&
			(Boolean(error.userMessage) || (error.fixSuggestions?.length ?? 0) > 0 || hasErrorMessage(error.code))
		);
	}

	/**
	 * Check if error should use templated display
	 */
	private shouldDisplayTemplatedError(error: Error): boolean {
		return error instanceof BaseError && hasErrorMessage(error.code);
	}

	/**
	 * Display legacy error format based on environment
	 */
	private displayLegacyError(errorMessage: string): void {
		if (isSandboxedEnvironment() && this.isSandboxRelatedError(errorMessage)) {
			this.displaySandboxedError(errorMessage);
		} else {
			this.displayGeneralError(errorMessage);
		}
	}

	/**
	 * Check if error is sandbox-related
	 */
	private isSandboxRelatedError(errorMessage: string): boolean {
		return (
			errorMessage.includes('network') || errorMessage.includes('API key') || errorMessage.includes('LLM operations')
		);
	}

	/**
	 * Display friendly error with user message and fix suggestions
	 */
	private displayFriendlyError(error: BaseError): void {
		const isVerbose = process.env['AI_VERBOSE'] === 'true';
		const title = error.userMessage ?? error.message;
		const message = error.message;

		// Display error box
		this.displayErrorBox(title);

		// Display explanation
		if (error.userMessage && error.userMessage !== message) {
			this.console.print(this.color.gray(`  ${message}`));
			this.console.blank();
		}

		// Display fix suggestions
		if (error.fixSuggestions && error.fixSuggestions.length > 0) {
			this.console.print(this.color.getRawFn('cyan.bold')('  🔧 HOW TO FIX'));
			this.console.blank();
			error.fixSuggestions.forEach((fix, index) => {
				this.console.print(this.color.gray(`  ${index + 1}. ${fix}`));
			});
			this.console.blank();
		}

		// Display docs link
		if (error.docsLink) {
			this.console.print(this.color.gray(`  📚 Learn more: ${error.docsLink}`));
			this.console.blank();
		}

		// Display technical details in verbose mode
		if (isVerbose) {
			this.displayTechnicalDetails(error);
		} else {
			this.console.print(this.color.gray('  💡 TIP: Run with --verbose for technical details'));
			this.console.blank();
		}
	}

	/**
	 * Display error using template
	 */
	private displayTemplatedError(error: BaseError): void {
		const template = getErrorMessage(error.code);
		if (!template) {
			this.displayGeneralError(error.message);
			return;
		}

		const isVerbose = process.env['AI_VERBOSE'] === 'true';

		// Display error box
		this.displayErrorBox(template.title);

		// Display message
		this.console.print(this.color.gray(`  ${template.message}`));
		this.console.blank();

		// Display fix suggestions
		if (template.fixes.length > 0) {
			this.console.print(this.color.getRawFn('cyan.bold')('  🔧 HOW TO FIX'));
			this.console.blank();
			template.fixes.forEach((fix, index) => {
				this.console.print(this.color.gray(`  ${index + 1}. ${fix}`));
			});
			this.console.blank();
		}

		// Display docs link
		if (template.docsLink) {
			this.console.print(this.color.gray(`  📚 Learn more: ${template.docsLink}`));
			this.console.blank();
		}

		// Display technical details in verbose mode
		if (isVerbose) {
			this.displayTechnicalDetails(error);
		} else {
			this.console.print(this.color.gray('  💡 TIP: Run with --verbose for technical details'));
			this.console.blank();
		}

		// Issue reporting link
		this.console.print(this.color.gray('  🐛 Report issue: https://github.com/valora/issues/new'));
		this.console.blank();
	}

	/**
	 * Display error box with title
	 */
	private displayErrorBox(title: string): void {
		const headerFormatter = getHeaderFormatter();
		const errorHeader = headerFormatter.formatHeader(`❌ ${title}`, { color: 'red', minWidth: 58 });

		this.console.print(errorHeader);
	}

	/**
	 * Display technical details for debugging
	 */
	private displayTechnicalDetails(error: BaseError): void {
		this.console.print(this.color.yellow('  ───────────────────────────────────────────────────────'));
		this.console.blank();
		this.console.print(this.color.yellow('  Technical details (for debugging):'));
		this.console.blank();
		this.console.print(this.color.gray(`  Error: ${error.name}: ${error.message}`));
		this.console.print(this.color.gray(`  Code: ${error.code}`));

		if (error.context) {
			this.console.print(this.color.gray(`  Component: ${error.context.component}`));
			this.console.print(this.color.gray(`  Operation: ${error.context.operation}`));
		}

		if (error.stack) {
			this.console.blank();
			this.console.print(this.color.gray('  Stack trace:'));
			const stackLines = error.stack.split('\n').slice(1, 6); // Show first 5 lines
			stackLines.forEach((line) => {
				this.console.print(this.color.gray(`  ${line.trim()}`));
			});
		}

		this.console.blank();
	}

	/**
	 * Display sandboxed environment specific error
	 */
	private displaySandboxedError(errorMessage: string): void {
		this.console.blank();
		this.console.error('Command failed in sandboxed environment');
		this.console.print(`Error: ${errorMessage}`);
		this.console.blank();
		this.console.print('💡 Sandboxed Environment Notes:');
		this.console.list([
			'File system access is restricted (logs/sessions may not persist)',
			'Network access may be blocked (API calls may fail)',
			'Configure API keys for full LLM functionality',
			'Some commands may work with local processing only'
		]);
		this.console.blank();
	}

	/**
	 * Display general error message
	 */
	private displayGeneralError(errorMessage: string): void {
		this.console.blank();
		this.console.error(errorMessage);
		this.console.blank();
	}

	/**
	 * Handle session cleanup on error
	 */
	private async handleSessionCleanup(error: Error, context: ErrorHandlingContext): Promise<void> {
		await safeAsync(
			async () => {
				if (context.sessionLifecycle.hasActiveSession()) {
					await context.sessionLifecycle.fail(error.message);
				}
			},
			undefined,
			createErrorContext('command-error-handler', 'session-cleanup', {
				commandName: context.commandName,
				sessionId: context.sessionId
			})
		);
	}
}
