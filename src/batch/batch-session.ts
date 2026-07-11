/**
 * BatchSession - Persists batch job state to .valora/batches/<localId>.json
 */

import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { getLogger } from 'output/logger';
import { InputValidator } from 'utils/input-validator';
import { getRuntimeDataDir } from 'utils/paths';

import type { PersistedBatch } from './batch.types';

const getBatchDir = (): string => join(getRuntimeDataDir(), 'batches');

// localId reaches this as a raw CLI argument via `batch status/results/cancel
// <localId>` with no validation at all — an unvalidated `../` sequence was a
// live traversal-based arbitrary-file-read primitive, chained into an
// arbitrary-file-write primitive via updateBatch() re-persisting a loaded
// file's own (potentially tampered) localId field. Validated once here, the
// sole path-building choke point every read/write site funnels through.
function batchFilePath(localId: string): string {
	InputValidator.validateBatchId(localId);
	return join(getBatchDir(), `${localId}.json`);
}

function ensureBatchDir(): string {
	const dir = getBatchDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

/**
 * Generate a short unique local ID for a batch job
 */
export function generateLocalId(): string {
	return createHash('sha256')
		.update(`${Date.now()}-${randomBytes(8).toString('hex')}`)
		.digest('hex')
		.substring(0, 16);
}

/**
 * Persist a batch to disk
 */
export function persistBatch(batch: PersistedBatch): void {
	ensureBatchDir();
	const filePath = batchFilePath(batch.localId);
	writeFileSync(filePath, JSON.stringify(batch, null, 2), 'utf-8');
}

/**
 * Load a batch from disk by local ID
 */
export function loadBatch(localId: string): null | PersistedBatch {
	const filePath = batchFilePath(localId);
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		return JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedBatch;
	} catch (error) {
		getLogger().warn(`Failed to load batch ${localId}`, { error: (error as Error).message });
		return null;
	}
}

/**
 * Update a persisted batch with partial data
 */
export function updateBatch(localId: string, partial: Partial<PersistedBatch>): void {
	const existing = loadBatch(localId);
	if (!existing) {
		throw new Error(`Batch not found: ${localId}`);
	}
	persistBatch({ ...existing, ...partial });
}

/**
 * List all persisted batches
 */
export function listBatches(): PersistedBatch[] {
	const dir = getBatchDir();
	if (!existsSync(dir)) {
		return [];
	}
	const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
	const batches: PersistedBatch[] = [];
	for (const file of files) {
		const localId = file.replace('.json', '');
		const batch = loadBatch(localId);
		if (batch) {
			batches.push(batch);
		}
	}
	return batches;
}

/**
 * Remove a persisted batch from disk
 */
export function removeBatch(localId: string): void {
	const filePath = batchFilePath(localId);
	if (existsSync(filePath)) {
		unlinkSync(filePath);
	}
}
