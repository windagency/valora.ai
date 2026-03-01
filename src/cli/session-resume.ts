/**
 * Session Resume Service - Smart session continuation with suggestions
 */

import type { Session, SessionCommand } from 'types/session.types';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getHeaderFormatter } from 'output/header-formatter';
import { SessionStore } from 'session/store';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

const prompt = getPromptAdapter();

export interface SessionAnalysis {
	lastCommand: null | SessionCommand;
	nextSuggestions: string[];
	session: Session;
	status: 'blocked' | 'complete' | 'ready' | 'review' | 'testing';
	statusMessage: string;
}

export class SessionResumeService {
	private sessionStore: SessionStore;

	// Workflow command sequences
	private readonly workflowMap: Record<string, string[]> = {
		assert: ['test', 'review-code'],
		commit: ['create-pr', 'implement'],
		'create-backlog': ['fetch-task'],
		'create-pr': ['feedback'],
		'create-prd': ['create-backlog'],
		feedback: [],
		'fetch-task': ['refine-task', 'plan'],
		'gather-knowledge': ['plan'],

		implement: ['test', 'assert', 'review-code'],
		plan: ['review-plan', 'implement', 'gather-knowledge'],
		'refine-specs': ['create-prd'],
		'refine-task': ['plan'],

		'review-code': ['implement', 'test', 'commit'],
		'review-plan': ['implement', 'plan'],
		test: ['review-code', 'implement', 'commit'],

		// Allow review-functional after various stages
		'review-functional': ['test', 'commit']
	};

	constructor(sessionStore?: SessionStore) {
		this.sessionStore = sessionStore ?? new SessionStore();
	}

	/**
	 * Get the last active session
	 */
	async getLastActiveSession(): Promise<null | Session> {
		const sessions = await this.sessionStore.listSessions();

		// Filter for active or paused sessions
		const activeSessions = sessions.filter((s) => s.status === 'active' || s.status === 'paused');

		if (activeSessions.length === 0) {
			return null;
		}

		// Load the most recent one
		const firstSession = activeSessions[0];
		if (!firstSession) {
			return null;
		}

		return this.sessionStore.loadSession(firstSession.session_id);
	}

	/**
	 * Analyse session status and determine next steps
	 */
	analyzeSession(session: Session): SessionAnalysis {
		const lastCommand: null | SessionCommand =
			session.commands.length > 0 ? (session.commands[session.commands.length - 1] ?? null) : null;

		if (!lastCommand) {
			return this.createNewSessionAnalysis(session);
		}

		if (!lastCommand.success) {
			return this.createFailedCommandAnalysis(session, lastCommand);
		}

		return this.createWorkflowAnalysis(session, lastCommand);
	}

	/**
	 * Create analysis for new sessions
	 */
	private createNewSessionAnalysis(session: Session): SessionAnalysis {
		return {
			lastCommand: null,
			nextSuggestions: ['plan', 'refine-task', 'gather-knowledge'],
			session,
			status: 'ready',
			statusMessage: 'New session - ready to start'
		};
	}

	/**
	 * Create analysis for failed commands
	 */
	private createFailedCommandAnalysis(session: Session, lastCommand: SessionCommand): SessionAnalysis {
		return {
			lastCommand,
			nextSuggestions: [lastCommand.command, 'review-code', 'test'],
			session,
			status: 'blocked',
			statusMessage: `Last command failed: ${lastCommand.command}`
		};
	}

	/**
	 * Create workflow-based analysis
	 */
	private createWorkflowAnalysis(session: Session, lastCommand: SessionCommand): SessionAnalysis {
		const commandNames = session.commands.map((c) => c.command);
		const workflowStatus = this.determineWorkflowStatus(commandNames, session.commands);

		if (workflowStatus) {
			return {
				lastCommand,
				nextSuggestions: this.getUniqueSuggestions(workflowStatus.suggestions),
				session,
				status: workflowStatus.status,
				statusMessage: workflowStatus.statusMessage
			};
		}

		return this.createDefaultWorkflowAnalysis(session, lastCommand);
	}

	/**
	 * Determine workflow status based on command history
	 */
	private determineWorkflowStatus(
		commandNames: string[],
		commands: SessionCommand[]
	): null | {
		status: SessionAnalysis['status'];
		statusMessage: string;
		suggestions: string[];
	} {
		if (commandNames.includes('implement') && !commandNames.includes('test')) {
			return {
				status: 'testing',
				statusMessage: 'Implementation complete - ready for testing',
				suggestions: ['test', 'assert', 'review-code']
			};
		}

		if (commandNames.includes('test') && !commandNames.includes('review-code')) {
			return {
				status: 'review',
				statusMessage: 'Tests complete - ready for review',
				suggestions: ['review-code', 'review-functional']
			};
		}

		if (this.isReadyToCommit(commandNames, commands)) {
			return {
				status: 'complete',
				statusMessage: 'All checks passed - ready to commit',
				suggestions: ['commit', 'review-functional']
			};
		}

		if (commandNames.includes('commit') && !commandNames.includes('create-pr')) {
			return {
				status: 'complete',
				statusMessage: 'Changes committed - ready for PR',
				suggestions: ['create-pr']
			};
		}

		if (commandNames.includes('create-pr')) {
			return {
				status: 'complete',
				statusMessage: 'Workflow complete',
				suggestions: ['feedback']
			};
		}

		return null;
	}

	/**
	 * Check if session is ready to commit
	 */
	private isReadyToCommit(commandNames: string[], commands: SessionCommand[]): boolean {
		return (
			commandNames.includes('review-code') &&
			!commandNames.includes('commit') &&
			(commands.find((c) => c.command === 'test')?.success ?? false)
		);
	}

