import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry } from '@windagency/valora-plugin-api';

import {
	atomicWriteBuffer,
	atomicWriteFile,
	parseMemoryFile,
	parseVaultLinks,
	serialiseMemoryFile
} from './file-format';

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
			embeddingDim: 768,
			embeddingModel: 'nomic-embed-text'
		};
		const md = serialiseMemoryFile(entry, []);
		const parsed = parseMemoryFile(md, entry.id);

		// contentHash is recomputed at serialisation from the actual body — see
		// the `content_hash drift detection` describe block for the rationale.
		expect(parsed.entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
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

	it('returns identical content when parsed twice in succession', () => {
		const links = [
			{ fromId: FIXTURE_ENTRY.id, kind: 'related' as const, toId: 'mem-xyz' },
			{ fromId: FIXTURE_ENTRY.id, kind: 'decays_from' as const, toId: 'mem-old' }
		];
		const md = serialiseMemoryFile(FIXTURE_ENTRY, links);

		const first = parseMemoryFile(md, FIXTURE_ENTRY.id);
		const second = parseMemoryFile(md, FIXTURE_ENTRY.id);

		expect(second.entry.content).toBe(first.entry.content);
		expect(first.entry.content).toBe(FIXTURE_ENTRY.content);
	});

	it('strips link lines from the body content even when called repeatedly', () => {
		const md = `---\nid: "mem-1"\ncategory: "episodic"\n---\n\nfirst paragraph\n\n[[mem-x|related]]\n[[mem-y|decays_from]]\n`;
		for (let i = 0; i < 5; i++) {
			const parsed = parseMemoryFile(md, 'mem-1');
			expect(parsed.entry.content).toBe('first paragraph');
		}
	});
});

describe('content_hash drift detection', () => {
	it('serialiseMemoryFile always emits a content_hash matching the current body', () => {
		const md = serialiseMemoryFile({ ...FIXTURE_ENTRY, content: 'hello' }, []);
		const parsed = parseMemoryFile(md, FIXTURE_ENTRY.id);
		expect(parsed.entry.contentHash).toBeDefined();
		expect(parsed.entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(parsed.entry.embeddingStale).toBeFalsy();
	});

	it('round-trip through serialise → parse leaves the entry not stale', () => {
		const md = serialiseMemoryFile(FIXTURE_ENTRY, []);
		const parsed = parseMemoryFile(md, FIXTURE_ENTRY.id);
		expect(parsed.entry.embeddingStale).toBeFalsy();
	});

	it('flags an entry as embeddingStale when the body has been edited but content_hash is unchanged', () => {
		const md = serialiseMemoryFile({ ...FIXTURE_ENTRY, content: 'original body' }, []);
		// Simulate a user editing the body via Obsidian: replace the content but keep the original hash in frontmatter.
		const edited = md.replace('original body', 'user edited this in obsidian');
		const parsed = parseMemoryFile(edited, FIXTURE_ENTRY.id);
		expect(parsed.entry.embeddingStale).toBe(true);
	});

	it('does not flag stale when frontmatter has no content_hash (legacy / pre-hash entries)', () => {
		// A file with no content_hash field (manually written) cannot be verified — leave it unflagged.
		const md = `---\nid: "mem-legacy"\ncategory: "episodic"\nconfidence: "observed"\ncontent_hash: undefined\n---\n\nlegacy body\n`;
		const parsed = parseMemoryFile(md.replace('content_hash: undefined\n', ''), 'mem-legacy');
		expect(parsed.entry.embeddingStale).toBeFalsy();
	});

	it('serialiseMemoryFile recomputes the hash even when the entry already has a stale contentHash field', () => {
		// If a caller passes an entry with a contentHash that doesn't match its content,
		// serialise must recompute (so on-disk files always reflect the body that was written).
		const entry = { ...FIXTURE_ENTRY, content: 'fresh content', contentHash: 'stale-hash-from-elsewhere' };
		const md = serialiseMemoryFile(entry, []);
		const parsed = parseMemoryFile(md, entry.id);
		expect(parsed.entry.embeddingStale).toBeFalsy();
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

	it('preserves all valid EdgeKind values verbatim', () => {
		const body = '[[a|related]]\n[[b|supersedes]]\n[[c|decays_from]]\n[[d|co_accessed]]';
		const kinds = parseVaultLinks('mem-source', body).map((e) => e.kind);
		expect(kinds).toEqual(['related', 'supersedes', 'decays_from', 'co_accessed']);
	});

	it('defaults to "related" when the alias is not a known EdgeKind (e.g. user-edited via Obsidian)', () => {
		// A user editing the wikilink alias in Obsidian must not silently corrupt the typed-edge metadata.
		const links = parseVaultLinks('mem-source', '[[mem-xyz|see also]]');
		expect(links).toEqual([{ fromId: 'mem-source', kind: 'related', toId: 'mem-xyz' }]);
	});

	it('defaults to "related" when the alias is empty string', () => {
		const links = parseVaultLinks('mem-source', '[[mem-xyz|]]');
		expect(links).toEqual([{ fromId: 'mem-source', kind: 'related', toId: 'mem-xyz' }]);
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

	it('does not consume a pre-existing `<path>.tmp` left by another writer', () => {
		// Models the multi-process race: writer A creates `<path>.tmp` and pauses;
		// writer B must not overwrite that file with its own content (which would
		// otherwise be renamed into A's target slot, corrupting A's result).
		const filePath = path.join(tmpDir, 'shared.md');
		const sharedTmp = `${filePath}.tmp`;
		fs.writeFileSync(sharedTmp, 'OTHER_WRITER_PAYLOAD');

		atomicWriteFile(filePath, 'OUR_CONTENT');

		expect(fs.readFileSync(filePath, 'utf-8')).toBe('OUR_CONTENT');
		expect(fs.existsSync(sharedTmp)).toBe(true);
		expect(fs.readFileSync(sharedTmp, 'utf-8')).toBe('OTHER_WRITER_PAYLOAD');
	});
});

describe('atomicWriteBuffer', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vault-buffer-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('round-trips a Float32Array-backed buffer byte-for-byte', () => {
		const filePath = path.join(tmpDir, 'vectors.bin');
		const data = new Float32Array([1, -1, 0.5, 0.25]);
		const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		atomicWriteBuffer(filePath, buffer);
		const read = fs.readFileSync(filePath);
		expect(read.length).toBe(buffer.length);
		expect(read.equals(buffer)).toBe(true);
	});

	it('leaves no .tmp file after a successful write', () => {
		const filePath = path.join(tmpDir, 'data.bin');
		atomicWriteBuffer(filePath, Buffer.from([0x01, 0x02, 0x03]));
		const files = fs.readdirSync(tmpDir);
		expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
	});

	it('creates parent directories if they do not exist', () => {
		const filePath = path.join(tmpDir, 'sub', 'dir', 'data.bin');
		atomicWriteBuffer(filePath, Buffer.from([0xff]));
		expect(fs.existsSync(filePath)).toBe(true);
	});
});
