/**
 * AST Index Watcher Service
 *
 * Watches the file system for changes and triggers incremental index updates.
 * Uses polling-based approach for broad compatibility.
 */

import { type FSWatcher, watch } from 'fs';
import { extname } from 'path';

import { EXCLUDED_DIRS, getASTIndexService } from './ast-index.service';
import { isSupportedExtension } from './grammars/language-map';

/** Debounce interval for re-indexing (ms) */
const DEBOUNCE_MS = 500;

/**
 * AST Index Watcher — triggers incremental updates on file changes
 */
export class ASTIndexWatcherService {
	private debounceTimer: null | ReturnType<typeof setTimeout> = null;
	private pendingChanges = new Set<string>();
	private readonly projectRoot: string;
	private running = false;
	private watcher: FSWatcher | null = null;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Start watching for file changes
	 */
	start(): void {
		if (this.running) return;

		try {
			this.watcher = watch(this.projectRoot, { recursive: true }, (_eventType, filename) => {
				if (!filename) return;
				this.handleFileChange(filename);
			});

			this.watcher.on('error', () => {
				// Watcher error — stop gracefully
				this.stop();
			});

			this.running = true;
		} catch {
			// Watching not supported or failed — degrade gracefully
			this.running = false;
		}
	}

	/**
	 * Stop watching
	 */
	stop(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}

		this.pendingChanges.clear();
		this.running = false;
	}

	/**
	 * Check if the watcher is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Handle a file change event
	 */
	private handleFileChange(filename: string): void {
		// Skip non-supported files
		const ext = extname(filename);
		if (!isSupportedExtension(ext)) return;

		// Skip excluded directories
		const parts = filename.split('/');
		if (parts.some((p) => EXCLUDED_DIRS.has(p))) return;

		this.pendingChanges.add(filename);

		// Debounce: wait for changes to settle
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			void this.flushChanges();
		}, DEBOUNCE_MS);
	}

	/**
	 * Flush pending changes and trigger incremental update
	 */
	private async flushChanges(): Promise<void> {
		if (this.pendingChanges.size === 0) return;

		const changedFiles = Array.from(this.pendingChanges);
		this.pendingChanges.clear();

		try {
			const indexService = getASTIndexService(this.projectRoot);
			await indexService.incrementalUpdate(changedFiles);
		} catch {
			// Non-fatal: index update failure shouldn't crash anything
		}
	}
}

/**
 * Singleton management
 */
let watcherInstance: ASTIndexWatcherService | null = null;

export function getASTIndexWatcher(projectRoot?: string): ASTIndexWatcherService {
	if (!watcherInstance && projectRoot) {
		watcherInstance = new ASTIndexWatcherService(projectRoot);
	}
	watcherInstance ??= new ASTIndexWatcherService(process.cwd());
	return watcherInstance;
}

export function resetASTIndexWatcher(): void {
	if (watcherInstance) {
		watcherInstance.stop();
	}
	watcherInstance = null;
}
