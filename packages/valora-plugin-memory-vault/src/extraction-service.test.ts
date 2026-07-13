/**
 * Tests for MemoryExtractionService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryEntry } from '@windagency/valora-plugin-api';

// Mock MemoryManager + the vault store at the relative-import level.
// extraction-service.ts pulls these via './manager' and './vault/vault-store',
// so the package barrel mock would not intercept them.
vi.mock('./manager', () => ({ MemoryManager: vi.fn() }));
vi.mock('./vault/vault-store', () => ({ VaultStore: vi.fn() }));
vi.mock('./vault/default-vault-dir', () => ({
	getDefaultVaultDir: vi.fn().mockReturnValue('/tmp/valora-vault-mock'),
	getLegacyJsonDir: vi.fn().mockReturnValue('/tmp/valora-vault-mock')
}));
vi.mock('./migration/auto-migrate', () => ({ runAutoMigrationIfNeeded: vi.fn().mockReturnValue(null) }));

import { getMemoryExtraction, MemoryExtractionService, resetMemoryExtraction } from './extraction-service';
import { MemoryManager } from './manager';
import { VaultStore } from './vault/vault-store';

const MockMemoryManager = vi.mocked(MemoryManager);
const MockMemoryStore = vi.mocked(VaultStore);

/** Build a minimal MemoryEntry for testing. */
function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	return {
		id: 'mem-test-001',
		category: 'episodic',
		content: 'Test memory content',
		tags: ['testing'],
		source: { command: 'feedback', label: 'post-session-extraction' },
		confidence: 'observed',
		halfLifeDays: 7,
		createdAt: new Date().toISOString(),
		lastAccessedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		accessCount: 0,
		agentRole: 'product-manager',
		sessionId: 'sess-001',
		relatedPaths: [],
		isError: false,
		...overrides
	};
}

