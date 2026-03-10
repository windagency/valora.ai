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
		localId: 'test-local-id-01',
		requests: [],
		submission: {
			batchId: 'batch_abc123',
			localId: 'test-local-id-01',
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
		const result = loadBatch('nonexistent-id-999');
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
		expect(() => updateBatch('does-not-exist', {})).toThrow('Batch not found');
	});
});

describe('listBatches', () => {
	const batch1 = makeBatch({ localId: 'list-test-id-01' });
	const batch2 = makeBatch({ localId: 'list-test-id-02' });

	afterEach(() => {
		try {
			removeBatch('list-test-id-01');
		} catch {
			/* ignore */
		}
		try {
			removeBatch('list-test-id-02');
		} catch {
			/* ignore */
		}
	});

	it('lists all persisted batches', () => {
		persistBatch(batch1);
		persistBatch(batch2);
		const batches = listBatches();
		const ids = batches.map((b) => b.localId);
		expect(ids).toContain('list-test-id-01');
		expect(ids).toContain('list-test-id-02');
	});
});

describe('removeBatch', () => {
	it('removes a persisted batch', () => {
		const batch = makeBatch({ localId: 'remove-test-id-01' });
		persistBatch(batch);
		removeBatch(batch.localId);
		expect(loadBatch(batch.localId)).toBeNull();
	});

	it('does not throw when removing a non-existent batch', () => {
		expect(() => removeBatch('no-such-batch-99')).not.toThrow();
	});
});
