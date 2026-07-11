import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { InputValidationError } from 'utils/input-validator';

import { resolveTraceFile } from './trace-explain';

describe('resolveTraceFile — sessionId/stage path safety', () => {
	// `resolveTraceFile` had zero validation on either argument — unlike
	// `SessionStore.getSessionPath`/`getSnapshotPath` (fixed in a prior
	// round), a traversal-shaped `session-id` or `stage` escaped
	// `getRuntimeDataDir()/traces/` entirely, reachable from a single
	// `valora trace explain <id> <stage>` call with no CommandGuard
	// involvement at all (base command is `valora`, not a shell command).

	it('rejects a traversal session-id before building any path', () => {
		expect(() => resolveTraceFile('../../../../../../etc/passwd', 'planning')).toThrow(InputValidationError);
	});

	it('rejects a traversal stage before building any path', () => {
		expect(() => resolveTraceFile('sess-1', '../../../../../../etc/passwd')).toThrow(InputValidationError);
	});

	it('rejects a stage containing a path separator even without literal ".."', () => {
		expect(() => resolveTraceFile('sess-1', 'sub/dir')).toThrow(InputValidationError);
	});

	it('still resolves an ordinary well-formed session-id and stage', () => {
		const result = resolveTraceFile('sess-1', 'planning');
		expect(result.endsWith(path.join('sess-1', 'planning.jsonl'))).toBe(true);
	});
});