describe('MemoryExtractionService', () => {
	let mockManagerInstance: {
		create: ReturnType<typeof vi.fn>;
	};
	let mockStoreInstance: Record<string, never>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockStoreInstance = {};
		mockManagerInstance = {
			create: vi.fn().mockImplementation((_category: string, options: Record<string, unknown>) =>
				Promise.resolve(
					makeEntry({
						content: options['content'] as string,
						confidence: options['confidence'] as MemoryEntry['confidence'],
						isError: (options['isError'] as boolean) ?? false,
						tags: (options['tags'] as string[]) ?? [],
						agentRole: (options['agentRole'] as string) ?? 'product-manager',
						sessionId: (options['sessionId'] as string) ?? 'sess-001',
						relatedPaths: (options['relatedPaths'] as string[]) ?? [],
						source: (options['source'] as MemoryEntry['source']) ?? {
							command: 'feedback',
							label: 'post-session-extraction'
						}
					})
				)
			)
		};

		MockMemoryStore.mockImplementation(() => mockStoreInstance as unknown as VaultStore);
		MockMemoryManager.mockImplementation(() => mockManagerInstance as unknown as MemoryManager);

		resetMemoryExtraction();
	});

	afterEach(() => {
		resetMemoryExtraction();
	});

	// ------------------------------------------------------------------ 1
	describe('extractFromFeedbackOutputs() with empty stage outputs', () => {
		it('returns an empty array when no stage outputs are provided', async () => {
			const service = new MemoryExtractionService();
			const result = await service.extractFromFeedbackOutputs([], 'sess-001', 'product-manager');
			expect(result).toEqual([]);
			expect(mockManagerInstance.create).not.toHaveBeenCalled();
		});
	});

	// ------------------------------------------------------------------ 2
	describe('Error patterns', () => {
		it('creates observed isError entries for each error (up to 5)', async () => {
			const errors = ['err1', 'err2', 'err3', 'err4', 'err5', 'err6'];
			const service = new MemoryExtractionService();
			const result = await service.extractFromFeedbackOutputs(
				[{ outputs: { errors_encountered: errors }, success: true }],
				'sess-001',
				'product-manager'
			);

			// Should cap at 5
			expect(result).toHaveLength(5);

			for (const call of mockManagerInstance.create.mock.calls) {
				const [category, options] = call as [string, Record<string, unknown>];
				expect(category).toBe('episodic');
				expect(options['confidence']).toBe('observed');
				expect(options['isError']).toBe(true);
				expect(options['tags']).toContain('error');
				expect(options['tags']).toContain('feedback');
			}
		});

		it('creates no entries when errors_encountered is empty', async () => {
			const service = new MemoryExtractionService();
			const result = await service.extractFromFeedbackOutputs(
				[{ outputs: { errors_encountered: [] }, success: true }],
				'sess-001',
				'product-manager'
			);
			expect(result).toHaveLength(0);
		});
	});

	// ------------------------------------------------------------------ 3
	describe('User feedback — satisfaction >= 8', () => {
		it('creates a verified entry when satisfaction_score >= 8', async () => {
			const service = new MemoryExtractionService();
			const result = await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							satisfaction_score: 9,
							feedback_comments: 'Great workflow!'
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			expect(result.length).toBeGreaterThanOrEqual(1);
			const verifiedCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => opts['confidence'] === 'verified'
			);
			expect(verifiedCalls).toHaveLength(1);
			const [, opts] = verifiedCalls[0] as [string, Record<string, unknown>];
			expect(opts['tags']).toContain('user-feedback');
			expect(opts['tags']).toContain('satisfaction');
			expect(opts['isError']).toBe(false);
		});

		it('creates a verified entry when success_highlights has entries', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							success_highlights: ['fast execution', 'no errors']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const verifiedCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => opts['confidence'] === 'verified'
			);
			expect(verifiedCalls).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------ 4
	describe('User feedback — pain_points', () => {
		it('creates an observed entry when pain_points has entries', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							pain_points: ['slow tests', 'confusing step 3']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const painPointCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => (opts['tags'] as string[]).includes('pain-point')
			);
			expect(painPointCalls).toHaveLength(1);
			const [, opts] = painPointCalls[0] as [string, Record<string, unknown>];
			expect(opts['confidence']).toBe('observed');
			expect(opts['isError']).toBe(false);
		});
	});

	// ------------------------------------------------------------------ 5
	describe('Bottlenecks', () => {
		it('creates observed entries for each bottleneck (up to 3)', async () => {
			const bottlenecks = ['slow-test', 'lint-retry', 'deploy-lag', 'timeout'];
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[{ outputs: { bottlenecks_identified: bottlenecks }, success: true }],
				'sess-001',
				'product-manager'
			);

			const bottleneckCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => (opts['tags'] as string[]).includes('bottleneck')
			);
			// Should cap at 3
			expect(bottleneckCalls).toHaveLength(3);
			for (const [, opts] of bottleneckCalls as Array<[string, Record<string, unknown>]>) {
				expect(opts['confidence']).toBe('observed');
				expect(opts['tags']).toContain('performance');
			}
		});
	});

	// ------------------------------------------------------------------ 6
	describe('Patterns — agent_improvements', () => {
		it('creates an inferred entry for agent_improvements', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							agent_improvements: [{ agent: 'lead', suggestion: 'check linting first' }]
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const improvementCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) =>
					(opts['tags'] as string[]).includes('improvement') && (opts['tags'] as string[]).includes('agent')
			);
			expect(improvementCalls).toHaveLength(1);
			const [, opts] = improvementCalls[0] as [string, Record<string, unknown>];
			expect(opts['confidence']).toBe('inferred');
		});
	});

	// ------------------------------------------------------------------ 7
	describe('Patterns — workflow_optimizations', () => {
		it("creates an inferred entry with 'optimization' tag for workflow_optimizations", async () => {
			// Tag identifier uses American English per LANGUAGE_CONVENTION.md.
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							workflow_optimizations: ['parallelize test execution']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const optimisationCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) =>
					(opts['tags'] as string[]).includes('optimization') && (opts['tags'] as string[]).includes('workflow')
			);
			expect(optimisationCalls).toHaveLength(1);
			const [, opts] = optimisationCalls[0] as [string, Record<string, unknown>];
			expect(opts['confidence']).toBe('inferred');
		});
	});

	// ------------------------------------------------------------------ 8
	describe('files_changed → relatedPaths', () => {
		it('includes files from files_changed in relatedPaths', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							files_changed: ['  src/auth/login.ts  ', 'src/utils/helpers.ts', ''],
							errors_encountered: ['some error']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const createCalls = mockManagerInstance.create.mock.calls;
			expect(createCalls.length).toBeGreaterThan(0);
			for (const [, opts] of createCalls as Array<[string, Record<string, unknown>]>) {
				const paths = opts['relatedPaths'] as string[];
				expect(paths).toContain('src/auth/login.ts');
				expect(paths).toContain('src/utils/helpers.ts');
				// Empty string should be filtered out
				expect(paths).not.toContain('');
			}
		});

		it('flattens files_changed when the LLM returns an object with created/modified/deleted/renamed sub-arrays', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							files_changed: {
								created: ['knowledge-base/backend/API.md', 'knowledge-base/backend/ARCHITECTURE.md'],
								modified: ['knowledge-base/FUNCTIONAL.md', 'knowledge-base/PRD.md'],
								deleted: [],
								renamed: []
							},
							errors_encountered: ['some error']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const createCalls = mockManagerInstance.create.mock.calls;
			expect(createCalls.length).toBeGreaterThan(0);
			for (const [, opts] of createCalls as Array<[string, Record<string, unknown>]>) {
				const paths = opts['relatedPaths'] as string[];
				expect(paths).toContain('knowledge-base/backend/API.md');
				expect(paths).toContain('knowledge-base/FUNCTIONAL.md');
			}
		});

		it('does not throw when files_changed is an unexpected shape', async () => {
			const service = new MemoryExtractionService();
			await expect(
				service.extractFromFeedbackOutputs(
					[{ outputs: { files_changed: 42, errors_encountered: ['err'] }, success: true }],
					'sess-001',
					'product-manager'
				)
			).resolves.not.toThrow();
		});
	});

	// ------------------------------------------------------------------ 9
	describe('Source fields', () => {
		it("all entries have source.command === 'feedback' and source.label === 'post-session-extraction'", async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							errors_encountered: ['err'],
							pain_points: ['pain'],
							bottlenecks_identified: ['bottleneck'],
							agent_improvements: ['improvement'],
							workflow_optimizations: ['optimization']
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const createCalls = mockManagerInstance.create.mock.calls;
			expect(createCalls.length).toBeGreaterThan(0);
			for (const [, opts] of createCalls as Array<[string, Record<string, unknown>]>) {
				const source = opts['source'] as { command: string; label: string };
				expect(source.command).toBe('feedback');
				expect(source.label).toBe('post-session-extraction');
			}
		});
	});

	// ------------------------------------------------------------------ 10
	describe('Failed stage outputs', () => {
		it('excludes failed stage outputs (success: false) from merging', async () => {
			const service = new MemoryExtractionService();
			const result = await service.extractFromFeedbackOutputs(
				[
					{
						outputs: { errors_encountered: ['err1', 'err2'] },
						success: false // Should be excluded
					},
					{
						outputs: { workflow_optimizations: ['optimize-tests'] },
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			// Only the workflow_optimizations from the successful stage should produce entries
			const errorCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => (opts['isError'] as boolean) === true
			);
			expect(errorCalls).toHaveLength(0);

			// The optimisation entry should exist
			const optimisationCalls = mockManagerInstance.create.mock.calls.filter(
				([, opts]: [string, Record<string, unknown>]) => (opts['tags'] as string[]).includes('optimization')
			);
			expect(optimisationCalls).toHaveLength(1);
			expect(result).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------ singleton
	describe('Singleton helpers', () => {
		it('getMemoryExtraction() returns the same instance on repeated calls', () => {
			const a = getMemoryExtraction();
			const b = getMemoryExtraction();
			expect(a).toBe(b);
		});

		it('resetMemoryExtraction() causes getMemoryExtraction() to return a new instance', () => {
			const a = getMemoryExtraction();
			resetMemoryExtraction();
			const b = getMemoryExtraction();
			expect(a).not.toBe(b);
		});
	});

	// ------------------------------------------------------------------ credential redaction
	describe('Credential redaction', () => {
		it('redacts an API key embedded in an error object before persisting', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							errors_encountered: [{ message: 'auth failed', key: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890' }]
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const [, options] = mockManagerInstance.create.mock.calls[0] as [string, Record<string, unknown>];
			expect(options['content']).not.toContain('sk-ant-api03');
			expect(options['content']).toContain('[REDACTED]');
		});

		it('redacts a credential embedded in a bottleneck object before persisting', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: { bottlenecks_identified: [{ detail: 'token=ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD' }] },
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const [, options] = mockManagerInstance.create.mock.calls[0] as [string, Record<string, unknown>];
			expect(options['content']).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD');
		});

		it('redacts credentials embedded in pain points before persisting', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[{ outputs: { pain_points: [{ detail: 'AKIAABCDEFGHIJKLMNOP leaked in logs' }] }, success: true }],
				'sess-001',
				'product-manager'
			);

			const [, options] = mockManagerInstance.create.mock.calls[0] as [string, Record<string, unknown>];
			expect(options['content']).not.toContain('AKIAABCDEFGHIJKLMNOP');
		});

		it('does not alter content with no credential-shaped substrings', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[{ outputs: { errors_encountered: ['a plain error message'] }, success: true }],
				'sess-001',
				'product-manager'
			);

			const [, options] = mockManagerInstance.create.mock.calls[0] as [string, Record<string, unknown>];
			expect(options['content']).toBe('Error during product-manager: "a plain error message"');
		});

		it('redacts a credential pasted into free-text feedback comments', async () => {
			const service = new MemoryExtractionService();
			await service.extractFromFeedbackOutputs(
				[
					{
						outputs: {
							satisfaction_score: 9,
							feedback_comments: 'Great workflow! Oh btw my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890'
						},
						success: true
					}
				],
				'sess-001',
				'product-manager'
			);

			const [, options] = mockManagerInstance.create.mock.calls[0] as [string, Record<string, unknown>];
			expect(options['content']).not.toContain('sk-ant-api03');
			expect(options['content']).toContain('[REDACTED]');
		});
	});
});
