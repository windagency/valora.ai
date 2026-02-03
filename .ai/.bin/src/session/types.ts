/**
 * Session Cleanup Types
 *
 * Inferred types from actual usage patterns
 */

/**
 * Session cleanup criteria answers
 * Inferred from promptCriteria() prompt questions
 */
export interface CleanupCriteriaAnswers {
	minAgeDays?: number;
	minSizeMB?: string;
	status?: string[];
}

/**
 * Session cleanup confirmation answer
 * Inferred from showConfirmation() prompt
 */
export interface CleanupConfirmationAnswer {
	confirmed: boolean;
}
