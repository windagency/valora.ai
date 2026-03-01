/**
 * Rate Limiter Utility
 *
 * Implements sliding window rate limiting to prevent abuse and DoS attacks.
 * Supports different rate limits for different operations and automatic cleanup.
 */

import {
	COMMAND_EXECUTION_LIMIT,
	CONFIG_ACCESS_LIMIT,
	MCP_SAMPLING_LIMIT,
	MCP_TOOL_CALL_LIMIT,
	RATE_LIMIT_BLOCK_DURATION_MS,
	RATE_LIMIT_WINDOW_MS
} from 'config/constants';

export interface RateLimitEntry {
	blockedUntil?: number;
	lastRequest: number;
	requests: number[];
}

export interface RateLimitOptions {
	cleanupIntervalMs?: number;
	rules?: Record<string, RateLimitRule>;
}

export interface RateLimitRule {
	blockDurationMs?: number; // How long to block after exceeding limit
	maxRequests: number; // Maximum requests allowed in the window
	windowMs: number; // Time window in milliseconds
}

/**
 * Default rate limiting rules
 */
const DEFAULT_RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
	// Command execution - generous limits
	command_execution: {
		blockDurationMs: 60 * 1000,
		maxRequests: COMMAND_EXECUTION_LIMIT,
		windowMs: RATE_LIMIT_WINDOW_MS // 1 minute block
	},

	// Configuration access - high limits
	config_access: {
		blockDurationMs: 30 * 1000,
		maxRequests: CONFIG_ACCESS_LIMIT,
		windowMs: RATE_LIMIT_WINDOW_MS // 30 second block
	},

	// Default fallback - conservative limits
	default: {
		// 20 requests per minute
		blockDurationMs: 2 * 60 * 1000,
		maxRequests: 20,
		windowMs: RATE_LIMIT_WINDOW_MS // 2 minute block
	},

	// LLM API calls - moderate limits to prevent cost overruns
	llm_api_call: {
		// 60 requests per minute (adjust based on API limits)
		blockDurationMs: 2 * 60 * 1000,
		maxRequests: 60,
		windowMs: RATE_LIMIT_WINDOW_MS // 2 minute block
	},

	// MCP sampling requests - moderate limits
	mcp_sampling: {
		blockDurationMs: 2 * 60 * 1000,
		maxRequests: MCP_SAMPLING_LIMIT,
		windowMs: RATE_LIMIT_WINDOW_MS // 2 minute block
	},

	// MCP tool calls - strict limits for security
	mcp_tool_call: {
		blockDurationMs: RATE_LIMIT_BLOCK_DURATION_MS,
		maxRequests: MCP_TOOL_CALL_LIMIT,
		windowMs: RATE_LIMIT_WINDOW_MS
	}
};

/**
 * Rate Limiter Class
 *
 * Implements sliding window rate limiting with automatic cleanup.
 * Thread-safe and memory-efficient with bounded storage.
 */
export class RateLimiter {
	private cleanupInterval: NodeJS.Timeout | null = null;
	private config: Record<string, RateLimitRule>;
	private rules: Record<string, RateLimitEntry> = {};

	constructor(options: RateLimitOptions = {}) {
		this.config = { ...DEFAULT_RATE_LIMIT_RULES, ...options.rules };

		// Start automatic cleanup
		const cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes
		this.startCleanup(cleanupIntervalMs);
	}

	/**
	 * Check if a request is allowed under rate limiting rules
	 */
	isAllowed(identifier: string, ruleName: string = 'default'): boolean {
		const rule = this.config[ruleName] ?? this.config['default'];
		if (!rule) {
			throw new Error(`Rate limit rule '${ruleName}' not found and no default rule configured`);
		}
		const now = Date.now();

		// Initialize entry if it doesn't exist
		this.rules[identifier] ??= {
			lastRequest: now,
			requests: []
		};

		const entry = this.rules[identifier];

		// Check if currently blocked
		if (entry.blockedUntil && now < entry.blockedUntil) {
			return false;
		}

		// Remove old requests outside the window
		entry.requests = entry.requests.filter((timestamp) => now - timestamp < rule.windowMs);

		// Check if under the limit
		if (entry.requests.length < rule.maxRequests) {
			entry.requests.push(now);
			entry.lastRequest = now;
			entry.blockedUntil = undefined; // Clear any previous block
			return true;
		}

		// Exceeded limit - apply block
		if (rule.blockDurationMs) {
			entry.blockedUntil = now + rule.blockDurationMs;
		}

		return false;
	}

