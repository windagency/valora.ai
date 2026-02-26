/**
 * Configuration Constants
 *
 * Centralized constants to eliminate magic numbers throughout the codebase.
 * All configurable values that appear in multiple places should be defined here.
 */

export const MCP_ID = 'mcp-valora';

/**
 * LLM Completion Modes
 */
export const COMPLETION_MODE = {
	GUIDED: 'guided' // Guided completion mode for cursor provider without MCP sampling
} as const;

export type CompletionModeValue = (typeof COMPLETION_MODE)[keyof typeof COMPLETION_MODE];

/**
 * LLM Configuration Constants
 */
export const DEFAULT_MAX_TOKENS = 32768; // Increased to handle large document outputs (PRD, architecture docs)
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Session Management Constants
 */
export const SESSION_ARCHIVE_DAYS = 7;
export const SESSION_CLEANUP_DAYS = 30;
export const SESSION_PERSIST_DEBOUNCE_MS = 1000;
export const SESSION_PERSIST_EXTENDED_DEBOUNCE_MS = 5000; // Extended debounce for rapid same-session commands
export const SESSION_RAPID_COMMAND_THRESHOLD_MS = 10000; // Window to detect rapid commands (10s)

/**
 * Session Retention Constants
 */
export const DEFAULT_SESSION_RETENTION_ENABLED = true;
export const DEFAULT_SESSION_MAX_AGE_DAYS = 90;
export const DEFAULT_SESSION_MAX_SIZE_MB = 50;
export const DEFAULT_SESSION_MAX_COUNT = 100;
export const DEFAULT_SESSION_COMPRESS_AFTER_DAYS = 30;
export const DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS = 24;
export const DEFAULT_SESSION_DRY_RUN = false;

/**
 * Logging Configuration Constants
 */
export const LOG_BUFFER_SIZE = 100;

/**
 * Time Conversion Constants (milliseconds)
 */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Byte Conversion Constants
 */
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * BYTES_PER_KB;
export const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/**
 * Log Retention Constants
 */
export const DEFAULT_LOG_RETENTION_ENABLED = true;
export const DEFAULT_LOG_MAX_AGE_DAYS = 30;
export const DEFAULT_LOG_MAX_SIZE_MB = 100;
export const DEFAULT_LOG_MAX_FILES = 100;
export const DEFAULT_LOG_COMPRESS_AFTER_DAYS = 7;
export const DEFAULT_LOG_CLEANUP_INTERVAL_HOURS = 24;
export const DEFAULT_LOG_DRY_RUN = false;

/**
 * Compression Constants
 */
export const LOG_COMPRESSION_LEVEL = 6; // Default gzip compression level (0-9)

/**
 * Log File Management Constants
 */
export const LOG_FILE_PREFIX = 'ai-'; // Prefix for log files
export const LOG_FILE_EXTENSION = '.log'; // Extension for uncompressed log files
export const LOG_COMPRESSED_EXTENSION = '.gz'; // Extension for compressed log files
export const LOG_DATE_FORMAT = 'YYYY-MM-DD'; // Date format for daily files

/**
 * Daily File Rotation Constants
 */
export const DEFAULT_DAILY_FILE_MAX_SIZE_MB = 50; // Maximum size for a single daily log file before rotation
export const DAILY_FILE_ROTATION_ENABLED = true; // Enable/disable daily file rotation

/**
 * Network/Timeout Configuration Constants
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Security Configuration Constants
 */
export const MAX_REQUEST_SIZE_BYTES = 1024 * 1024; // 1MB per request
export const MAX_SESSION_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per session
export const MAX_STRING_LENGTH = 100 * 1024; // 100KB per string
export const MAX_ARRAY_LENGTH = 1000; // 1000 items per array
export const MAX_OBJECT_DEPTH = 10; // 10 levels of nesting
export const MAX_OBJECT_KEYS = 1000; // 1000 keys per object

/**
 * Rate Limiting Constants
 */
export const MCP_TOOL_CALL_LIMIT = 30; // 30 calls per minute
export const MCP_SAMPLING_LIMIT = 10; // 10 sampling requests per minute
export const COMMAND_EXECUTION_LIMIT = 60; // 60 commands per minute
export const CONFIG_ACCESS_LIMIT = 120; // 120 config accesses per minute
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
export const RATE_LIMIT_BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minute block

