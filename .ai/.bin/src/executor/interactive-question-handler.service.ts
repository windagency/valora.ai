/**
 * Interactive Question Handler Service
 *
 * Handles clarifying questions from LLM responses by prompting the user
 * via console for answers before proceeding with file modifications.
 *
 * This service is used during pipeline execution when the "refine" stage
 * produces clarifying questions that need user input.
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getPromptAdapter, type PromptAdapter, type PromptChoice } from 'ui/prompt-adapter.interface';

/**
 * Structure of a clarifying question from the refine-requirements prompt
 */
export interface ClarifyingQuestion {
	context?: string;
	id: string;
	options: string[];
	priority: 'P0' | 'P1' | 'P2';
	question: string;
}

/**
 * User's answer to a clarifying question
 */
export interface QuestionAnswer {
	customAnswer?: string;
	question: string;
	questionId: string;
	selectedOption: string;
}

/**
 * Result of processing all clarifying questions
 */
export interface InteractiveQuestionResult {
	answeredCount: number;
	answers: QuestionAnswer[];
	skipped: boolean;
	summary: string;
}

export class InteractiveQuestionHandlerService {
	private readonly color = getColorAdapter();
	private readonly console = getConsoleOutput();
	private readonly logger = getLogger();
	private readonly promptAdapter: PromptAdapter;

	constructor(promptAdapter?: PromptAdapter) {
		this.promptAdapter = promptAdapter ?? getPromptAdapter();
	}

	/**
	 * Check if stage outputs contain clarifying questions that need user input
	 */
	hasQuestions(stageOutputs: Record<string, unknown>): boolean {
		const questions = this.extractQuestions(stageOutputs);
		return questions.length > 0;
	}

	/**
	 * Extract clarifying questions from stage outputs
	 */
	extractQuestions(stageOutputs: Record<string, unknown>): ClarifyingQuestion[] {
		const questions: ClarifyingQuestion[] = [];

		// Check for clarifying_questions in outputs
		const rawQuestions = stageOutputs['clarifying_questions'];

		if (Array.isArray(rawQuestions)) {
			for (const q of rawQuestions) {
				if (this.isValidQuestion(q)) {
					questions.push(q as ClarifyingQuestion);
				}
			}
		}

		// Also check nested in result object (fallback)
		const result = stageOutputs['result'];
		if (typeof result === 'string') {
			try {
				const parsed = JSON.parse(result) as Record<string, unknown>;
				if (Array.isArray(parsed['clarifying_questions'])) {
					for (const q of parsed['clarifying_questions']) {
						if (this.isValidQuestion(q)) {
							questions.push(q as ClarifyingQuestion);
						}
					}
				}
			} catch {
				// Not JSON, ignore
			}
		}

		return questions;
	}

	/**
	 * Validate that an object is a valid ClarifyingQuestion
	 */
	private isValidQuestion(obj: unknown): boolean {
		if (typeof obj !== 'object' || obj === null) {
			return false;
		}

		const q = obj as Record<string, unknown>;

		return (
			typeof q['id'] === 'string' &&
			typeof q['question'] === 'string' &&
			Array.isArray(q['options']) &&
			q['options'].length > 0
		);
	}

	/**
	 * Prompt user for answers to all clarifying questions
	 */
	async promptForAnswers(questions: ClarifyingQuestion[]): Promise<InteractiveQuestionResult> {
		if (questions.length === 0) {
			return {
				answeredCount: 0,
				answers: [],
				skipped: true,
				summary: 'No clarifying questions to answer.'
			};
		}

		this.displayQuestionsHeader(questions);

		const answers: QuestionAnswer[] = [];

		for (const question of questions) {
			const answer = await this.promptSingleQuestion(question);
			if (answer) {
				answers.push(answer);
			}
		}

		const summary = this.buildAnswersSummary(answers, questions);

		return {
			answeredCount: answers.length,
			answers,
			skipped: false,
			summary
		};
	}

