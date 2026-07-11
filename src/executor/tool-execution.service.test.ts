import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isExploratoryExitCode, ToolExecutionService } from './tool-execution.service';

describe('isExploratoryExitCode', () => {
	it('matches "which" command', () => {
		expect(isExploratoryExitCode('which tsc')).toBe(true);
		expect(isExploratoryExitCode('which astro && which tsc')).toBe(true);
	});

	it('matches "command -v"', () => {
		expect(isExploratoryExitCode('command -v node')).toBe(true);
	});

	it('matches "type" command', () => {
		expect(isExploratoryExitCode('type bash')).toBe(true);
	});

	it('matches "test" command', () => {
		expect(isExploratoryExitCode('test -d /some/path')).toBe(true);
		expect(isExploratoryExitCode('test -f package.json')).toBe(true);
	});

	it('matches "fd" command', () => {
		expect(isExploratoryExitCode('fd README.md')).toBe(true);
	});

	it('matches shell bracket syntax', () => {
		expect(isExploratoryExitCode('[ -d /some/path ]')).toBe(true);
		expect(isExploratoryExitCode('[[ -f package.json ]]')).toBe(true);
	});

	it('matches "cd" prefixed commands (directory probing)', () => {
		expect(isExploratoryExitCode('cd workspace && pwd')).toBe(true);
		expect(isExploratoryExitCode('cd /nonexistent && ls')).toBe(true);
	});

	it('handles leading whitespace', () => {
		expect(isExploratoryExitCode('  which node')).toBe(true);
		expect(isExploratoryExitCode('\ttest -d /foo')).toBe(true);
	});

	it('does not match non-exploratory commands', () => {
		expect(isExploratoryExitCode('npm install')).toBe(false);
		expect(isExploratoryExitCode('tsc --noEmit')).toBe(false);
		expect(isExploratoryExitCode('node script.js')).toBe(false);
		expect(isExploratoryExitCode('rm -rf dist')).toBe(false);
	});

	it('does not match rg/grep (handled separately by isNoMatchesExitCode)', () => {
		expect(isExploratoryExitCode('rg pattern')).toBe(false);
		expect(isExploratoryExitCode('grep -r foo .')).toBe(false);
	});

	it('does not match partial command names', () => {
		expect(isExploratoryExitCode('whichever thing')).toBe(false);
		expect(isExploratoryExitCode('testing something')).toBe(false);
		expect(isExploratoryExitCode('cdup something')).toBe(false);
	});
});

describe('ToolExecutionService — write/search_replace/delete_file path containment', () => {
	// resolvePath() previously returned an absolute LLM-supplied path
	// verbatim, and did naive string concatenation for relative paths with no
	// `..` normalization — validateAndResolvePath's only gate was
	// validateNotForbiddenPath's small `.valora/`/`data/` denylist, not a real
	// containment check. Any write/search_replace/delete_file tool call
	// (including one steered by indirect prompt injection from a tool
	// result, RAG source, or malicious repo content) could write/edit/delete
	// arbitrary files anywhere the process has permission to.
	let workingDir: string;
	let outsideDir: string;
	let service: ToolExecutionService;

	beforeEach(() => {
		workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-toolexec-'));
		outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-toolexec-outside-'));
		service = new ToolExecutionService(workingDir);
		// The idempotency store is disk-persisted and content-keyed — without
		// this, re-running this exact literal tool call across test runs
		// returns a stale cached result instead of actually re-executing.
		service.disableIdempotency();
	});

	afterEach(() => {
		fs.rmSync(workingDir, { force: true, recursive: true });
		fs.rmSync(outsideDir, { force: true, recursive: true });
	});

	it('blocks write to an absolute path outside the working directory', async () => {
		const target = path.join(outsideDir, 'pwned.txt');

		const result = await service.executeTool({
			arguments: { content: 'pwned', path: target },
			id: 'call-1',
			name: 'write'
		});

		expect(result.output).toMatch(/outside|forbidden|not allowed/i);
		expect(fs.existsSync(target)).toBe(false);
	});

	it('blocks write via ../ traversal escaping the working directory', async () => {
		const escapedName = `escaped-${Date.now()}.txt`;
		const relative = path.relative(workingDir, path.join(outsideDir, escapedName));

		const result = await service.executeTool({
			arguments: { content: 'pwned', path: relative },
			id: 'call-2',
			name: 'write'
		});

		expect(result.output).toMatch(/outside|forbidden|not allowed/i);
		expect(fs.existsSync(path.join(outsideDir, escapedName))).toBe(false);
	});

	it('still allows write to a path inside the working directory', async () => {
		const result = await service.executeTool({
			arguments: { content: 'hello', path: 'nested/file.txt' },
			id: 'call-3',
			name: 'write'
		});

		expect(result.output).toContain('Successfully wrote');
		expect(fs.readFileSync(path.join(workingDir, 'nested', 'file.txt'), 'utf-8')).toBe('hello');
	});

	it('blocks delete_file targeting an absolute path outside the working directory', async () => {
		const target = path.join(outsideDir, 'victim.txt');
		fs.writeFileSync(target, 'do not delete me');

		const result = await service.executeTool({
			arguments: { path: target },
			id: 'call-4',
			name: 'delete_file'
		});

		expect(result.output).toMatch(/outside|forbidden|not allowed/i);
		expect(fs.existsSync(target)).toBe(true);
	});

	it('blocks search_replace targeting an absolute path outside the working directory', async () => {
		const target = path.join(outsideDir, 'victim.txt');
		fs.writeFileSync(target, 'original content');

		const result = await service.executeTool({
			arguments: { new_str: 'pwned', old_str: 'original', path: target },
			id: 'call-5',
			name: 'search_replace'
		});

		expect(result.output).toMatch(/outside|forbidden|not allowed/i);
		expect(fs.readFileSync(target, 'utf-8')).toBe('original content');
	});
});
