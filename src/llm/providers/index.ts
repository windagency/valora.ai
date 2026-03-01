/**
 * Provider Initialization Module
 *
 * This module imports all provider implementations to trigger their self-registration
 * with the LLM Provider Registry. By importing this module, all providers become
 * available in the registry without the registry needing to know about concrete
 * provider implementations.
 *
 * Architecture Pattern: Dynamic Registration (Dependency Inversion Principle)
 * - Registry depends on interfaces (LLMProvider), not concrete implementations
 * - Providers register themselves when their modules are loaded
 * - This module orchestrates the loading process
 *
 * Usage: Import this module in your application entry point or DI container
 * to ensure all providers are registered before they're needed.
 */

// Import all providers to trigger their self-registration
import './anthropic.provider';
import './cursor.provider';
import './google.provider';
import './openai.provider';

// Re-export provider classes for testing and special use cases
// (Most code should use the registry, not import providers directly)
export { AnthropicProvider } from './anthropic.provider';
export { CursorProvider } from './cursor.provider';
export { GoogleProvider } from './google.provider';
export { OpenAIProvider } from './openai.provider';
