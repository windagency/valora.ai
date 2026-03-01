/**
 * Common type definitions used across the application
 *
 * This file contains standardized types that are used in multiple places
 * to ensure consistency and avoid duplication.
 */

/**
 * Common status values used across different entities
 */
export type Status = 'active' | 'completed' | 'failed' | 'paused';

/**
 * Log levels for logging configuration
 */
export type LogLevel = 'debug' | 'error' | 'info' | 'warn';

/**
 * Output formats supported by the system
 */
export type OutputFormat = 'json' | 'markdown' | 'plain' | 'yaml';

/**
 * Input types for prompt definitions
 */
export type InputType = 'array' | 'boolean' | 'number' | 'object' | 'string';

/**
 * Workflow next phase options
 */
export type WorkflowNextPhase = 'end' | 'loop';

/**
 * MCP tool result content types
 */
export type ContentType = 'audio' | 'image' | 'resource' | 'text';
