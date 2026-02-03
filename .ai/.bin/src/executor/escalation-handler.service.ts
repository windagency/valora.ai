/**
 * Escalation Handler Service
 *
 * Interactive handler for human confirmation when escalation is triggered.
 * Displays escalation information and prompts for user decision.
 * Follows the DocumentApprovalWorkflow pattern for consistent UX.
 */

import type {
	EscalationContext,
	EscalationDecision,
	EscalationDecisionType,
	EscalationResult,
	EscalationSignal
} from 'types/escalation.types';

import { HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD } from 'config/constants';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getRenderer } from 'output/markdown';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

/**
 * Risk level display colors and icons
 */
const RISK_DISPLAY = {
	critical: { color: 'red', icon: '!!!' },
	high: { color: 'red', icon: '!!' },
	low: { color: 'green', icon: '-' },
	medium: { color: 'yellow', icon: '!' }
} as const;

export class EscalationHandlerService {
	private readonly color = getColorAdapter();
	private readonly console = getConsoleOutput();
	private readonly logger = getLogger();
	private readonly promptAdapter = getPromptAdapter();
	private readonly renderer = getRenderer();

	/**
	 * Handle an escalation by displaying info and prompting for decision
	 */
	async handleEscalation(context: EscalationContext): Promise<EscalationResult> {
		this.logger.debug('Handling escalation', {
			agentRole: context.agentRole,
			riskLevel: context.signal.risk_level,
			stageName: context.stageName,
			triggeredCriteria: context.signal.triggered_criteria.length
		});

		// Display escalation information
		this.displayEscalationInfo(context);

		// Prompt for user decision
		const decision = await this.promptForDecision(context);

		// Handle the decision
		return this.processDecision(decision, context);
	}

	/**
	 * Display formatted escalation information
	 */
	private displayEscalationInfo(context: EscalationContext): void {
		const { agentRole, escalationCriteria, signal, stageName } = context;
		const riskDisplay = RISK_DISPLAY[signal.risk_level];

		// Format risk level with appropriate color
		const riskColor = this.getRiskColor(signal.risk_level);
		const formattedRisk = riskColor(`[${riskDisplay.icon}] ${signal.risk_level.toUpperCase()}`);

		// Format triggered criteria
		const triggeredList =
			signal.triggered_criteria.length > 0
				? signal.triggered_criteria.map((c) => `  ${this.color.yellow('*')} ${c}`)
				: [`  ${this.color.gray('(none)')}`];

		// Format configured criteria
		const configuredList = escalationCriteria.map((c) => `  - ${c}`);

		this.console.blank();
		this.console.print(this.renderer.box('Human Review Required', 'ESCALATION'));
		this.console.blank();
		this.console.divider();
		this.console.labelValue('Stage', stageName);
		this.console.labelValue('Agent', agentRole);
		this.console.labelValue('Risk Level', formattedRisk);
		this.console.labelValue('Confidence', this.formatConfidence(signal.confidence));
		this.console.divider();
		this.console.blank();
		this.console.bold('Triggered Criteria:');
		triggeredList.forEach((item) => this.console.print(item));
		this.console.blank();
		this.console.bold('Reasoning:');
		this.console.print(`  ${signal.reasoning || this.color.gray('(no reasoning provided)')}`);
		this.console.blank();
		this.console.bold('Proposed Action:');
		this.console.print(`  ${signal.proposed_action || this.color.gray('(no action specified)')}`);
		this.console.blank();
		this.console.divider();
		this.console.dim('Configured Escalation Criteria for this agent:');
		configuredList.forEach((item) => this.console.print(item));
		this.console.divider();
		this.console.blank();
	}

	/**
	 * Get color function for risk level
	 */
	private getRiskColor(riskLevel: EscalationSignal['risk_level']): (text: string) => string {
		const riskColors: Record<EscalationSignal['risk_level'], (text: string) => string> = {
			critical: this.color.red.bind(this.color),
			high: this.color.red.bind(this.color),
			low: this.color.green.bind(this.color),
			medium: this.color.yellow.bind(this.color)
		};

		return riskColors[riskLevel] ?? this.color.gray.bind(this.color);
	}

	/**
	 * Format confidence with color
	 */
	private formatConfidence(confidence: number): string {
		const formatted = `${confidence}%`;

		if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
			return this.color.green(formatted);
		}

