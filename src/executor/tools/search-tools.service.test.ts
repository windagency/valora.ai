/**
 * Tests for SearchToolsService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchToolsService } from './search-tools.service';

const mockExecute = vi.fn();
vi.mock('utils/safe-exec', () => ({
	SafeExecutor: {
		execute: (...args: unknown[]) => mockExecute(...args)
	}
}));

function queueResult(stdout: string): void {
	mockExecute.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout });
}

function queueError(message = 'Command failed with exit code 1: no matches'): void {
	mockExecute.mockRejectedValueOnce(new Error(message));
}

describe('SearchToolsService', () => {
	let service: SearchToolsService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new SearchToolsService('/workspace');
	});

	describe('executeGlobSearch', () => {
		it('passes the pattern as a literal array element to fd after a "--" separator, with no shell involved', async () => {
			// A pattern containing shell metacharacters must not be able to break
			// out of a constructed command string, because there is no shell
			// command being constructed at all.
			queueResult('src/foo.ts\nsrc/bar.ts\n');

			await service.executeGlobSearch({ pattern: 'foo" ; touch /tmp/poc ; echo "*.ts' });

			const [command, args] = mockExecute.mock.calls[0]!;
			expect(command).toBe('fd');
			expect(args).toContain('--glob');
			const dashDashIndex = (args as string[]).indexOf('--');
			expect(dashDashIndex).toBeGreaterThanOrEqual(0);
			expect((args as string[])[dashDashIndex + 1]).toBe('foo" ; touch /tmp/poc ; echo "*.ts');
		});

		it('places "--" immediately before a pattern starting with "-", so fd cannot reinterpret it as its own flag', async () => {
			// Argument injection is a distinct primitive from shell injection —
			// array-form spawn alone doesn't stop the invoked binary itself from
			// parsing a leading "-" value as one of its own flags. "--glob" is
			// fd's own mode-switch flag (a boolean, not value-taking) — the
			// pattern is fd's own positional argument, so it must come after a
			// "--" end-of-options marker, not be "=" -bound to --glob (fd rejects
			// that form entirely, since --glob takes no value).
			queueResult('src/foo.ts\n');

			await service.executeGlobSearch({ pattern: '-rf' });

			const [command, args] = mockExecute.mock.calls[0]!;
			expect(command).toBe('fd');
			expect(args).toContain('--glob');
			const dashDashIndex = (args as string[]).indexOf('--');
			expect(dashDashIndex).toBeGreaterThanOrEqual(0);
			expect((args as string[])[dashDashIndex + 1]).toBe('-rf');
		});

		it('returns fd results when fd succeeds', async () => {
			queueResult('src/foo.ts\nsrc/bar.ts\n');

			const result = await service.executeGlobSearch({ pattern: '*.ts' });

			expect(result).toBe('src/foo.ts\nsrc/bar.ts');
		});

		it('falls back to find (array-form) when fd fails', async () => {
			queueError();
			queueResult('./src/foo.ts\n');

			const result = await service.executeGlobSearch({ pattern: '*.ts' });

			expect(mockExecute).toHaveBeenNthCalledWith(1, 'fd', expect.any(Array), expect.anything());
			expect(mockExecute).toHaveBeenNthCalledWith(
				2,
				'find',
				expect.arrayContaining(['-path', '*.ts']),
				expect.anything()
			);
			expect(result).toBe('./src/foo.ts');
		});

		it('returns a friendly message when no files match', async () => {
			queueResult('');

			const result = await service.executeGlobSearch({ pattern: 'nonexistent-*.xyz' });

			expect(result).toBe('No files found matching pattern');
		});

		it('returns a friendly message when both fd and find fail', async () => {
			queueError();
			queueError();

			const result = await service.executeGlobSearch({ pattern: '*.ts' });

			expect(result).toBe('No files found matching pattern');
		});

		it('requires a pattern argument', async () => {
			const result = await service.executeGlobSearch({});
			expect(result).toContain('requires pattern argument');
			expect(mockExecute).not.toHaveBeenCalled();
		});
	});

	describe('executeGrep', () => {
		it('passes the pattern and path as literal array elements to rg, with no shell involved', async () => {
			queueResult('src/foo.ts:1:match\n');

			await service.executeGrep({ path: 'src', pattern: 'foo" ; touch /tmp/poc ; echo "' });

			expect(mockExecute).toHaveBeenCalledWith(
				'rg',
				expect.arrayContaining(['foo" ; touch /tmp/poc ; echo "', 'src']),
				expect.anything()
			);
		});

		it('places "--" immediately before the pattern in the rg call, so rg cannot reinterpret a "-"-led pattern as its own flag', async () => {
			// e.g. rg's own --pre=COMMAND flag spawns COMMAND per matched file —
			// a pattern of "--pre=/tmp/evil.sh" would be arbitrary command
			// execution via an ordinary grep tool call with zero shell
			// metacharacters, unless "--" marks the end of rg's own options
			// first. "--" also protects `path`, which follows pattern in argv.
			queueResult('src/foo.ts:1:match\n');

			await service.executeGrep({ path: 'src', pattern: '--pre=/tmp/evil.sh' });

			const [, args] = mockExecute.mock.calls[0]!;
			const dashDashIndex = (args as string[]).indexOf('--');
			expect(dashDashIndex).toBeGreaterThanOrEqual(0);
			expect((args as string[])[dashDashIndex + 1]).toBe('--pre=/tmp/evil.sh');
			expect((args as string[])[dashDashIndex + 2]).toBe('src');
		});

		it('returns rg results when rg succeeds', async () => {
			queueResult('src/foo.ts:1:match\n');

			const result = await service.executeGrep({ pattern: 'match' });

			expect(result).toBe('src/foo.ts:1:match');
		});

		it('falls back to grep (array-form) when rg fails', async () => {
			queueError();
			queueResult('src/foo.ts:1:match\n');

			const result = await service.executeGrep({ pattern: 'match' });

			expect(mockExecute).toHaveBeenNthCalledWith(1, 'rg', expect.any(Array), expect.anything());
			expect(mockExecute).toHaveBeenNthCalledWith(
				2,
				'grep',
				expect.arrayContaining(['-rn', 'match', '.']),
				expect.anything()
			);
			expect(result).toBe('src/foo.ts:1:match');
		});

		it('places "--" immediately before the pattern in the grep fallback call, so grep cannot reinterpret a "-"-led pattern as its own flag', async () => {
			// GNU grep's -f flag reads the NEXT argument as a patterns-file
			// instead of searching a directory — pattern="-f" would make grep
			// consume `path` as -f's value rather than a directory to search,
			// unless "--" marks the end of grep's own options first.
			queueError();
			queueResult('src/foo.ts:1:match\n');

			await service.executeGrep({ path: 'src', pattern: '-f' });

			const [, args] = mockExecute.mock.calls[1]!;
			const dashDashIndex = (args as string[]).indexOf('--');
			expect(dashDashIndex).toBeGreaterThanOrEqual(0);
			expect((args as string[])[dashDashIndex + 1]).toBe('-f');
			expect((args as string[])[dashDashIndex + 2]).toBe('src');
		});

		it('returns a friendly message when no matches are found (both tools fail)', async () => {
			queueError();
			queueError();

			const result = await service.executeGrep({ pattern: 'nonexistent' });

			expect(result).toBe('No matches found');
		});

		it('truncates output at MAX_GREP_OUTPUT_LINES and appends a notice', async () => {
			const lines = Array.from({ length: 250 }, (_, i) => `src/file${i}.ts:1:match`);
			queueResult(lines.join('\n') + '\n');

			const result = await service.executeGrep({ pattern: 'match' });

			const resultLines = result.split('\n');
			expect(resultLines[0]).toBe('src/file0.ts:1:match');
			expect(result).toContain('Results limited to');
		});

		it('requires a pattern argument', async () => {
			const result = await service.executeGrep({});
			expect(result).toContain('requires pattern argument');
			expect(mockExecute).not.toHaveBeenCalled();
		});
	});
});
