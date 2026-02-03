/**
 * Dry Run Cache - Caches dry-run analysis results for faster subsequent execution
 *
 * When a command is run with --dry-run, the analysis/planning phase is cached.
 * When the same command is run without --dry-run, the cached result is used
 * to skip redundant analysis and speed up execution.
 */

import type { CommandDefinition, PipelineStage, StageOutput } from 'types/command.types';

import { createHash } from 'crypto';
import { getLogger } from 'output/logger';

/**
 * Pre-loaded prompt data for faster execution
 */
export interface PreloadedPrompt {
	content: string;
	id: string;
	metadata: Record<string, unknown>;
}

/**
 * Pre-loaded agent data for faster execution
 */
export interface PreloadedAgent {
	content: string;
	decisionMaking?: {
		escalationCriteria?: string[];
	};
	role: string;
}

/**
 * Pre-resolved stage inputs (static variables that don't depend on LLM output)
 */
export interface PreresolvedInputs {
	enrichedInputs: Record<string, unknown>; // Includes file contents
	resolvedInputs: Record<string, unknown>;
	stageName: string;
}

/**
 * Cached dry-run result
 */
export interface DryRunCacheEntry {
	/** The command that was analyzed */
	commandName: string;
	/** Timestamp when the cache entry was created */
	createdAt: number;
	/** TTL in milliseconds for this cache entry */
	ttl: number;
	/** The planned pipeline stages after analysis */
	plannedStages: PipelineStage[];
	/** Analysis outputs from the dry-run (e.g., resolved variables, agent selection) */
	analysisOutputs: Record<string, unknown>;
	/** Pre-computed stage outputs if available */
	precomputedOutputs?: StageOutput[];
	/** Hash of the command definition for invalidation */
	commandHash: string;
	/** The resolved agent role */
	agentRole?: string;
	/** The resolved model */
	model?: string;
	/** Session context snapshot */
	sessionContextSnapshot?: Record<string, unknown>;
	/** Pre-loaded prompts for all pipeline stages */
	preloadedPrompts?: PreloadedPrompt[];
	/** Pre-loaded agent definition */
	preloadedAgent?: PreloadedAgent;
	/** Pre-resolved inputs for each stage (static variables only) */
	preresolvedInputs?: PreresolvedInputs[];
	/** Pipeline validation results (true = valid) */
	pipelineValidated?: boolean;
	/** Resolved args map for variable resolution */
	resolvedArgs?: Record<string, unknown>;
}

/**
 * Options for cache lookup
 */
export interface DryRunCacheLookupOptions {
	args: string[];
	command: CommandDefinition;
	commandName: string;
	flags: Record<string, boolean | string | undefined>;
	sessionContext?: Record<string, unknown>;
}

/**
 * Result of a cache lookup
 */
export interface DryRunCacheLookupResult {
	entry?: DryRunCacheEntry;
	hit: boolean;
	reason?: string;
}

/**
 * Default TTL for cache entries (5 minutes)
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum number of cache entries to keep
 */
const MAX_CACHE_ENTRIES = 50;

/**
 * Dry Run Cache Service
 *
 * Provides in-memory caching of dry-run results for improved performance
 * when the same command is run without --dry-run.
 */
export class DryRunCache {
	private static instance: DryRunCache | null = null;
	private cache: Map<string, DryRunCacheEntry> = new Map();
	private defaultTtl: number;

	constructor(defaultTtl: number = DEFAULT_TTL_MS) {
		this.defaultTtl = defaultTtl;
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): DryRunCache {
		DryRunCache.instance ??= new DryRunCache();
		return DryRunCache.instance;
	}

	/**
	 * Reset singleton instance (for testing)
	 */
	static resetInstance(): void {
		DryRunCache.instance = null;
	}

	/**
	 * Generate a cache key from command options
	 */
	generateCacheKey(options: DryRunCacheLookupOptions): string {
		const { args, commandName, flags } = options;

		// Filter out flags that shouldn't affect the cache key
		const relevantFlags = { ...flags };
		delete relevantFlags['dryRun'];
		delete relevantFlags['dry-run'];
		delete relevantFlags['verbose'];
		delete relevantFlags['quiet'];
		delete relevantFlags['progress'];

		const keyData = JSON.stringify({
			args: args.sort(),
			commandName,
			flags: Object.entries(relevantFlags)
				.filter(([, v]) => v !== undefined)
				.sort(([a], [b]) => a.localeCompare(b))
		});

		return createHash('sha256').update(keyData).digest('hex').substring(0, 16);
	}

