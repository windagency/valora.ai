/**
 * Number formatting utilities
 *
 * Formats numbers as:
 * - 1, 10, 100 for small numbers
 * - 1k, 1.1k, 10k for thousands
 * - 1M, 1.1M for millions
 */

/**
 * Format a number for compact display
 * Examples: 1, 10, 100, 1k, 1.1k, 10k, 100k, 1M, 1.1M
 */
export function formatNumber(num: number): string {
	if (num < 1000) {
		return String(num);
	}

	if (num < 1000000) {
		const k = num / 1000;
		// Show one decimal if less than 10k and has meaningful decimal
		if (k < 10 && k % 1 >= 0.05) {
			return `${k.toFixed(1)}k`;
		}
		return `${Math.floor(k)}k`;
	}

	const m = num / 1000000;
	// Show one decimal if less than 10M and has meaningful decimal
	if (m < 10 && m % 1 >= 0.05) {
		return `${m.toFixed(1)}M`;
	}
	return `${Math.floor(m)}M`;
}

/**
 * Format a number with locale-aware thousand separators
 * Examples: 1, 10, 100, 1,000, 10,000, 1,000,000
 */
export function formatNumberWithSeparators(num: number): string {
	return num.toLocaleString();
}

/**
 * Time unit configuration for duration formatting
 */
const timeUnits = [
	{ divisor: 86400, label: 'd', mod: Infinity },
	{ divisor: 3600, label: 'h', mod: 24 },
	{ divisor: 60, label: 'm', mod: 60 },
	{ divisor: 1, label: 's', mod: 60 }
] as const;

/**
 * Format duration in seconds to human-readable format
 * Examples: 45s, 2m 30s, 1h 42m 32s, 2d 3h 15m
 */
export function formatDuration(seconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(seconds));

	const parts = timeUnits
		.map(({ divisor, label, mod }) => {
			const value = Math.floor(totalSeconds / divisor) % mod;
			return value > 0 ? `${value}${label}` : null;
		})
		.filter((part): part is string => part !== null);

	return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Format duration in milliseconds to human-readable format
 * Examples: 500ms, 45s, 2m 30s, 1h 42m 32s
 */
export function formatDurationMs(ms: number): string {
	if (ms < 1000) {
		return `${Math.max(0, Math.floor(ms))}ms`;
	}
	return formatDuration(ms / 1000);
}