/**
 * Monitoring Interval Constants
 */
export const SYSTEM_MONITOR_INTERVAL_MS = 10 * MS_PER_SECOND; // 10 second intervals
export const RESOURCE_MONITOR_INTERVAL_MS = 15 * MS_PER_SECOND; // 15 second intervals
export const HEALTH_CHECK_INTERVAL_MS = 5 * MS_PER_SECOND; // 5 second intervals
export const COMMAND_EXISTENCE_CHECK_TIMEOUT_MS = 5 * MS_PER_SECOND; // 5 second timeout

/**
 * Memory Threshold Constants
 */
export const DEFAULT_PROCESS_MEMORY_THRESHOLD_MB = 1536; // 1.5GB memory threshold
export const MAX_OUTPUT_PREVIEW_LENGTH = 500; // Truncate output preview
export const MAX_READ_FILE_SIZE_BYTES = 1 * BYTES_PER_MB; // 1MB max file read
export const MAX_BUFFER_SIZE_BYTES = 10 * BYTES_PER_MB; // 10MB max buffer

/**
 * Confidence Threshold Constants
 */
export const HIGH_CONFIDENCE_THRESHOLD = 80; // Green indicator threshold
export const MEDIUM_CONFIDENCE_THRESHOLD = 60; // Yellow indicator threshold
export const LOW_CONFIDENCE_THRESHOLD = 50; // Default/warning threshold
export const CONTEXT_THRESHOLD_WARNING = 50; // Context window warning threshold
export const RESOURCE_ALERT_CRITICAL_THRESHOLD = 90; // Critical resource alert
export const RESOURCE_ALERT_WARNING_THRESHOLD = 70; // Warning resource alert

/**
 * Display Truncation Constants
 */
export const SESSION_ID_DISPLAY_LENGTH = 16;
export const CONTAINER_ID_DISPLAY_LENGTH = 12;
export const PROJECT_ID_HASH_LENGTH = 8;
export const COMMAND_DISPLAY_TRUNCATE_LENGTH = 17;
export const LOG_PREVIEW_LINE_COUNT = 15;
export const OUTPUT_KEY_DISPLAY_COUNT = 5;
export const SLOW_OPERATIONS_DISPLAY_COUNT = 5;
export const SUGGESTION_DISPLAY_COUNT = 5;
export const RECENT_SESSIONS_DISPLAY_COUNT = 10;
export const ERROR_STACK_TRACE_MAX_LENGTH = 1000;

/**
 * Display Formatting Constants
 */
export const DEFAULT_BOX_WIDTH = 80;
export const DEFAULT_HEADER_WIDTH = 70;
export const SESSION_LIST_PAGE_SIZE = 20;
export const QUICK_SELECT_LIST_PAGE_SIZE = 15;

/**
 * Tracing Constants
 */
export const TRACING_BATCH_EXPORT_INTERVAL_MS = 5 * MS_PER_SECOND;
export const TRACING_MAX_BATCH_SIZE = 512;
export const TRACING_MAX_QUEUE_SIZE = 2048;

/**
 * Metrics Collection Constants
 */
export const MAX_COUNTER_METRICS = 1000;
export const MAX_GAUGE_METRICS = 500;
export const MAX_HISTOGRAM_METRICS = 200;

/**
 * Retry Constants
 */
export const RETRY_BACKOFF_MS = 2 * MS_PER_SECOND;
export const MIN_RETRY_BACKOFF_MS = 500;
export const IDEMPOTENCY_LOCK_TIMEOUT_MS = 2 * MS_PER_SECOND;

/**
 * Cryptographic Constants
 */
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_ITERATIONS_LEGACY = 10000;

/**
 * Test Timeout Constants
 */
export const TEST_TIMEOUT_MS = 60 * MS_PER_SECOND;
export const TEST_SHORT_TIMEOUT_MS = 30 * MS_PER_SECOND;

/**
 * Document Constants
 */
export const STALE_DOCUMENT_THRESHOLD_DAYS = 90;
export const MAX_SEQUENCE_ATTEMPTS = 1000;

/**
 * Idempotency Constants
 */
export const IDEMPOTENCY_CLEANUP_INTERVAL_MS = MS_PER_HOUR;

/**
 * Hooks Configuration File
 */
export const HOOKS_CONFIG_FILE = 'hooks.json';
