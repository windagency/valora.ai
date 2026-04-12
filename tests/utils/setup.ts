/**
 * Global test setup for VALORA
 *
 * This setup configures:
 * - Environment variables for testing
 * - Global mocks and utilities
 * - Testcontainers when explicitly enabled via USE_TESTCONTAINERS=true
 * - Cleanup hooks
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AI_INTERACTIVE = 'false';
process.env.AI_MCP_ENABLED = 'false';

// Testcontainers are opt-in: only initialize when USE_TESTCONTAINERS=true
const useTestcontainers = process.env.USE_TESTCONTAINERS === 'true' && process.env.SKIP_TESTCONTAINERS !== 'true';

let testcontainersAvailable = false;
let testcontainersHelper: any = null;

async function initializeTestcontainersHelper() {
	try {
		const { TestcontainersHelper } = await import('./testcontainers-helper.js');
		testcontainersHelper = new TestcontainersHelper();
		testcontainersAvailable = true;
	} catch (_error) {
		console.warn('Testcontainers not available, running tests without containerized dependencies');
		testcontainersAvailable = false;
	}
}

/**
 * Global setup - runs once before all tests
 */
beforeAll(
	async () => {
		// Set up test environment variables
		process.env.AI_TEST_MODE = 'true';

		if (useTestcontainers) {
			await initializeTestcontainersHelper();

			if (testcontainersAvailable && testcontainersHelper) {
				try {
					await testcontainersHelper.startSharedContainers();
					process.env.AI_TEST_DATABASE_URL = await testcontainersHelper.getDatabaseUrl();
					process.env.AI_TEST_REDIS_URL = await testcontainersHelper.getRedisUrl();
				} catch (error) {
					console.warn('Failed to start testcontainers, continuing without containers:', error);
					testcontainersAvailable = false;
				}
			}
		}

		if (!testcontainersAvailable) {
			process.env.AI_TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/ai_test';
			process.env.AI_TEST_REDIS_URL = 'redis://localhost:6379';
		}
	},
	useTestcontainers ? 300000 : 30000
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
