/**
 * Global test setup for VALORA
 *
 * This setup configures:
 * - Environment variables for testing
 * - Global mocks and utilities
 * - Testcontainers when available
 * - Cleanup hooks
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AI_INTERACTIVE = 'false';
process.env.AI_MCP_ENABLED = 'false';

// Check if testcontainers is available
let testcontainersAvailable = false;
let testcontainersHelper: any = null;

async function initializeTestcontainersHelper() {
	try {
		// Try to import testcontainers helper
		const { TestcontainersHelper } = await import('./testcontainers-helper.js');
		testcontainersHelper = new TestcontainersHelper();
		testcontainersAvailable = true;
	} catch (error) {
		console.warn('Testcontainers not available, running tests without containerized dependencies');
		testcontainersAvailable = false;
	}
}

/**
 * Global setup - runs once before all tests
 */
beforeAll(
	async () => {
		// Initialize testcontainers helper
		await initializeTestcontainersHelper();

		// Set up test environment variables
		process.env.AI_TEST_MODE = 'true';

		// Initialize testcontainers if available
		if (testcontainersAvailable && testcontainersHelper) {
			try {
				// Start shared containers (if needed)
				await testcontainersHelper.startSharedContainers();

				// Set up container URLs
				process.env.AI_TEST_DATABASE_URL = await testcontainersHelper.getDatabaseUrl();
				process.env.AI_TEST_REDIS_URL = await testcontainersHelper.getRedisUrl();
			} catch (error) {
				console.warn('Failed to start testcontainers, continuing without containers:', error);
				testcontainersAvailable = false;
			}
		}

		// Set default URLs if containers not available
		if (!testcontainersAvailable) {
			process.env.AI_TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/ai_test';
			process.env.AI_TEST_REDIS_URL = 'redis://localhost:6379';
		}
	},
	testcontainersAvailable ? 300000 : 30000
);

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
	// Clean up testcontainers
	if (testcontainersAvailable && testcontainersHelper) {
		try {
			await testcontainersHelper.stopAllContainers();
		} catch (error) {
			console.warn('Failed to stop testcontainers:', error);
		}
	}
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
