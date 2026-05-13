/**
 * Minimal logger interface used across Valora packages.
 *
 * The host owns a richer `Logger` (cleanup-aware, color-aware, file-rotating).
 * Packages that don't want to depend on the host accept this minimal port —
 * structurally compatible with the host's logger so direct injection works.
 *
 * `getLogger()` returns a console-fallback singleton by default. The host
 * overrides it via `setLoggerImpl()` at boot so plugin code uses the rich
 * host logger without depending on host source.
 */

export interface Logger {
	debug(message: string, data?: Record<string, unknown>): void;
	error(message: string, error?: Error, data?: Record<string, unknown>): void;
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
}

const consoleLogger: Logger = {
	debug(message, data) {
		console.debug('●', message, data ?? '');
	},
	error(message, error, data) {
		console.error('✗', message, error ?? '', data ?? '');
	},
	info(message, data) {
		console.info('●', message, data ?? '');
	},
	warn(message, data) {
		console.warn('⚠', message, data ?? '');
	}
};

let activeLogger: Logger = consoleLogger;

export function getLogger(): Logger {
	return activeLogger;
}

/**
 * Override the active logger. Called by the host once during boot to install
 * its production logger; by tests to install a spy. Idempotent: passing the
 * same logger twice is a no-op.
 */
export function setLoggerImpl(logger: Logger): void {
	activeLogger = logger;
}

/** Restore the default console-fallback logger. Used by tests. */
export function resetLogger(): void {
	activeLogger = consoleLogger;
}
