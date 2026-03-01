/**
 * Heap Profiler Utility
 *
 * Provides functionality for generating and managing V8 heap snapshots
 * for memory leak analysis.
 */

import * as fs from 'fs';
import { getLogger } from 'output/logger';
import * as path from 'path';
import * as v8 from 'v8';

import { generateShortId } from './id-generator';

export interface HeapDumpOptions {
	directory?: string;
	prefix?: string;
}

const DEFAULT_OPTIONS: Required<HeapDumpOptions> = {
	directory: './heap-dumps',
	prefix: 'heap-dump'
};

export class HeapProfiler {
	private logger = getLogger();

	/**
	 * Create a new heap dump
	 */
	createHeapSnapshot(options: HeapDumpOptions = {}): string {
		const config = { ...DEFAULT_OPTIONS, ...options };

		// Ensure directory exists
		if (!fs.existsSync(config.directory)) {
			try {
				fs.mkdirSync(config.directory, { recursive: true });
			} catch (error) {
				this.logger.error(`Failed to create heap dump directory: ${config.directory}`, error as Error);
				throw error;
			}
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${config.prefix}-${timestamp}-${generateShortId()}.heapsnapshot`;
		const filepath = path.join(config.directory, filename);

		try {
			this.logger.info(`Creating heap snapshot: ${filepath}`);
			const snapshotPath = v8.writeHeapSnapshot(filepath);

			// If writeHeapSnapshot returns a string, it's the path (in newer Node versions)
			// otherwise it returns undefined and writes to the path we gave it
			const finalPath = snapshotPath || filepath;

			this.logger.info(`Heap snapshot created successfully: ${finalPath}`);
			return finalPath;
		} catch (error) {
			this.logger.error('Failed to create heap snapshot', error as Error);
			throw error;
		}
	}
}

// Singleton instance
let globalHeapProfiler: HeapProfiler | null = null;

export function createHeapSnapshot(options?: HeapDumpOptions): string {
	return getHeapProfiler().createHeapSnapshot(options);
}

export function getHeapProfiler(): HeapProfiler {
	globalHeapProfiler ??= new HeapProfiler();
	return globalHeapProfiler;
}
