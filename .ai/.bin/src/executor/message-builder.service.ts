/**
 * Message Builder Service
 *
 * Constructs system and user messages for LLM prompts.
 * Extracted from StageExecutor to follow Single Responsibility Principle.
 *
 * Responsibilities:
 * - System message construction with agent profile, prompt, and context
 * - Output format instruction generation
 * - Escalation instruction generation
 * - User message formatting with input resolution
 */

import type { getLogger } from 'output/logger';

type Logger = ReturnType<typeof getLogger>;

/**
 * Options for building a system message
 */
export interface SystemMessageOptions {
	/** Agent profile/role description */
	agentProfile: string;
	/** Escalation criteria to include */
	escalationCriteria?: string[];
	/** Expected output property names */
	expectedOutputs?: string[];
	/** Project guidance content */
	projectGuidance?: null | string;
	/** Project knowledge content */
	projectKnowledge?: null | string;
	/** Task-specific prompt content */
	promptContent: string;
}

/**
 * Service for building LLM messages
 */
export class MessageBuilderService {
	constructor(_logger?: Logger) {
		// Logger available for future debugging needs
	}

	/**
	 * Build system message with all components
	 *
	 * Structure:
	 * 1. Project Guidance - AI behaviour instructions
	 * 2. Agent Profile - Role-specific instructions
	 * 3. Prompt Content - Task-specific instructions
	 * 4. Project Knowledge - Context for this task
	 * 5. Output Format Instructions - Expected response structure
	 * 6. Escalation Instructions - When to escalate
	 */
	buildSystemMessage(options: SystemMessageOptions): string {
		const { agentProfile, escalationCriteria, expectedOutputs, projectGuidance, projectKnowledge, promptContent } =
			options;

		const messageParts: string[] = [];

		// 1. Prepend project-level guidance if available (highest priority - AI behaviour)
		if (projectGuidance) {
			messageParts.push(projectGuidance);
			messageParts.push('');
		}

		// 2. Add agent profile
		messageParts.push(agentProfile);
		messageParts.push('');
		messageParts.push('---');
		messageParts.push('');

		// 3. Add prompt content (task-specific instructions)
		messageParts.push(promptContent);

		// 4. Append project knowledge if available (context for this task)
		if (projectKnowledge) {
			messageParts.push('');
			messageParts.push(projectKnowledge);
		}

		let message = messageParts.join('\n');

		// Append output format enforcement if expected outputs are defined
		if (expectedOutputs && expectedOutputs.length > 0) {
			message += '\n\n' + this.buildOutputFormatInstruction(expectedOutputs);
		}

		// Append escalation instructions if criteria are defined
		if (escalationCriteria && escalationCriteria.length > 0) {
			message += '\n\n' + this.buildEscalationInstruction(escalationCriteria);
		}

		return message;
	}

	/**
	 * Build output format instruction to enforce JSON structure
	 */
	buildOutputFormatInstruction(expectedOutputs: string[]): string {
		const outputList = expectedOutputs.map((o) => `  - "${o}"`).join('\n');

		return `---

## CRITICAL: Required Output Format

Your response MUST include a JSON object with ALL of the following required properties:

${outputList}

**Format Requirements:**
1. Return your response as a valid JSON object inside a markdown code block
2. Include ALL properties listed above - missing properties will cause failures
3. Use the exact property names shown (case-sensitive)
4. For score properties, use numbers (0-10 scale unless otherwise specified)
5. For list properties (concerns, gaps, issues, steps, etc.), use arrays

**Example structure:**
\`\`\`json
{
${expectedOutputs.map((o) => `  "${o}": <appropriate value>`).join(',\n')}
}
\`\`\`

**IMPORTANT:** Do not omit any of the required properties. Provide empty arrays [] for list properties with no items, and appropriate default values for other properties if analysis yields no specific findings.`;
	}

	/**
	 * Build escalation protocol instructions for the LLM
	 */
	buildEscalationInstruction(escalationCriteria: string[]): string {
		const criteriaList = escalationCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

		return `---

## CRITICAL: Escalation Protocol

You MUST evaluate your response against these escalation criteria before completing your response.

**Escalation Criteria:**
${criteriaList}

**Required Output Structure:**
You MUST include this JSON block at the END of your response, after all other content:

\`\`\`json
{
  "_escalation": {
    "requires_escalation": boolean,
    "confidence": number,
    "triggered_criteria": ["list of criteria that matched, if any"],
    "reasoning": "Brief explanation of why escalation is or isn't required",
    "proposed_action": "What you plan to do or recommend",
    "risk_level": "low" | "medium" | "high" | "critical"
  }
}
\`\`\`

**Field Descriptions:**
- \`requires_escalation\`: Set to true if ANY of the escalation criteria are triggered
- \`confidence\`: Your confidence level (0-100) in the proposed action
- \`triggered_criteria\`: Array of specific criteria that were triggered (empty if none)
- \`reasoning\`: Brief explanation of your escalation decision
- \`proposed_action\`: What you plan to do or what you recommend
- \`risk_level\`: Overall risk assessment of the proposed action

**IMPORTANT:** This escalation block is MANDATORY. Always include it at the end of your response.`;
	}

	/**
	 * Build user message with resolved inputs
	 * Formats file contents in a clear, readable way for the LLM
	 */
	buildUserMessage(inputs: Record<string, unknown>): string {
		if (Object.keys(inputs).length === 0) {
			return 'Please proceed with the task.';
		}

		const { fileContents, regularInputs } = this.separateInputs(inputs);
		const messageParts: string[] = [];

		// Add regular inputs with clear formatting
		regularInputs.forEach(([key, value]) => {
			const formatted = this.formatRegularInput(key, value);
			if (formatted) {
				messageParts.push(formatted);
			}
		});

		// Add file contents with clear formatting
		fileContents.forEach(([filePath, content]) => {
			messageParts.push(`\n--- File: ${filePath} ---\n${content}\n--- End of File ---`);
		});

		return messageParts.join('\n');
	}

	/**
	 * Separate inputs into regular inputs and file contents
	 */
	private separateInputs(inputs: Record<string, unknown>): {
		fileContents: Array<[string, string]>;
		regularInputs: Array<[string, unknown]>;
	} {
		const regularInputs: Array<[string, unknown]> = [];
		const fileContents: Array<[string, string]> = [];

		for (const [key, value] of Object.entries(inputs)) {
			if (key.endsWith('_content') && typeof value === 'string') {
				const baseName = key.replace(/_content$/, '');
				const filePath = inputs[baseName] as string | undefined;
				fileContents.push([filePath ?? baseName, value]);
			} else if (!key.endsWith('_content')) {
				const contentKey = `${key}_content`;
				if (!Object.prototype.hasOwnProperty.call(inputs, contentKey)) {
					regularInputs.push([key, value]);
				}
			}
		}

		return { fileContents, regularInputs };
	}

	/**
	 * Format a regular input value for the message
	 */
	private formatRegularInput(key: string, value: unknown): null | string {
		if (value === undefined || value === null || value === '') {
			return null;
		}

		if (typeof value === 'object' && value !== null) {
			return `## Input: ${key}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
		}

		return `**${key}**: ${String(value)}`;
	}
}

/**
 * Singleton instance
 */
let messageBuilderServiceInstance: MessageBuilderService | null = null;

/**
 * Get the singleton MessageBuilderService instance
 */
export function getMessageBuilderService(): MessageBuilderService {
	messageBuilderServiceInstance ??= new MessageBuilderService();
	return messageBuilderServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetMessageBuilderService(): void {
	messageBuilderServiceInstance = null;
}