	/**
	 * Generate a hash of the command definition for invalidation
	 */
	generateCommandHash(command: CommandDefinition): string {
		const hashData = JSON.stringify({
			agent: command.agent,
			model: command.model,
			name: command.name,
			prompts: command.prompts
		});

		return createHash('sha256').update(hashData).digest('hex').substring(0, 16);
	}

	/**
	 * Store a dry-run result in the cache
	 */
	set(options: DryRunCacheLookupOptions, entry: Omit<DryRunCacheEntry, 'commandHash' | 'createdAt' | 'ttl'>): void {
		const logger = getLogger();
		const cacheKey = this.generateCacheKey(options);
		const commandHash = this.generateCommandHash(options.command);

		const fullEntry: DryRunCacheEntry = {
			...entry,
			commandHash,
			createdAt: Date.now(),
			ttl: this.defaultTtl
		};

		// Enforce max cache size by removing oldest entries
		if (this.cache.size >= MAX_CACHE_ENTRIES) {
			this.evictOldest();
		}

		this.cache.set(cacheKey, fullEntry);

		logger.debug('Dry-run cache: stored entry', {
			cacheKey,
			commandName: entry.commandName,
			stageCount: entry.plannedStages.length
		});
	}

	/**
	 * Look up a cached dry-run result
	 */
	get(options: DryRunCacheLookupOptions): DryRunCacheLookupResult {
		const logger = getLogger();
		const cacheKey = this.generateCacheKey(options);
		const entry = this.cache.get(cacheKey);

		if (!entry) {
			return { hit: false, reason: 'no_entry' };
		}

		// Check TTL
		const now = Date.now();
		if (now - entry.createdAt > entry.ttl) {
			this.cache.delete(cacheKey);
			logger.debug('Dry-run cache: entry expired', { cacheKey, commandName: entry.commandName });
			return { hit: false, reason: 'expired' };
		}

		// Check command hash for invalidation
		const currentHash = this.generateCommandHash(options.command);
		if (currentHash !== entry.commandHash) {
			this.cache.delete(cacheKey);
			logger.debug('Dry-run cache: command definition changed', { cacheKey, commandName: entry.commandName });
			return { hit: false, reason: 'command_changed' };
		}

		logger.info('Dry-run cache: hit', {
			ageMs: now - entry.createdAt,
			cacheKey,
			commandName: entry.commandName
		});

		return { entry, hit: true };
	}

	/**
	 * Invalidate a cache entry
	 */
	invalidate(options: DryRunCacheLookupOptions): boolean {
		const cacheKey = this.generateCacheKey(options);
		return this.cache.delete(cacheKey);
	}

	/**
	 * Invalidate all cache entries for a command
	 */
	invalidateCommand(commandName: string): number {
		let count = 0;
		for (const [key, entry] of this.cache.entries()) {
			if (entry.commandName === commandName) {
				this.cache.delete(key);
				count++;
			}
		}
		return count;
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { entries: Array<{ ageMs: number; commandName: string; key: string }>; size: number } {
		const now = Date.now();
		const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
			ageMs: now - entry.createdAt,
			commandName: entry.commandName,
			key
		}));

		return { entries, size: this.cache.size };
	}

	/**
	 * Evict oldest cache entries
	 */
	private evictOldest(): void {
		const logger = getLogger();
		const sortedEntries = Array.from(this.cache.entries()).sort(([, a], [, b]) => a.createdAt - b.createdAt);

		// Remove oldest 10% of entries
		const toRemove = Math.max(1, Math.floor(sortedEntries.length * 0.1));
		for (let i = 0; i < toRemove; i++) {
			const [key, entry] = sortedEntries[i]!;
			this.cache.delete(key);
			logger.debug('Dry-run cache: evicted entry', { commandName: entry.commandName, key });
		}
	}
}

/**
 * Get the singleton dry-run cache instance
 */
export function getDryRunCache(): DryRunCache {
	return DryRunCache.getInstance();
}
