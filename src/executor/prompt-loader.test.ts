/**
 * Unit tests for executor/prompt-loader.ts
 *
 * Tests {{include:...}} directive resolution in PromptLoader, covering
 * successful resolution, missing-file fallback, no-directive passthrough,
 * and end-to-end loadPrompt caching with includes resolved.
 */

import * as path from 'path';

import { FileNotFoundError } from 'utils/file-utils';
import { ValidationError } from 'utils/error-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromptLoader } from './prompt-loader';

// Mock dependencies
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		findFiles: vi.fn(),
		readFile: vi.fn()
	};
});

vi.mock('utils/paths', () => ({
	getPackageDataDir: vi.fn(() => '/mock/data')
}));

vi.mock('utils/yaml-parser', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/yaml-parser')>();
	return {
		...actual,
		parseMarkdownWithFrontmatter: vi.fn(),
		validateRequiredFields: vi.fn()
	};
});

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn()
	}))
}));

import { readFile } from 'utils/file-utils';
import { getLogger } from 'output/logger';
import { parseMarkdownWithFrontmatter, validateRequiredFields } from 'utils/yaml-parser';

const mockReadFile = vi.mocked(readFile);
const mockParseMarkdown = vi.mocked(parseMarkdownWithFrontmatter);
const mockValidateRequired = vi.mocked(validateRequiredFields);
const mockGetLogger = vi.mocked(getLogger);

