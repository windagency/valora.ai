import { describe, expect, it } from 'vitest';

import { RetentionManager } from './retention-manager';

describe('RetentionManager.analyzeDirectory', () => {
	it('returns an empty list when the log directory does not exist', async () => {
		const manager = new RetentionManager({ maxAgeDays: 30 });
		const result = await manager.analyzeDirectory('/nonexistent/valora-logs-that-cannot-exist');
		expect(result).toEqual([]);
	});
});
