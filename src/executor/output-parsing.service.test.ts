import { describe, expect, it } from 'vitest';

import { getOutputParsingService } from './output-parsing.service';

describe('OutputParsingService', () => {
	describe('parseStageOutputs', () => {
		it('extracts a well-formed nested-object output directly via the primary JSON.parse path', () => {
			const service = getOutputParsingService();
			const content = `Some analysis.

\`\`\`json
{
  "confidence": 80,
  "implementation": {"summary": "ok", "detail": {"lines_changed": 12}, "files": ["a.ts"]}
}
\`\`\``;

			const result = service.parseStageOutputs(content, ['confidence', 'implementation']);

			expect(result['confidence']).toBe(80);
			expect(result['implementation']).toEqual({
				detail: { lines_changed: 12 },
				files: ['a.ts'],
				summary: 'ok'
			});
		});

		it('recovers a nested-object output with sibling keys after an inner closing brace, when the surrounding JSON is malformed and the fallback parser has to take over', () => {
			const service = getOutputParsingService();
			// The unquoted `bad_key` breaks a full JSON.parse of the block, forcing the
			// per-field fallback extractor to recover each expected output individually.
			const content = `Some analysis.

\`\`\`json
{
  "confidence": 80,
  "implementation": {"summary": "ok", "detail": {"lines_changed": 12}, "files": ["a.ts"]},
  bad_key: true
}
\`\`\``;

			const result = service.parseStageOutputs(content, ['confidence', 'implementation']);

			expect(result['confidence']).toBe(80);
			expect(result['implementation']).toEqual({
				detail: { lines_changed: 12 },
				files: ['a.ts'],
				summary: 'ok'
			});
		});

		it('recovers a nested-array output containing nested arrays, when the fallback parser has to take over', () => {
			const service = getOutputParsingService();
			const content = `Some analysis.

\`\`\`json
{
  "confidence": 80,
  "tags": [["a", "b"], ["c"]],
  bad_key: true
}
\`\`\``;

			const result = service.parseStageOutputs(content, ['confidence', 'tags']);

			expect(result['confidence']).toBe(80);
			expect(result['tags']).toEqual([['a', 'b'], ['c']]);
		});

		it('returns an empty object when there is no JSON-like content at all', () => {
			const service = getOutputParsingService();
			const result = service.parseStageOutputs('Just some plain prose with no structure.', ['confidence']);

			expect(result).toEqual({});
		});
	});
});