	/**
	 * Create default workflow analysis using workflow map
	 */
	private createDefaultWorkflowAnalysis(session: Session, lastCommand: SessionCommand): SessionAnalysis {
		const nextCommands = this.workflowMap[lastCommand.command] ?? [];
		const statusMessage =
			nextCommands.length === 0
				? 'No automatic suggestions - choose next step'
				: `Continue from ${lastCommand.command}`;

		return {
			lastCommand,
			nextSuggestions: this.getUniqueSuggestions(nextCommands),
			session,
			status: 'ready',
			statusMessage
		};
	}

	/**
	 * Get unique suggestions limited to top 5
	 */
	private getUniqueSuggestions(suggestions: string[]): string[] {
		const uniqueSuggestions = Array.from(new Set(suggestions));
		return uniqueSuggestions.slice(0, 5); // Top 5 suggestions
	}

	/**
	 * Prompt user to resume session with suggestions
	 */
	async promptResume(sessionId?: string): Promise<null | string> {
		const color = getColorAdapter();
		try {
			// Get session
			let session: null | Session;
			if (sessionId) {
				session = await this.sessionStore.loadSession(sessionId);
			} else {
				session = await this.getLastActiveSession();
			}

			if (!session) {
				console.log(color.yellow('No active sessions found'));
				return null;
			}

			// Analyze session
			const analysis = this.analyzeSession(session);

			// Show session summary
			const headerFormatter = getHeaderFormatter();
			const header = headerFormatter.formatHeader('🔄 Resume Session', { centered: false, minWidth: 58 });

			console.log(`${header}
${color.bold('Session:')} ${color.cyan(session.session_id)}
${color.bold('Last Active:')} ${color.gray(new Date(session.updated_at).toLocaleString())} ${color.gray('(' + this.formatAge(session.updated_at) + ')')}
${color.bold('Status:')} ${this.getStatusColor(analysis.status, analysis.statusMessage)}
`);

			// Show last command
			if (analysis.lastCommand) {
				const icon = analysis.lastCommand.success ? color.green('✓') : color.red('✗');
				console.log(`${color.bold('Last Command:')} ${icon} ${color.cyan(analysis.lastCommand.command)}`);

				if (analysis.lastCommand.error) {
					console.log(`  ${color.red('Error:')} ${analysis.lastCommand.error}`);
				}
			}

			// Show command history summary
			const commandHistory = session.commands
				.slice(-3)
				.map((c) => {
					const icon = c.success ? color.green('✓') : color.red('✗');
					return `${icon} ${c.command}`;
				})
				.join(' → ');
			if (commandHistory) {
				console.log(`${color.bold('Recent:')} ${commandHistory}`);
			}

			console.log('');

			// Prompt for next action
			const choices = [];

			// Add suggested commands using functional pattern
			if (analysis.nextSuggestions.length > 0) {
				choices.push(new prompt.Separator(color.bold('Suggested next steps:')));
				const suggestionChoices = analysis.nextSuggestions.map((suggestion) => ({
					name: `${color.cyan(suggestion)} ${color.gray(this.getCommandDescription(suggestion))}`,
					value: `valora ${suggestion}`
				}));
				choices.push(...suggestionChoices);
			}

			// Add quick actions
			choices.push(new prompt.Separator());
			choices.push(new prompt.Separator(color.bold('Quick actions:')));
			choices.push({
				name: color.cyan('View session details'),
				value: `valora session show ${session.session_id}`
			});
			choices.push({
				name: color.cyan('Browse all sessions'),
				value: 'valora session browse'
			});
			choices.push({
				name: color.gray('Exit'),
				value: null
			});

			const answer = await prompt.prompt<{ action: string }>([
				{
					choices,
					loop: false,
					message: 'What would you like to do?',
					name: 'action',
					pageSize: 15,
					type: 'list'
				}
			]);

			return answer.action;
		} catch {
			// User cancelled or error occurred
			return null;
		}
	}

	/**
	 * Format age (relative time)
	 */
	private formatAge(timestamp: string): string {
		const diff = Date.now() - new Date(timestamp).getTime();
		const seconds = Math.floor(diff / 1000);

		const timeUnits = [
			{ label: 'day', value: Math.floor(seconds / 86400) },
			{ label: 'hour', value: Math.floor(seconds / 3600) },
			{ label: 'minute', value: Math.floor(seconds / 60) }
		];

		const unit = timeUnits.find((u) => u.value > 0);

		return unit ? `${unit.value} ${unit.label}${unit.value > 1 ? 's' : ''} ago` : 'just now';
	}

	/**
	 * Get status with color
	 */
	private getStatusColor(status: SessionAnalysis['status'], message: string): string {
		const color = getColorAdapter();
		const statusColors: Record<SessionAnalysis['status'], (msg: string) => string> = {
			blocked: color.red,
			complete: color.green,
			ready: color.green,
			review: color.blue,
			testing: color.yellow
		};

		const colorFn = statusColors[status] || color.gray;
		return colorFn(message);
	}

	/**
	 * Get command description
	 */
	private getCommandDescription(command: string): string {
		const descriptions: Record<string, string> = {
			assert: '- Validate implementation',
			commit: '- Create commit',
			'create-backlog': '- Generate task backlog',
			'create-pr': '- Create pull request',
			'create-prd': '- Generate PRD',
			feedback: '- Capture feedback',
			'fetch-task': '- Get next task',
			'gather-knowledge': '- Analyze codebase',
			implement: '- Write code',
			plan: '- Create implementation plan',
			'refine-specs': '- Refine specifications',
			'refine-task': '- Clarify requirements',
			'review-code': '- Review code quality',
			'review-functional': '- Review functionality',
			'review-plan': '- Validate plan',
			test: '- Run tests'
		};

		return descriptions[command] ?? '';
	}
}
