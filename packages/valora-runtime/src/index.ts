/**
 * @windagency/valora-runtime — pure-leaf utilities shared across Valora packages.
 */

export { BaseError, type ErrorContext, ProviderError, type RecoveryStrategy } from './error.js';

export {
	generateDecisionId,
	generateExplorationId,
	generateId,
	generateInsightId,
	generateMemoryId,
	generateSessionId,
	generateShortId
} from './id-generator.js';

export { getLogger, type Logger, resetLogger, setLoggerImpl } from './logger.js';

export {
	getGlobalConfigDir,
	getGlobalPluginsDir,
	getPackageDataDir,
	getPackagePluginsDir,
	getPackageRoot,
	getPluginRegistryPath,
	getProjectConfigDir,
	getProjectPluginsDir,
	getRuntimeDataDir,
	getSystemPluginsDir,
	getValoraVersion,
	hasAnyValoraConfig
} from './paths.js';

export { CommandExecutionError, type ExecResult, RetryExecutor, SafeExecutor, type SpawnOptions } from './safe-exec.js';
