/**
 * Type definitions for Command Wizard
 *
 * These types replace generic Record<string, unknown> to provide type safety
 * and eliminate noPropertyAccessFromIndexSignature errors (TS4111)
 */

/**
 * Common base interface for all wizard answers
 */
export interface BaseWizardAnswers {
	model?: string;
	provider?: string;
	session?: string;
}

/**
 * Answers for 'implement' command wizard
 */
export interface ImplementWizardAnswers extends BaseWizardAnswers {
	dryRun?: 'no' | 'yes';
}

/**
 * Answers for 'plan' command wizard
 */
export interface PlanWizardAnswers extends BaseWizardAnswers {
	description: string;
	sessionChoice?: 'existing' | 'new' | 'none';
}

/**
 * Answers for 'execute' command wizard
 */
export interface ExecuteWizardAnswers extends BaseWizardAnswers {
	watch?: 'no' | 'yes';
}

/**
 * Answers for 'custom' command wizard
 */
export interface CustomWizardAnswers extends BaseWizardAnswers {
	args?: string;
	command: string;
}

/**
 * Union type of all possible wizard answers
 */
export type WizardAnswers = CustomWizardAnswers | ExecuteWizardAnswers | ImplementWizardAnswers | PlanWizardAnswers;

/**
 * Generic wizard answers when type is not known
 */
export interface GenericWizardAnswers extends BaseWizardAnswers {
	[key: string]: unknown;
}
