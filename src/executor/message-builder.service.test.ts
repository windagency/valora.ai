import { describe, expect, it } from 'vitest';

import { EscalationDetectionService } from './escalation-detection.service';
import { MessageBuilderService, type SystemMessageOptions } from './message-builder.service';

/**
 * Contract test between MessageBuilderService (what we tell the LLM to return) and
 * EscalationDetectionService (what we parse back out of the LLM's response). If a future
 * edit to the prompt wording changes the JSON shape without updating the parser (or vice
 * versa), this test should fail before it ever reaches a real pipeline run.
 */
describe('MessageBuilderService escalation instruction contract', () => {
	it('instructs the model to report confidence as a 0-100 number, matching what the parser expects', () => {
		const builder = new MessageBuilderService();
		const instruction = builder.buildEscalationInstruction(['Confidence < 70%']);

		expect(instruction).toContain('"confidence": number');
		expect(instruction).toContain('0-100');
	});

	it('produces an instruction whose documented example shape round-trips through the detection service', () => {
		const builder = new MessageBuilderService();
		const detector = new EscalationDetectionService();

		const exampleResponse = `Some analysis text.

\`\`\`json
{
  "_escalation": {
    "requires_escalation": false,
    "confidence": 82,
    "triggered_criteria": [],
    "reasoning": "All acceptance criteria met with high test coverage.",
    "proposed_action": "Proceed with the merge.",
    "risk_level": "low"
  }
}
\`\`\``;

		// Sanity check the fixture actually reflects the fields the instruction promises.
		const instruction = builder.buildEscalationInstruction(['Confidence < 70%']);
		for (const field of [
			'requires_escalation',
			'confidence',
			'triggered_criteria',
			'reasoning',
			'proposed_action',
			'risk_level'
		]) {
			expect(instruction).toContain(`"${field}"`);
		}

		const { signal } = detector.parseResponse(exampleResponse);
		expect(signal).not.toBeNull();
		expect(signal?.confidence).toBe(82);
		expect(signal?.confidenceSource).toBe('reported');
		expect(signal?.risk_level).toBe('low');
	});
});

describe('MessageBuilderService.buildSystemMessage', () => {
	const baseOptions: SystemMessageOptions = {
		agentProfile: 'You are a technical lead.',
		promptContent: 'Review this change for correctness.'
	};

	it('always includes the agent profile and prompt content, separated by a divider', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage(baseOptions);

		expect(message).toContain('You are a technical lead.');
		expect(message).toContain('---');
		expect(message).toContain('Review this change for correctness.');
		expect(message.indexOf('You are a technical lead.')).toBeLessThan(
			message.indexOf('Review this change for correctness.')
		);
	});

	it('prepends project guidance before the agent profile when provided', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage({ ...baseOptions, projectGuidance: 'Always write tests first.' });

		expect(message.indexOf('Always write tests first.')).toBeLessThan(message.indexOf('You are a technical lead.'));
	});

	it('omits optional sections entirely when not provided', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage(baseOptions);

		expect(message).not.toContain('CRITICAL: Required Output Format');
		expect(message).not.toContain('CRITICAL: Escalation Protocol');
	});

	it('appends optional context sections (available agents, project knowledge, agent memory, codebase map) in order when provided', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage({
			...baseOptions,
			agentMemory: 'MEMORY_MARKER',
			availableAgents: 'AGENTS_MARKER',
			codebaseMap: 'MAP_MARKER',
			projectKnowledge: 'KNOWLEDGE_MARKER'
		});

		const agentsIdx = message.indexOf('AGENTS_MARKER');
		const knowledgeIdx = message.indexOf('KNOWLEDGE_MARKER');
		const memoryIdx = message.indexOf('MEMORY_MARKER');
		const mapIdx = message.indexOf('MAP_MARKER');

		expect(agentsIdx).toBeGreaterThan(-1);
		expect(knowledgeIdx).toBeGreaterThan(agentsIdx);
		expect(memoryIdx).toBeGreaterThan(knowledgeIdx);
		expect(mapIdx).toBeGreaterThan(memoryIdx);
	});

	it('appends the output format instruction when expectedOutputs is non-empty', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage({ ...baseOptions, expectedOutputs: ['summary', 'score'] });

		expect(message).toContain('CRITICAL: Required Output Format');
		expect(message).toContain('"summary"');
		expect(message).toContain('"score"');
	});

	it('appends the escalation instruction when escalationCriteria is non-empty', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage({ ...baseOptions, escalationCriteria: ['Confidence < 70%'] });

		expect(message).toContain('CRITICAL: Escalation Protocol');
		expect(message).toContain('Confidence < 70%');
	});

	it('does not append the output format instruction for an empty expectedOutputs array', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildSystemMessage({ ...baseOptions, expectedOutputs: [] });

		expect(message).not.toContain('CRITICAL: Required Output Format');
	});
});

