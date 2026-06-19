/**
 * Global test setup for VALORA
 *
 * This setup configures:
 * - Environment variables for testing
 * - Global mocks and utilities
 * - Cleanup hooks
 *
 * Valora is process-local at v2.5; persistence is out of scope.
 * Testcontainers will be re-introduced behind a real adapter when
 * a database or cache consumer is added to src/.
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AI_INTERACTIVE = 'false';
process.env.AI_MCP_ENABLED = 'false';

/**
 * Global setup - runs once before all tests
 */
beforeAll(async () => {
	// Set up test environment variables
	process.env.AI_TEST_MODE = 'true';
}, 30000);

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
	// Nothing to tear down — no containers in use
}, 30000);

/**
 * Per-test setup
 */
beforeEach(() => {
	// Reset any global state between tests
	// This ensures test isolation
});

/**
 * Per-test teardown
 */
afterEach(async () => {
	// Clean up any test-specific resources
	// Reset mocks, clear caches, etc.

	// Clear all mocks between tests
	vi.clearAllMocks();
});
