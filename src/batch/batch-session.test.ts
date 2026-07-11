import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedBatch } from './batch.types';

// Mock paths module
vi.mock('utils/paths', () => ({
	getRuntimeDataDir: () => '/tmp/valora-test-batch'
}));

// Mock the logger
vi.mock('output/logger', () => ({
	getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

// Import after mocks are set up
const { generateLocalId, persistBatch, loadBatch, updateBatch, listBatches, removeBatch } =
	await import('./batch-session');

function makeBatch(overrides: Partial<PersistedBatch> = {}): PersistedBatch {
	return {
		localId: 'aaaa1111bbbb2222',
		requests: [],
		submission: {
			batchId: 'batch_abc123',
			localId: 'aaaa1111bbbb2222',
			provider: 'anthropic',
			requestCount: 1,
			status: 'queued',
			submittedAt: new Date().toISOString()
		},
		...overrides
	};
}

describe('generateLocalId', () => {
	it('generates a 16-character hex string', () => {
		const id = generateLocalId();
		expect(id).toHaveLength(16);
		expect(id).toMatch(/^[0-9a-f]+$/);
	});

	it('generates unique IDs on each call', () => {
		const id1 = generateLocalId();
		const id2 = generateLocalId();
		expect(id1).not.toBe(id2);
	});
});

describe('persistBatch / loadBatch', () => {
	const batch = makeBatch();

	afterEach(() => {
		try {
			removeBatch(batch.localId);
		} catch {
			// ignore
		}
	});

	it('persists and loads a batch', () => {
		persistBatch(batch);
		const loaded = loadBatch(batch.localId);
		expect(loaded).not.toBeNull();
		expect(loaded?.localId).toBe(batch.localId);
		expect(loaded?.submission.batchId).toBe('batch_abc123');
	});

	it('returns null for unknown localId', () => {
		const result = loadBatch('ffffffffffffffff');
		expect(result).toBeNull();
	});
});

describe('updateBatch', () => {
	const batch = makeBatch();

	afterEach(() => {
		try {
			removeBatch(batch.localId);
		} catch {
			// ignore
		}
	});

	it('updates fields on an existing batch', () => {
		persistBatch(batch);
		updateBatch(batch.localId, {
			submission: { ...batch.submission, status: 'completed' }
		});
		const loaded = loadBatch(batch.localId);
		expect(loaded?.submission.status).toBe('completed');
	});

	it('throws when batch does not exist', () => {
		expect(() => updateBatch('0000000000000000', {})).toThrow('Batch not found');
	});
});

describe('listBatches', () => {
	const batch1 = makeBatch({ localId: '1111111111111111' });
	const batch2 = makeBatch({ localId: '2222222222222222' });

	afterEach(() => {
		try {
			removeBatch('1111111111111111');
		} catch {
			/* ignore */
		}
		try {
			removeBatch('2222222222222222');
		} catch {
			/* ignore */
		}
	});

	it('lists all persisted batches', () => {
		persistBatch(batch1);
		persistBatch(batch2);
		const batches = listBatches();
		const ids = batches.map((b) => b.localId);
		expect(ids).toContain('1111111111111111');
		expect(ids).toContain('2222222222222222');
	});
});

describe('removeBatch', () => {
	it('removes a persisted batch', () => {
		const batch = makeBatch({ localId: '3333333333333333' });
		persistBatch(batch);
		removeBatch(batch.localId);
		expect(loadBatch(batch.localId)).toBeNull();
	});

	it('does not throw when removing a non-existent batch', () => {
		expect(() => removeBatch('9999999999999999')).not.toThrow();
	});
});

describe('localId path-traversal safety', () => {
	// batchFilePath()/persistBatch() joined localId into a filesystem path
	// with zero validation — reachable as a raw CLI argument via `batch
	// status/results/cancel <localId>`. Chained escape: updateBatch() reloads
	// via the same traversal-vulnerable loadBatch(), then persists via
	// persistBatch({...existing, ...partial}) using the LOADED object's own
	// (attacker-controlled) localId field, not the parameter used to load it.
	it('rejects a traversal localId in loadBatch before reading any file', () => {
		expect(() => loadBatch('../../../../../../etc/passwd')).toThrow();
	});

	it('rejects a traversal localId in removeBatch before deleting anything', () => {
		expect(() => removeBatch('../../../../../../etc/passwd')).toThrow();
	});

	it('rejects a traversal localId in persistBatch (via batch.localId) before writing anything', () => {
		expect(() => persistBatch(makeBatch({ localId: '../../../../../../tmp/evil' }))).toThrow();
	});

	it('rejects updateBatch when the loaded batch content carries a traversal-shaped localId', () => {
		// Simulates a tampered on-disk file: stored at a validly-named path
		// (so loadBatch's own id validation passes) but whose *content*
		// declares a malicious localId — bypasses persistBatch (which would
		// itself now reject writing this) via a direct fs write, since the
		// point is what updateBatch does with already-tampered content, not
		// whether persistBatch's own validation works (already covered above).
		const dir = '/tmp/valora-test-batch/batches';
		fs.mkdirSync(dir, { recursive: true });
		const tampered = makeBatch({ localId: '../../../../../../tmp/evil-chained' });
		fs.writeFileSync(path.join(dir, '4444444444444444.json'), JSON.stringify(tampered));

		expect(() => updateBatch('4444444444444444', {})).toThrow();

		removeBatch('4444444444444444');
	});
});
