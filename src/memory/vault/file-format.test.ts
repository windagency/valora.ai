import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry } from 'types/memory.types';

import { atomicWriteFile, parseMemoryFile, parseVaultLinks, serialiseMemoryFile } from './file-format';

const FIXTURE_ENTRY: MemoryEntry = {
	accessCount: 3,
	agentRole: 'implementer',
	category: 'episodic',
	confidence: 'verified',
	content: 'pnpm lockfile drifted after bumping workspace deps',
	createdAt: '2026-04-27T08:00:00.000Z',
	halfLifeDays: 7,
	id: 'mem-abc123',
	isError: false,
	lastAccessedAt: '2026-04-27T09:00:00.000Z',
	relatedPaths: ['pnpm-lock.yaml', 'package.json'],
	sessionId: 'ses-xyz',
	source: { command: 'implement', label: 'lockfile-drift', phase: 'assert' },
	tags: ['pnpm', 'lockfile'],
	updatedAt: '2026-04-27T08:00:00.000Z'
};

describe('serialiseMemoryFile / parseMemoryFile', () => {
	it('round-trips all core fields without loss', () => {
		const md = serialiseMemoryFile(FIXTURE_ENTRY, []);
		const parsed = parseMemoryFile(md, 'mem-abc123');

		expect(parsed.entry.id).toBe(FIXTURE_ENTRY.id);
		expect(parsed.entry.category).toBe(FIXTURE_ENTRY.category);
		expect(parsed.entry.confidence).toBe(FIXTURE_ENTRY.confidence);
		expect(parsed.entry.tags).toEqual(FIXTURE_ENTRY.tags);
		expect(parsed.entry.relatedPaths).toEqual(FIXTURE_ENTRY.relatedPaths);
		expect(parsed.entry.halfLifeDays).toBe(FIXTURE_ENTRY.halfLifeDays);
		expect(parsed.entry.accessCount).toBe(FIXTURE_ENTRY.accessCount);
		expect(parsed.entry.agentRole).toBe(FIXTURE_ENTRY.agentRole);
		expect(parsed.entry.content).toBe(FIXTURE_ENTRY.content);
		expect(parsed.entry.source).toEqual(FIXTURE_ENTRY.source);
	});

	it('round-trips optional vault fields when present', () => {
		const entry: MemoryEntry = {
			...FIXTURE_ENTRY,
			coAccess: { 'mem-other': 2 },
			contentHash: 'sha256:abc',
			embeddingDim: 768,
			embeddingModel: 'nomic-embed-text'
		};
		const md = serialiseMemoryFile(entry, []);
		const parsed = parseMemoryFile(md, entry.id);

		expect(parsed.entry.contentHash).toBe('sha256:abc');
		expect(parsed.entry.embeddingModel).toBe('nomic-embed-text');
		expect(parsed.entry.embeddingDim).toBe(768);
		expect(parsed.entry.coAccess).toEqual({ 'mem-other': 2 });
	});

	it('produces a file that starts with a frontmatter block', () => {
		const md = serialiseMemoryFile(FIXTURE_ENTRY, []);
		expect(md.startsWith('---\n')).toBe(true);
		expect(md).toContain('\n---\n');
	});

	it('puts the content in the body, not in frontmatter', () => {
		const md = serialiseMemoryFile(FIXTURE_ENTRY, []);
		const [, body] = md.split('\n---\n').slice(1);
		// body is the second segment after frontmatter close
		const afterFrontmatter = md.split('\n---\n').slice(1).join('\n---\n');
		expect(afterFrontmatter.trim()).toContain(FIXTURE_ENTRY.content);
	});
});

describe('parseVaultLinks', () => {
	it('extracts typed [[id|kind]] links from body', () => {
		const body = 'Some text\n[[mem-xyz|related]]\n[[mem-abc|supersedes]]';
		const links = parseVaultLinks('mem-source', body);
		expect(links).toContainEqual({ fromId: 'mem-source', kind: 'related', toId: 'mem-xyz' });
		expect(links).toContainEqual({ fromId: 'mem-source', kind: 'supersedes', toId: 'mem-abc' });
	});

	it('defaults kind to "related" for plain [[id]] links', () => {
		const links = parseVaultLinks('mem-source', '[[mem-target]]');
		expect(links).toContainEqual({ fromId: 'mem-source', kind: 'related', toId: 'mem-target' });
	});

	it('returns an empty array when body has no links', () => {
		expect(parseVaultLinks('mem-source', 'No links here.')).toHaveLength(0);
	});

	it('serialises links into the file body and parses them back', () => {
		const links = [
			{ fromId: 'mem-abc123', kind: 'related' as const, toId: 'mem-xyz' },
			{ fromId: 'mem-abc123', kind: 'decays_from' as const, toId: 'mem-old' }
		];
		const md = serialiseMemoryFile(FIXTURE_ENTRY, links);
		const parsed = parseMemoryFile(md, FIXTURE_ENTRY.id);
		expect(parsed.links).toContainEqual(expect.objectContaining({ kind: 'related', toId: 'mem-xyz' }));
		expect(parsed.links).toContainEqual(expect.objectContaining({ kind: 'decays_from', toId: 'mem-old' }));
	});
});

describe('atomicWriteFile', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vault-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('writes the file at the specified path', async () => {
		const filePath = path.join(tmpDir, 'test.md');
		await atomicWriteFile(filePath, 'hello world');
		expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
	});

	it('leaves no .tmp file after a successful write', async () => {
		const filePath = path.join(tmpDir, 'test.md');
		await atomicWriteFile(filePath, 'content');
		const files = fs.readdirSync(tmpDir);
		expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
	});

	it('creates parent directories if they do not exist', async () => {
		const filePath = path.join(tmpDir, 'sub', 'dir', 'test.md');
		await atomicWriteFile(filePath, 'nested');
		expect(fs.readFileSync(filePath, 'utf-8')).toBe('nested');
	});
});
