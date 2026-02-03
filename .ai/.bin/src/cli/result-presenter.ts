/**
 * Result Presenter - Handles command result display and formatting
 *
 * This class handles core result presentation (success, failure, tokens).
 * Command-specific summaries are handled by the presenters module.
 */

import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getRenderer } from 'output/markdown';
import { sanitizeData } from 'utils/data-sanitizer';
import { formatNumber } from 'utils/number-format';

export class ResultPresenter {
	private console = getConsoleOutput();
	private logger = getLogger();
	private renderer = getRenderer();

	/**
	 * Display command execution start
	 */
	displayCommandStart(commandName: string, description: string): void {
		this.console.blank();
		this.console.print(this.renderer.box(description, `Executing: ${commandName}`));
		this.console.blank();
	}

	/**
	 * Display successful command results
	 */
	displaySuccess(
		commandName: string,
		outputs: Record<string, unknown>,
		duration: number,
		sessionId: string,
		agent?: string,
		model?: string,
		tokenBreakdown?: {
			context: number;
			generation: number;
			total: number;
		},
		totalSessionTokens?: number
	): void {
		// Display agent and model information
		if (agent && model) {
			this.console.print(`🤖 Agent: ${agent} | Model: ${model}`);
			this.console.blank();
		}

		// Display results in structured format
		this.console.blank();
		this.console.startGroup(this.renderer.box('Command Results', 'Results'));
		this.console.print(this.renderer.json(sanitizeData(outputs)));
		this.console.endGroup();
		this.console.blank();

		this.logger.info(`Command completed successfully: ${commandName}`, {
			agent,
			duration,
			model,
			sessionId,
			tokenBreakdown,
			totalSessionTokens
		});

		// Display token usage information
		this.displayTokenUsage(tokenBreakdown, totalSessionTokens);

		this.console.success('Command completed successfully');
		this.console.blank();
	}

	/**
	 * Display failed command results
	 */
	displayFailure(
		commandName: string,
		error: string | undefined,
		duration: number,
		sessionId: string,
		tokenBreakdown?: {
			context: number;
			generation: number;
			total: number;
		},
		totalSessionTokens?: number
	): void {
		this.logger.error(`Command failed: ${commandName}`, error ? new Error(error) : undefined, {
			duration,
			sessionId,
			tokenBreakdown,
			totalSessionTokens
		});

		this.console.error('Command failed');
		if (error) {
			this.console.print(`Error: ${error}`);
		}
		this.console.blank();

		// Display token usage information even for failed commands
		this.displayTokenUsage(tokenBreakdown, totalSessionTokens);
	}

	/**
	 * Display sandboxed environment error hints
	 */
	displaySandboxedEnvironmentError(errorMessage: string): void {
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
	 * Display general error
	 */
	displayGeneralError(errorMessage: string): void {
		this.console.blank();
		this.console.error(errorMessage);
		this.console.blank();
	}

	/**
	 * Display token usage information with detailed breakdown
	 */
	private displayTokenUsage(
		tokenBreakdown?: {
			context: number;
			generation: number;
			total: number;
		},
		totalSessionTokens?: number
	): void {
		if (!tokenBreakdown && totalSessionTokens === undefined) {
			return;
		}

		// In MCP mode, only check the architectural threshold (no display)
		if (this.console.isInMcpMode()) {
			this.validateTokenUsageThreshold(tokenBreakdown);
			return;
		}

		this.displayCLITokenUsage(tokenBreakdown, totalSessionTokens);
	}

	/**
	 * Display token usage in CLI mode
	 */
	private displayCLITokenUsage(
		tokenBreakdown?: {
			context: number;
			generation: number;
			total: number;
		},
		totalSessionTokens?: number
	): void {
		this.console.print('📊 Token Usage:');

		if (tokenBreakdown) {
			this.displayInteractionTokens(tokenBreakdown);
		}

		if (totalSessionTokens !== undefined) {
			this.console.print(`   • Session total: ${formatNumber(totalSessionTokens)} tokens`);
		}

		this.console.blank();
	}

	/**
	 * Display tokens for current interaction
	 */
	private displayInteractionTokens(tokenBreakdown: { context: number; generation: number; total: number }): void {
		this.console.print(`   • This interaction: ${formatNumber(tokenBreakdown.total)} tokens`);

		if (tokenBreakdown.context > 0 || tokenBreakdown.generation > 0) {
			this.displayTokenBreakdown(tokenBreakdown);
		}
	}

	/**
	 * Display detailed token breakdown with percentages
	 */
	private displayTokenBreakdown(tokenBreakdown: { context: number; generation: number; total: number }): void {
		const contextPercent = this.calculatePercentage(tokenBreakdown.context, tokenBreakdown.total);
		const generationPercent = this.calculatePercentage(tokenBreakdown.generation, tokenBreakdown.total);

		this.console.print(`     └─ Context: ${formatNumber(tokenBreakdown.context)} tokens (${contextPercent}%)`);
		this.console.print(`     └─ Generation: ${formatNumber(tokenBreakdown.generation)} tokens (${generationPercent}%)`);

		this.validateContextInfluence(contextPercent, generationPercent);
	}

	/**
	 * Calculate percentage with safe division
	 */
	private calculatePercentage(value: number, total: number): number {
		return total > 0 ? Math.round((value / total) * 100) : 0;
	}

	/**
	 * Validate architectural requirements context influence
	 */
	private validateContextInfluence(contextPercent: number, generationPercent: number): void {
		const CONTEXT_THRESHOLD = 35;

		if (contextPercent >= CONTEXT_THRESHOLD) {
			return;
		}

		const errorMessage = `🚨 ARCHITECTURAL REQUIREMENTS ALERT 🚨

Context influence has dropped below 35% (${contextPercent}% detected).

This indicates that architectural requirements and system context are not being sufficiently communicated to the AI model. The current generation is using ${generationPercent}% of tokens, which may lead to responses that don't properly follow established architectural patterns.

Please review and strengthen the system prompts, architectural context, or command specifications to ensure proper guidance.

Execution paused to prevent potential architectural drift.`;

		this.console.blank();
		this.console.error(errorMessage);
		throw new Error(`Architectural requirements context influence too low: ${contextPercent}% (threshold: 35%)`);
	}

	/**
	 * Validate token usage threshold (used in MCP mode)
	 */
	private validateTokenUsageThreshold(tokenBreakdown?: { context: number; generation: number; total: number }): void {
		if (!tokenBreakdown) {
			return;
		}

		if (tokenBreakdown.context === 0 && tokenBreakdown.generation === 0) {
			return;
		}

		const contextPercent = this.calculatePercentage(tokenBreakdown.context, tokenBreakdown.total);
		const CONTEXT_THRESHOLD = 35;

		if (contextPercent < CONTEXT_THRESHOLD) {
			// Even in MCP mode, this is a critical error that should stop execution
			throw new Error(`Architectural requirements context influence too low: ${contextPercent}% (threshold: 35%)`);
		}
	}
}