	/**
	 * Get rate limit status for an identifier
	 */
	getStatus(
		identifier: string,
		ruleName: string = 'default'
	): {
		allowed: boolean;
		blockedUntil?: number;
		remaining: number;
		resetTime: number;
	} {
		const rule = this.config[ruleName] ?? this.config['default'];
		if (!rule) {
			throw new Error(`Rate limit rule '${ruleName}' not found and no default rule configured`);
		}
		const now = Date.now();

		const entry = this.rules[identifier] ?? { lastRequest: now, requests: [] };
		const blocked = entry.blockedUntil && now < entry.blockedUntil;

		// Clean old requests
		const validRequests = entry.requests.filter((timestamp) => now - timestamp < rule.windowMs);

		const remaining = Math.max(0, rule.maxRequests - validRequests.length);
		const firstRequest = validRequests[0];
		const resetTime = firstRequest !== undefined ? firstRequest + rule.windowMs : now + rule.windowMs;

		return {
			allowed: !blocked && remaining > 0,
			blockedUntil: blocked ? entry.blockedUntil : undefined,
			remaining,
			resetTime
		};
	}

	/**
	 * Reset rate limit for an identifier
	 */
	reset(identifier: string): void {
		delete this.rules[identifier];
	}

	/**
	 * Get all configured rules
	 */
	getRules(): Record<string, RateLimitRule> {
		return { ...this.config };
	}

	/**
	 * Update a rate limit rule
	 */
	updateRule(ruleName: string, rule: RateLimitRule): void {
		this.config[ruleName] = rule;
	}

	/**
	 * Get current statistics
	 */
	getStats(): {
		activeRules: string[];
		blockedIdentifiers: number;
		totalIdentifiers: number;
	} {
		const now = Date.now();

		const blockedCount = Object.values(this.rules).filter(
			(entry) => entry.blockedUntil && now < entry.blockedUntil
		).length;

		return {
			activeRules: Object.keys(this.config),
			blockedIdentifiers: blockedCount,
			totalIdentifiers: Object.keys(this.rules).length
		};
	}

	/**
	 * Start automatic cleanup of old entries
	 */
	private startCleanup(intervalMs: number): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, intervalMs);

		// Allow process to exit even if cleanup interval is active
		this.cleanupInterval.unref();
	}

	/**
	 * Clean up old rate limit entries
	 */
	private cleanup(): void {
		const now = Date.now();
		const maxWindow = Math.max(...Object.values(this.config).map((r) => r.windowMs));

		// Remove entries that haven't been active for more than 2x the max window
		const cutoffTime = now - maxWindow * 2;

		Object.entries(this.rules)
			.filter(([, entry]) => entry.lastRequest < cutoffTime && (!entry.blockedUntil || entry.blockedUntil < now))
			.forEach(([identifier]) => delete this.rules[identifier]);
	}

	/**
	 * Stop cleanup and clear all data
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.rules = {};
	}
}

// Singleton instance for global use
let globalRateLimiter: null | RateLimiter = null;

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(options?: RateLimitOptions): RateLimiter {
	globalRateLimiter ??= new RateLimiter(options);
	return globalRateLimiter;
}

/**
 * Set a custom global rate limiter instance
 */
export function setRateLimiter(rateLimiter: RateLimiter): void {
	globalRateLimiter = rateLimiter;
}

/**
 * Check if a request is rate limited
 */
export function checkRateLimit(identifier: string, ruleName: string = 'default'): boolean {
	return getRateLimiter().isAllowed(identifier, ruleName);
}

/**
 * Get rate limit status
 */
export function getRateLimitStatus(
	identifier: string,
	ruleName: string = 'default'
): {
	allowed: boolean;
	blockedUntil?: number;
	remaining: number;
	resetTime: number;
} {
	return getRateLimiter().getStatus(identifier, ruleName);
}
