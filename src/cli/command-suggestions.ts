/**
 * Intelligent Command Suggestions
 *
 * Suggests next logical commands based on workflow state and command execution results
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

const prompt = getPromptAdapter();

export interface CommandSuggestion {
	command: string;
	description: string;
	priority: 'optional' | 'recommended';
	reason?: string;
}

export interface WorkflowContext {
	currentCommand: string;
	filesModified?: number;
	hasErrors?: boolean;
	hasWarnings?: boolean;
	previousCommands: string[];
	sessionId?: string;
	testsStatus?: 'failed' | 'passed' | 'pending';
}

/**
 * Helper to create a recommended suggestion
 */
const recommend = (command: string, description: string, reason: string): CommandSuggestion => ({
	command,
	description,
	priority: 'recommended',
	reason
});

/**
 * Helper to create an optional suggestion
 */
const optional = (command: string, description: string): CommandSuggestion => ({
	command,
	description,
	priority: 'optional'
});

/**
 * Command suggestion rules based on workflow phases
 * Organized by workflow phase: Initialize → Prepare → Plan → Implement → Validate → Review → Finalize → Learn
 */
const WORKFLOW_SUGGESTIONS: Record<string, CommandSuggestion[]> = {
	// Initialize Phase
	'create-backlog': [recommend('fetch-task', 'Get next task from backlog', 'Backlog is ready')],
	'create-prd': [recommend('create-backlog', 'Break down PRD into tasks', 'PRD is ready to be decomposed')],
	'refine-specs': [recommend('create-prd', 'Generate Product Requirements Document', 'Specs are refined')],

	// Prepare Phase
	'fetch-task': [
		recommend('refine-task', 'Clarify task requirements', 'Ensure task clarity before planning'),
		optional('plan', 'Create implementation plan')
	],
	'refine-task': [recommend('plan', 'Create implementation plan', 'Task is clarified')],

	// Planning Phase
	'gather-knowledge': [recommend('plan', 'Create implementation plan', 'Knowledge gathered, ready to plan')],
	plan: [
		recommend('review-plan', 'Validate plan before starting', 'Catch issues early'),
		optional('implement', 'Start implementation'),
		optional('gather-knowledge', 'Learn more about dependencies')
	],
	'review-plan': [
		recommend('implement', 'Start implementation', 'Plan is validated'),
		optional('plan', 'Refine plan based on review')
	],

	// Implementation Phase
	implement: [
		recommend('assert', 'Validate implementation completeness', 'Check implementation before testing'),
		recommend('test', 'Run tests', 'Validate implementation with tests'),
		optional('review-code', 'Perform code quality review')
	],

	// Validation Phase
	assert: [
		recommend('test', 'Run tests to validate implementation', 'Tests validate assertions'),
		optional('review-code', 'Perform code quality review')
	],
	test: [
		recommend('review-code', 'Perform code quality review', 'Tests completed'),
		optional('review-functional', 'Validate feature completeness'),
		optional('commit', 'Create commit')
	],

	// Review Phase
	'review-code': [
		optional('test', 'Run tests if not done yet'),
		recommend('review-functional', 'Validate feature completeness', 'Code quality validated'),
		optional('commit', 'Create commit')
	],
	'review-functional': [recommend('commit', 'Create commit', 'All validations passed')],

	// Finalize Phase
	commit: [
		recommend('create-pr', 'Create pull request', 'Changes are committed and ready for review'),
		optional('feedback', 'Provide feedback on workflow')
	],
	'create-pr': [recommend('feedback', 'Provide feedback on workflow', 'Complete the development cycle')]
};