describe('PromptLoader', () => {
	let loader: PromptLoader;
	const promptsDir = '/mock/prompts';

	beforeEach(() => {
		loader = new PromptLoader(promptsDir);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('resolveIncludes (via loadPrompt)', () => {
		it('replaces {{include:_shared/core-principles.md}} with the file contents', async () => {
			const sharedContent = '## Core Principles\n\n1. SOLID\n2. DRY\n';
			const rawContent = 'Some intro\n\n{{include:_shared/core-principles.md}}\n\nMore text';
			const expectedContent = `Some intro\n\n${sharedContent}\n\nMore text`;

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'my-prompt.md')) {
					return '---frontmatter---';
				}
				if (filePath === path.join(promptsDir, '_shared', 'core-principles.md')) {
					return sharedContent;
				}
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.my-prompt',
					version: '1.0.0',
					category: 'code',
					name: 'My Prompt',
					description: 'A test prompt'
				} as any,
				content: rawContent
			});

			const result = await loader.loadPrompt('code.my-prompt');

			expect(result.content).toBe(expectedContent);
		});

		it('logs a warning and replaces directive with empty string when included file is missing', async () => {
			const mockWarn = vi.fn();
			mockGetLogger.mockReturnValue({ warn: mockWarn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } as any);

			const rawContent = 'Before\n\n{{include:_shared/missing.md}}\n\nAfter';

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'missing-include.md')) {
					return '---frontmatter---';
				}
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.missing-include',
					version: '1.0.0',
					category: 'code',
					name: 'Missing Include',
					description: 'A test prompt with a missing include'
				} as any,
				content: rawContent
			});

			const result = await loader.loadPrompt('code.missing-include');

			expect(result.content).toBe('Before\n\n\n\nAfter');
			expect(mockWarn).toHaveBeenCalledWith(
				expect.stringContaining('{{include}} target not found'),
				expect.objectContaining({ directive: '{{include:_shared/missing.md}}' })
			);
		});

		it('returns content unchanged when no directives are present', async () => {
			const rawContent = 'Plain content with no directives.\n\n## Section\n\nSome text.';

			mockReadFile.mockResolvedValue('---frontmatter---');

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.plain-prompt',
					version: '1.0.0',
					category: 'code',
					name: 'Plain Prompt',
					description: 'A test prompt without includes'
				} as any,
				content: rawContent
			});

			const result = await loader.loadPrompt('code.plain-prompt');

			// readFile should only be called once (for the prompt file itself)
			expect(mockReadFile).toHaveBeenCalledTimes(1);
			expect(result.content).toBe(rawContent);
		});

		it('does not expand {{include}} directives inside included files (single-pass only)', async () => {
			// outer.md itself contains a nested {{include:...}} directive
			const outerContent = 'Shared content\n\n{{include:_shared/nested.md}}';
			const rawContent = 'Before\n\n{{include:_shared/outer.md}}\n\nAfter';
			const expectedContent = `Before\n\n${outerContent}\n\nAfter`;

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'nested-prompt.md')) {
					return '---frontmatter---';
				}
				if (filePath === path.join(promptsDir, '_shared', 'outer.md')) {
					return outerContent;
				}
				// nested.md must never be read — single-pass means no recursive expansion
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.nested-prompt',
					version: '1.0.0',
					category: 'code',
					name: 'Nested Prompt',
					description: 'A test for single-pass include resolution'
				} as any,
				content: rawContent
			});

			const result = await loader.loadPrompt('code.nested-prompt');

			expect(result.content).toBe(expectedContent);
			expect(mockReadFile).not.toHaveBeenCalledWith(path.join(promptsDir, '_shared', 'nested.md'));
		});

		it('throws ValidationError when an include fails for a reason other than file-not-found', async () => {
			const rawContent = 'Before\n\n{{include:_shared/broken.md}}\n\nAfter';

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'broken-include.md')) {
					return '---frontmatter---';
				}
				if (filePath === path.join(promptsDir, '_shared', 'broken.md')) {
					throw new Error('Disk read error');
				}
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.broken-include',
					version: '1.0.0',
					category: 'code',
					name: 'Broken Include',
					description: 'A test prompt with a broken include'
				} as any,
				content: rawContent
			});

			await expect(loader.loadPrompt('code.broken-include')).rejects.toBeInstanceOf(ValidationError);
			await expect(loader.loadPrompt('code.broken-include')).rejects.toThrow('Failed to resolve include directive');
		});

		it('resolves multiple directives within the same prompt', async () => {
			const principlesContent = '## Core Principles\n\n1. SOLID\n';
			const outputContent = '## Output Format\n\nReturn JSON.\n';
			const rawContent = '{{include:_shared/core-principles.md}}\n\n{{include:_shared/output-format-preamble.md}}';
			const expectedContent = `${principlesContent}\n\n${outputContent}`;

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'multi-include.md')) {
					return '---frontmatter---';
				}
				if (filePath === path.join(promptsDir, '_shared', 'core-principles.md')) {
					return principlesContent;
				}
				if (filePath === path.join(promptsDir, '_shared', 'output-format-preamble.md')) {
					return outputContent;
				}
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.multi-include',
					version: '1.0.0',
					category: 'code',
					name: 'Multi Include',
					description: 'A test prompt with multiple includes'
				} as any,
				content: rawContent
			});

			const result = await loader.loadPrompt('code.multi-include');

			expect(result.content).toBe(expectedContent);
		});
	});

	describe('loadPrompt caching with includes', () => {
		it('caches the resolved content so readFile is not called again on second load', async () => {
			const sharedContent = '## Core Principles\n\n1. SOLID\n';
			const rawContent = 'Intro\n\n{{include:_shared/core-principles.md}}';

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath === path.join(promptsDir, '04_code', 'cached-prompt.md')) {
					return '---frontmatter---';
				}
				if (filePath === path.join(promptsDir, '_shared', 'core-principles.md')) {
					return sharedContent;
				}
				throw new FileNotFoundError(filePath);
			});

			mockParseMarkdown.mockReturnValue({
				metadata: {
					id: 'code.cached-prompt',
					version: '1.0.0',
					category: 'code',
					name: 'Cached Prompt',
					description: 'A test prompt for cache verification'
				} as any,
				content: rawContent
			});

			// First load — reads prompt file and shared include
			const first = await loader.loadPrompt('code.cached-prompt');
			const callCountAfterFirst = mockReadFile.mock.calls.length;

			// Second load — should hit cache, no additional readFile calls
			const second = await loader.loadPrompt('code.cached-prompt');

			expect(first.content).toBe(second.content);
			expect(mockReadFile.mock.calls.length).toBe(callCountAfterFirst);
		});
	});
});
