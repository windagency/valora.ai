/**
 * Re-export shim — `safe-exec` lives in `@windagency/valora-runtime`.
 *
 * Host callers using the legacy path (`from 'utils/safe-exec'`) keep working
 * via this re-export. New code should import directly from
 * `@windagency/valora-runtime`.
 */

export {
	CommandExecutionError,
	type ExecResult,
	RetryExecutor,
	SafeExecutor,
	type SpawnOptions
} from '@windagency/valora-runtime';