describe('MessageBuilderService.buildOutputFormatInstruction', () => {
	it('lists every expected output property by exact name', () => {
		const builder = new MessageBuilderService();
		const instruction = builder.buildOutputFormatInstruction(['summary', 'risk_score']);

		expect(instruction).toContain('- "summary"');
		expect(instruction).toContain('- "risk_score"');
		expect(instruction).toContain('"summary": <appropriate value>');
		expect(instruction).toContain('"risk_score": <appropriate value>');
	});
});

describe('MessageBuilderService.appendGuidance', () => {
	it('appends the human guidance to the end of the existing user message under a labelled heading', () => {
		const builder = new MessageBuilderService();
		const result = builder.appendGuidance('Original message body.', 'Re-check the auth edge cases.');

		expect(result).toBe(
			'Original message body.\n\n## Additional Guidance (from human reviewer)\n\nRe-check the auth edge cases.'
		);
	});
});

describe('MessageBuilderService.buildUserMessage', () => {
	it('returns a default prompt when there are no inputs', () => {
		const builder = new MessageBuilderService();

		expect(builder.buildUserMessage({})).toBe('Please proceed with the task.');
	});

	it('formats a plain string input under its key', () => {
		const builder = new MessageBuilderService();

		expect(builder.buildUserMessage({ task: 'Implement the feature' })).toBe('**task**: Implement the feature');
	});

	it('formats an object input as a JSON block', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildUserMessage({ config: { retries: 3 } });

		expect(message).toContain('## Input: config');
		expect(message).toContain('"retries": 3');
	});

	it('omits inputs whose value is undefined, null, or an empty string', () => {
		const builder = new MessageBuilderService();

		expect(builder.buildUserMessage({ empty: '', missing: undefined, nothing: null, task: 'keep me' })).toBe(
			'**task**: keep me'
		);
	});

	it('renders a matching "<key>_content" input as file content, using the sibling key as the displayed file path', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildUserMessage({ file_path: '/src/foo.ts', file_path_content: 'export const x = 1;' });

		expect(message).toContain('--- File: /src/foo.ts ---');
		expect(message).toContain('export const x = 1;');
		expect(message).toContain('--- End of File ---');
		// The sibling path field itself must not ALSO appear as a separate regular input.
		expect(message).not.toContain('**file_path**:');
	});

	it('falls back to the base key name as the displayed path when the sibling path field is absent', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildUserMessage({ orphan_content: 'body text' });

		expect(message).toContain('--- File: orphan ---');
		expect(message).toContain('body text');
	});

	it('silently drops a non-string "<key>_content" value — it matches neither the file-content branch (not a string) nor the regular-input branch (name ends in "_content")', () => {
		// KNOWN GAP: separateInputs()'s two branches are `key.endsWith('_content') && typeof value === 'string'`
		// and `!key.endsWith('_content')` — a non-string value on a `_content`-suffixed key satisfies
		// neither, so it vanishes from the message with no warning. Documented as current behaviour,
		// not fixed here (ambiguous whether the intended fix is "treat as regular input" or "coerce to
		// string", and this key shape does not occur in any real stage's resolved inputs today).
		const builder = new MessageBuilderService();

		expect(builder.buildUserMessage({ count_content: 42 })).toBe('');
	});

	it('places file contents after regular inputs, and keeps multiple regular inputs in their original order', () => {
		const builder = new MessageBuilderService();
		const message = builder.buildUserMessage({
			file_path: '/a.ts',
			file_path_content: 'const a = 1;',
			first: 'one',
			second: 'two'
		});

		const firstIdx = message.indexOf('**first**: one');
		const secondIdx = message.indexOf('**second**: two');
		const fileIdx = message.indexOf('--- File: /a.ts ---');

		expect(firstIdx).toBeGreaterThan(-1);
		expect(secondIdx).toBeGreaterThan(firstIdx);
		expect(fileIdx).toBeGreaterThan(secondIdx);
	});
});