		if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
			return this.color.yellow(formatted);
		}

		return this.color.red(formatted);
	}

	/**
	 * Prompt user for escalation decision
	 */
	private async promptForDecision(_context: EscalationContext): Promise<EscalationDecision> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{
						name: 'Proceed - Continue with the proposed action',
						value: 'proceed'
					},
					{
						name: 'Modify - Provide additional guidance and retry',
						value: 'modify'
					},
					{
						name: 'Abort - Stop execution and cancel the pipeline',
						value: 'abort'
					}
				],
				default: 'proceed',
				message: 'How would you like to proceed?',
				name: 'decision',
				type: 'list'
			}
		]);

		const decisionType = answers['decision'] as EscalationDecisionType;
		let guidance: string | undefined;

		// If user chooses to modify, ask for guidance
		if (decisionType === 'modify') {
			const guidanceAnswers = await this.promptAdapter.prompt([
				{
					default: '',
					message: 'Enter additional guidance for the agent:',
					name: 'guidance',
					type: 'input',
					validate: (input: unknown) => {
						if (typeof input === 'string' && input.trim().length > 0) {
							return true;
						}
						return 'Please provide guidance for the modification';
					}
				}
			]);

			guidance = guidanceAnswers['guidance'] as string;
		}

		return {
			decision: decisionType,
			guidance,
			timestamp: Date.now()
		};
	}

	/**
	 * Process the user's decision and return result
	 */
	private processDecision(decision: EscalationDecision, _context: EscalationContext): EscalationResult {
		switch (decision.decision) {
			case 'abort':
				this.displayAbortMessage();
				return {
					decision,
					handled: true,
					shouldAbort: true,
					shouldProceed: false
				};

			case 'modify':
				this.displayModifyMessage(decision.guidance!);
				return {
					decision,
					handled: true,
					modifiedGuidance: decision.guidance,
					shouldAbort: false,
					shouldProceed: false
				};

			case 'proceed':
				this.displayProceedMessage();
				return {
					decision,
					handled: true,
					shouldAbort: false,
					shouldProceed: true
				};

			default:
				// Fallback to abort for safety
				this.logger.warn('Unknown escalation decision, defaulting to abort', {
					decision: decision.decision
				});
				return {
					decision: { ...decision, decision: 'abort' },
					handled: true,
					shouldAbort: true,
					shouldProceed: false
				};
		}
	}

	/**
	 * Display proceed confirmation message
	 */
	private displayProceedMessage(): void {
		this.console.blank();
		this.console.success('Proceeding with proposed action...');
		this.console.blank();
	}

	/**
	 * Display modify message with guidance
	 */
	private displayModifyMessage(guidance: string): void {
		this.console.blank();
		this.console.info('Modification requested with guidance:');
		this.console.print(`  ${guidance}`);
		this.console.blank();
		this.console.dim('The stage will be re-executed with the provided guidance.');
		this.console.blank();
	}

	/**
	 * Display abort message
	 */
	private displayAbortMessage(): void {
		this.console.blank();
		this.console.error('Pipeline execution aborted by user.');
		this.console.blank();
		this.console.dim('No further stages will be executed.');
		this.console.blank();
	}

	/**
	 * Display escalation summary for logging/events
	 */
	displayEscalationSummary(context: EscalationContext, result: EscalationResult): void {
		const { signal, stageName } = context;
		const { decision } = result;

		const decisionDisplay = {
			abort: this.color.red('ABORTED'),
			modify: this.color.cyan('MODIFIED'),
			proceed: this.color.green('PROCEEDED')
		}[decision.decision];

		this.console.blank();
		this.console.divider(40);
		this.console.bold('Escalation Summary:');
		this.console.print(`  Stage: ${stageName}`);
		this.console.print(`  Risk: ${signal.risk_level}`);
		this.console.print(`  Decision: ${decisionDisplay}`);
		this.console.print(`  Time: ${new Date(decision.timestamp).toISOString()}`);
		this.console.divider(40);
		this.console.blank();
	}
}

/**
 * Singleton instance
 */
let serviceInstance: EscalationHandlerService | null = null;

export function getEscalationHandlerService(): EscalationHandlerService {
	serviceInstance ??= new EscalationHandlerService();
	return serviceInstance;
}
