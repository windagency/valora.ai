/**
 * Structured verbose logging formatter
 */

import { formatDurationMs, formatNumber } from 'utils/number-format';

import { getColorAdapter } from './color-adapter.interface';

export class VerboseFormatter {
	/**
	 * Format initialization section
	 */
	formatInitialization(config: {
		configPath?: string;
		logLevel?: string;
		model?: string;
		provider?: string;
		sessionId?: string;
	}): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();

		return `${timestamp} ${color.blue('🔍 INITIALIZATION')}
${timestamp} ${color.gray('├─ ')}Loading configuration from ${config.configPath ?? 'data/config.default.json'}
${timestamp} ${color.gray('├─ ')}Provider: ${config.provider ?? 'cursor'} (auto-detected)
${timestamp} ${color.gray('├─ ')}Model: ${config.model ?? 'auto'}
${timestamp} ${color.gray('├─ ')}Log level: ${config.logLevel ?? 'info'}
${timestamp} ${color.gray('└─ ')}Session: ${config.sessionId ?? 'new session created'}`;
	}

	/**
	 * Format command discovery section
	 */
	formatCommandDiscovery(
		command: string,
		metadata: { agent?: string; location?: string; stageCount?: number }
	): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const location = metadata.location
			? `\n${timestamp} ${color.gray('├─ ')}Command location: ${metadata.location}`
			: '';
		const agent = metadata.agent
			? `\n${timestamp} ${color.gray('├─ ')}Agent assigned: ${color.magenta(metadata.agent)}`
			: '';
		const stageCount = metadata.stageCount
			? `\n${timestamp} ${color.gray('└─ ')}Pipeline stages: ${metadata.stageCount}`
			: '';

		return `
${timestamp} ${color.magenta('📋 COMMAND DISCOVERY')}
${timestamp} ${color.gray('├─ ')}Loading command: ${color.cyan(command)}${location}${agent}${stageCount}`;
	}

	/**
	 * Format execution start section
	 */
	formatExecutionStart(context: {
		agent?: string;
		args?: string[];
		command?: string;
		model?: string;
		sessionId?: string;
	}): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const command = context.command ? `\n${timestamp} ${color.gray('├─ ')}Command: ${color.cyan(context.command)}` : '';
		const agent = context.agent ? `\n${timestamp} ${color.gray('├─ ')}Agent: ${color.magenta(context.agent)}` : '';
		const model = context.model ? `\n${timestamp} ${color.gray('├─ ')}Model: ${context.model}` : '';
		const args = context.args?.length ? `\n${timestamp} ${color.gray('├─ ')}Arguments: ${context.args.join(', ')}` : '';
		const sessionId = context.sessionId ? `\n${timestamp} ${color.gray('└─ ')}Session ID: ${context.sessionId}` : '';

		return `
${timestamp} ${color.green('🎯 EXECUTION START')}${command}${agent}${model}${args}${sessionId}`;
	}

	/**
	 * Format stage execution
	 */
	formatStageExecution(
		stage: string,
		details: {
			duration?: number;
			index?: number;
			progress?: string;
			status?: 'complete' | 'error' | 'running';
			totalStages?: number;
		}
	): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const statusIcon = this.getStatusIcon(details.status ?? 'running');
		const stageIndex =
			details.index !== undefined && details.totalStages !== undefined
				? color.gray(`[${details.index}/${details.totalStages}] `)
				: '';
		const progress = details.progress ? color.gray(` - ${details.progress}`) : '';
		const duration = details.duration ? color.gray(` (${details.duration}ms)`) : '';

		return `${timestamp} ${statusIcon} ${stageIndex}Stage: ${color.cyan(stage)}${progress}${duration}`;
	}

	/**
	 * Format agent activity
	 */
	formatAgentActivity(
		agent: string,
		activity: string,
		metadata?: { duration?: number; status?: 'error' | 'success' }
	): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const agentColor = this.getAgentColor(agent);
		const duration = metadata?.duration ? color.gray(` (${metadata.duration}ms)`) : '';

		const statusIcons: Record<string, string> = {
			error: ` ${color.red('✗')}`,
			success: ` ${color.green('✓')}`
		};
		const status = metadata?.status ? (statusIcons[metadata.status] ?? '') : '';

		return `${timestamp} ${color.gray('  └─ ')}${agentColor(agent)}: ${activity}${duration}${status}`;
	}

	/**
	 * Format LLM interaction
	 */
	formatLLMInteraction(
		type: 'request' | 'response',
		details: {
			duration?: number;
			model?: string;
			stage?: string;
			tokenCount?: number;
		}
	): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();

		const typeConfig: Record<
			'request' | 'response',
			{ colorFn: (text: string) => string; icon: string; label: string }
		> = {
			request: { colorFn: color.yellow, icon: '→', label: 'LLM Request' },
			response: { colorFn: color.green, icon: '←', label: 'LLM Response' }
		};

		const { colorFn, icon, label } = typeConfig[type];
		const model = details.model ? color.gray(` [${details.model}]`) : '';
		const tokens = details.tokenCount ? color.gray(` (${formatNumber(details.tokenCount)} tokens)`) : '';
		const duration = details.duration ? color.gray(` - ${details.duration}ms`) : '';

		return `${timestamp} ${color.gray('    ')}${colorFn(icon)} ${label}${model}${tokens}${duration}`;
	}

	/**
	 * Format error with context
	 */
	formatError(error: string, context?: { command?: string; stack?: string; stage?: string }): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const command = context?.command ? `\n${timestamp} ${color.gray('├─ ')}Command: ${context.command}` : '';
		const stage = context?.stage ? `\n${timestamp} ${color.gray('├─ ')}Stage: ${context.stage}` : '';

		let stack = '';
		if (context?.stack) {
			const stackLines = context.stack.split('\n').slice(0, 3);
			stack = `\n${timestamp} ${color.gray('└─ ')}Stack trace:`;
			stackLines.forEach((line) => {
				stack += `\n${timestamp} ${color.gray('   ' + line.trim())}`;
			});
		}

		return `
${timestamp} ${color.red('❌ ERROR')}
${timestamp} ${color.gray('├─ ')}${color.red(error)}${command}${stage}${stack}`;
	}

	/**
	 * Format completion summary
	 */
	formatSummary(summary: {
		duration: number;
		stagesCompleted: number;
		stagesFailed: number;
		success: boolean;
		totalStages: number;
	}): string {
		const color = getColorAdapter();
		const timestamp = this.formatTimestamp();
		const statusLine = summary.success ? color.green('✅ EXECUTION COMPLETE') : color.red('❌ EXECUTION FAILED');
		const failedInfo = summary.stagesFailed > 0 ? `, ${color.red(`${summary.stagesFailed} failed`)}` : '';

		return `
${timestamp} ${statusLine}
${timestamp} ${color.gray('├─ ')}Duration: ${formatDurationMs(summary.duration)}
${timestamp} ${color.gray('├─ ')}Stages: ${color.green(`${summary.stagesCompleted} completed`)}${failedInfo}
${timestamp} ${color.gray('└─ ')}Total stages: ${summary.totalStages}`;
	}

	/**
	 * Format timestamp
	 */
	private formatTimestamp(): string {
		const color = getColorAdapter();
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return color.gray(`[${hours}:${minutes}:${seconds}]`);
	}

	/**
	 * Get status icon
	 */
	private getStatusIcon(status: 'complete' | 'error' | 'running'): string {
		const color = getColorAdapter();
		const statusIcons: Record<'complete' | 'error' | 'running', string> = {
			complete: color.green('✓'),
			error: color.red('✗'),
			running: color.cyan('⠋')
		};

		return statusIcons[status];
	}

	/**
	 * Get agent color
	 */
	private getAgentColor(agent: string): (text: string) => string {
		const color = getColorAdapter();
		const colorMap: Record<string, (text: string) => string> = {
			'@asserter': color.yellow,
			'@lead': color.cyan,
			'@platform-engineer': color.blue,
			'@product-manager': color.magenta,
			'@qa': color.green,
			'@secops-engineer': color.red,
			'@software-engineer': color.blue,
			'@ui-ux-designer': color.magenta
		};

		const matchedColor = Object.entries(colorMap).find(([key]) => agent.includes(key))?.[1];

		return matchedColor ?? color.white;
	}
}

/**
 * Singleton instance
 */
let formatterInstance: null | VerboseFormatter = null;

export function getVerboseFormatter(): VerboseFormatter {
	formatterInstance ??= new VerboseFormatter();
	return formatterInstance;
}