export class CommandSuggestionEngine {
	/**
	 * Get suggestions based on workflow context
	 */
	getSuggestions(context: WorkflowContext): CommandSuggestion[] {
		const suggestions: CommandSuggestion[] = [];

		// Get workflow-based suggestions
		const workflowSuggestions = WORKFLOW_SUGGESTIONS[context.currentCommand] ?? [];
		suggestions.push(...workflowSuggestions);

		// Adjust suggestions based on context
		if (context.hasErrors) {
			// If there are errors, suggest fixing them first
			suggestions.unshift({
				command: 'review-code',
				description: 'Fix errors before proceeding',
				priority: 'recommended',
				reason: 'Errors detected'
			});
		}

		if (context.testsStatus === 'failed') {
			// If tests failed, suggest reviewing and fixing
			suggestions.unshift({
				command: context.currentCommand,
				description: 'Fix failing tests and retry',
				priority: 'recommended',
				reason: 'Tests failed'
			});
		}

		// Remove duplicates
		const uniqueSuggestions = suggestions.filter(
			(suggestion, index, self) => index === self.findIndex((s) => s.command === suggestion.command)
		);

		// Remove suggestions for commands already executed
		const filtered = uniqueSuggestions.filter((s) => !context.previousCommands.includes(s.command));

		return filtered;
	}

	/**
	 * Format suggestions for display
	 */
	formatSuggestions(suggestions: CommandSuggestion[]): string {
		if (suggestions.length === 0) {
			return '';
		}

		const color = getColorAdapter();
		const lines: string[] = [];

		lines.push('');
		lines.push(color.bold('💡 SUGGESTED NEXT STEPS'));
		lines.push('');

		suggestions.forEach((suggestion) => {
			const icon = suggestion.priority === 'recommended' ? '❯' : ' ';
			const command = color.cyan(`valora ${suggestion.command}`);
			const description = suggestion.description;
			const reason = suggestion.reason ? color.gray(` (${suggestion.reason})`) : '';

			lines.push(`  ${icon} ${command.padEnd(30)} ${description}${reason}`);
		});

		lines.push('');

		return lines.join('\n');
	}

	/**
	 * Show interactive suggestion prompt
	 */
	async promptForNext(context: WorkflowContext): Promise<null | string> {
		const color = getColorAdapter();
		const suggestions = this.getSuggestions(context);

		if (suggestions.length === 0) {
			return null;
		}

		console.log(this.formatSuggestions(suggestions));

		try {
			const answer = await prompt.prompt<{ nextCommand: null | string }>([
				{
					choices: [
						...suggestions.map((s) => ({
							name: `${s.command.padEnd(20)} ${color.gray(s.description)}`,
							value: s.command
						})),
						new prompt.Separator(),
						{
							name: color.gray('None, exit for now'),
							value: null
						}
					],
					message: 'What would you like to do next?',
					name: 'nextCommand',
					type: 'list'
				}
			]);

			return answer.nextCommand;
		} catch {
			// User cancelled
			return null;
		}
	}

	/**
	 * Get auto-next command (highest priority suggestion)
	 */
	getAutoNext(context: WorkflowContext): null | string {
		const suggestions = this.getSuggestions(context);

		// Return the first recommended command
		const recommended = suggestions.find((s) => s.priority === 'recommended');
		return recommended ? recommended.command : null;
	}
}

/**
 * Show command suggestions after execution
 */
export async function showSuggestions(
	currentCommand: string,
	options: {
		hasErrors?: boolean;
		hasWarnings?: boolean;
		previousCommands?: string[];
		sessionId?: string;
		testsStatus?: 'failed' | 'passed' | 'pending';
	} = {}
): Promise<null | string> {
	const engine = new CommandSuggestionEngine();

	const context: WorkflowContext = {
		currentCommand,
		hasErrors: options.hasErrors ?? false,
		hasWarnings: options.hasWarnings ?? false,
		previousCommands: options.previousCommands ?? [],
		sessionId: options.sessionId,
		testsStatus: options.testsStatus
	};

	// Check if interactive mode is enabled
	const isInteractive = process.env['AI_INTERACTIVE'] !== 'false';

	if (isInteractive) {
		return engine.promptForNext(context);
	} else {
		// Just display suggestions without prompt
		const suggestions = engine.getSuggestions(context);
		console.log(engine.formatSuggestions(suggestions));
		return null;
	}
}
