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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
 * Every security guard (CommandGuard, CredentialGuard, PromptInjectionDetector,
 * ToolDefinitionValidator, ToolIntegrityMonitor) writes blocked/redacted/flagged
 * events to a process-wide `getAuditSink()` singleton that defaults to the real
 * on-disk `.valora/security-audit.jsonl`. Any test that exercises real guard
 * behavior — directly or transitively through a provider/executor/LSP/MCP code
 * path — would otherwise pollute that real, persistent file. Isolating this
 * globally, once, is far more reliable than isolating it per test file: the
 * guards are called from dozens of production call sites across the codebase,
 * and a new caller added later would silently reintroduce the leak if isolation
 * were only applied at individual test-file call sites.
 *
 * The import of `security/audit-sink` is deliberately dynamic (inside the hook
 * body, not a static top-level import) — `audit-sink.ts` transitively imports
 * `utils/paths`, which imports the literal `'fs'` specifier. A static import
 * here would resolve `'fs'` while this setup file loads, which happens before
 * a test file's own `vi.mock('fs')` is hoisted and applied — locking in the
 * real module ahead of the mock and breaking any test that auto-mocks `fs`
 * (e.g. `file-utils.test.ts`). A dynamic import deferred until the hook runs
 * (after the test file's mocks are already registered) avoids that ordering
 * hazard entirely.
 */
let auditSinkTestDir: string | undefined;

/**
 * Per-test setup
 */
beforeEach(async () => {
	// Reset any global state between tests
	// This ensures test isolation
	auditSinkTestDir = undefined;
	try {
		const { JsonlAuditSink, setAuditSink } = await import('security/audit-sink');
		const dir = mkdtempSync(join(tmpdir(), 'valora-test-audit-sink-'));
		setAuditSink(new JsonlAuditSink(join(dir, 'audit.jsonl')));
		auditSinkTestDir = dir;
	} catch {
		// A test file that replaces the entire `fs` module with an auto-mock
		// (e.g. `vi.mock('fs')`) makes `mkdtempSync` itself a mock returning
		// undefined — there's no real filesystem reachable to isolate in that
		// case, and the guards under test won't touch a real audit sink either.
	}
});

/**
 * Per-test teardown
 */
afterEach(async () => {
	// Clean up any test-specific resources
	// Reset mocks, clear caches, etc.

	try {
		const { resetAuditSink } = await import('security/audit-sink');
		resetAuditSink();
		if (auditSinkTestDir) rmSync(auditSinkTestDir, { force: true, recursive: true });
	} catch {
		// Same rationale as the beforeEach guard above.
	}

	// Clear all mocks between tests
	vi.clearAllMocks();
});
