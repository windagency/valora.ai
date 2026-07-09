import { describe, expect, it } from 'vitest';

import { EscalationDetectionService } from './escalation-detection.service';
import { MessageBuilderService } from './message-builder.service';

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