	/**
	 * Display header before prompting questions
	 */
	private displayQuestionsHeader(questions: ClarifyingQuestion[]): void {
		const p0Count = questions.filter((q) => q.priority === 'P0').length;
		const p1Count = questions.filter((q) => q.priority === 'P1').length;
		const p2Count = questions.filter((q) => q.priority === 'P2').length;

		this.console.blank();
		this.console.print(this.color.getRawFn('bold.cyan')('━━━ Clarification Needed ━━━'));
		this.console.dim(`${questions.length} question(s) to answer before proceeding`);
		this.console.blank();

		if (p0Count > 0) {
			this.console.print(this.color.red(`  ● ${p0Count} Critical (P0)`));
		}
		if (p1Count > 0) {
			this.console.print(this.color.yellow(`  ● ${p1Count} Important (P1)`));
		}
		if (p2Count > 0) {
			this.console.dim(`  ● ${p2Count} Minor (P2)`);
		}
		this.console.blank();
	}

	/**
	 * Prompt user for a single question
	 */
	private async promptSingleQuestion(question: ClarifyingQuestion): Promise<null | QuestionAnswer> {
		const priorityColorFn =
			question.priority === 'P0'
				? this.color.red.bind(this.color)
				: question.priority === 'P1'
					? this.color.yellow.bind(this.color)
					: this.color.gray.bind(this.color);

		this.console.print(priorityColorFn(`[${question.priority}] `) + this.color.bold(question.question));

		if (question.context) {
			this.console.dim(`  Context: ${question.context}`);
		}

		// Build choices from options
		const choices: PromptChoice[] = question.options.map((opt, index) => ({
			name: opt,
			short: `Option ${index + 1}`,
			value: opt
		}));

		// Add "Other" option for custom input
		choices.push({
			name: 'Other (enter custom answer)',
			short: 'Custom',
			value: '__custom__'
		});

		// Add skip option
		choices.push({
			name: 'Skip this question',
			short: 'Skip',
			value: '__skip__'
		});

		try {
			const result = await this.promptAdapter.prompt<{ answer: string }>([
				{
					choices,
					message: 'Select your answer:',
					name: 'answer',
					pageSize: 10,
					type: 'list'
				}
			]);

			if (result.answer === '__skip__') {
				this.console.dim('  → Skipped');
				this.console.blank();
				return null;
			}

			if (result.answer === '__custom__') {
				const customResult = await this.promptAdapter.prompt<{ customAnswer: string }>([
					{
						message: 'Enter your answer:',
						name: 'customAnswer',
						type: 'input'
					}
				]);

				this.console.print(this.color.green(`  → ${customResult.customAnswer}`));
				this.console.blank();

				return {
					customAnswer: customResult.customAnswer,
					question: question.question,
					questionId: question.id,
					selectedOption: 'Custom'
				};
			}

			this.console.print(this.color.green(`  → ${result.answer}`));
			this.console.blank();

			return {
				question: question.question,
				questionId: question.id,
				selectedOption: result.answer
			};
		} catch (error) {
			this.logger.warn('Failed to get answer for question', {
				error: (error as Error).message,
				questionId: question.id
			});
			return null;
		}
	}

	/**
	 * Build a summary of all answers for display and storage
	 */
	private buildAnswersSummary(answers: QuestionAnswer[], questions: ClarifyingQuestion[]): string {
		if (answers.length === 0) {
			return 'No questions were answered.';
		}

		const lines: string[] = ['## User Clarifications', ''];

		for (const answer of answers) {
			const q = questions.find((q) => q.id === answer.questionId);
			const priority = q?.priority ?? 'P2';

			lines.push(`### ${answer.questionId}: ${answer.question}`);
			lines.push(`**Priority**: ${priority}`);

			if (answer.customAnswer) {
				lines.push(`**Answer**: ${answer.customAnswer} (custom)`);
			} else {
				lines.push(`**Answer**: ${answer.selectedOption}`);
			}
			lines.push('');
		}

		const skippedCount = questions.length - answers.length;
		if (skippedCount > 0) {
			lines.push(`*${skippedCount} question(s) were skipped.*`);
		}

		return lines.join('\n');
	}

	/**
	 * Format answers for passing to subsequent pipeline stages
	 */
	formatAnswersForStage(answers: QuestionAnswer[]): Record<string, string> {
		const formatted: Record<string, string> = {};

		for (const answer of answers) {
			formatted[answer.questionId] = answer.customAnswer ?? answer.selectedOption;
		}

		return formatted;
	}
}

/**
 * Singleton instance
 */
let serviceInstance: InteractiveQuestionHandlerService | null = null;

export function getInteractiveQuestionHandler(): InteractiveQuestionHandlerService {
	serviceInstance ??= new InteractiveQuestionHandlerService();
	return serviceInstance;
}
