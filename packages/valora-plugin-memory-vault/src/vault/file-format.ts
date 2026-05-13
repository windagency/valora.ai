import type { Edge, EdgeKind, MemoryEntry } from '@windagency/valora-plugin-api';

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Compute the canonical SHA-256 content hash for a memory entry's body.
 * Used by both the serialiser (to stamp the file with a fresh hash on every
 * write) and the parser (to detect drift between the on-disk hash and the
 * actual body, which signals an external edit — typically through Obsidian).
 */
export interface ParsedMemoryFile {
	entry: MemoryEntry;
	links: Edge[];
}

export function computeContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

// Matches [[targetId]] and [[targetId|kind]] — used with String.matchAll. The /g
// flag makes this regex stateful across direct .test() calls, so callers that
// need a per-call boolean check must use LINK_LINE_RE below instead. The alias
// group permits zero-or-more chars so a malformed `[[id|]]` (empty alias) still
// matches and falls through to the default `related` kind, rather than producing
// no link at all.
const LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

const KNOWN_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
	'co_accessed',
	'decays_from',
	'related',
	'supersedes'
]);

// Stateless line-level matcher for `extractContent`: matches a line that
// consists solely of one [[id|kind]] wikilink (with optional surrounding
// whitespace). No /g flag — safe to call repeatedly.
const LINK_LINE_RE = /^\s*\[\[[^\]|]+?(?:\|[^\]]+?)?\]\]\s*$/;

const FRONTMATTER_CLOSE_MARKER = '\n---\n';

/**
 * Parse `[[id|kind]]` and `[[id]]` wikilinks from a Markdown body.
 *
 * The alias position serves a dual purpose: Obsidian renders it as the link's
 * display text, and Valora parses it as a typed `EdgeKind`. Because users can
 * edit the alias in Obsidian — e.g. changing `[[abc|related]]` to a more
 * readable `[[abc|see also]]` — the parser cannot trust unknown values. Aliases
 * outside the {@link EdgeKind} enum default to `related` rather than being cast
 * blindly into the type system, where they would silently corrupt the in-memory
 * adjacency index.
 */
export function parseVaultLinks(fromId: string, body: string): Edge[] {
	const edges: Edge[] = [];
	for (const match of body.matchAll(LINK_RE)) {
		const toId = match[1]?.trim();
		const kindRaw = match[2]?.trim();
		if (!toId) continue;
		const kind = kindRaw && KNOWN_EDGE_KINDS.has(kindRaw as EdgeKind) ? (kindRaw as EdgeKind) : 'related';
		edges.push({ fromId, kind, toId });
	}
	return edges;
}

/**
 * Parse a memory vault Markdown file into an entry and its outgoing edges.
 * The `id` parameter is the file's ID (used to populate edge `fromId`).
 */
export function parseMemoryFile(content: string, id: string): ParsedMemoryFile {
	if (!content.startsWith('---\n')) return { entry: emptyEntry(id), links: [] };
	const closeIdx = content.indexOf(FRONTMATTER_CLOSE_MARKER, 4);
	if (closeIdx === -1) return { entry: emptyEntry(id), links: [] };

	const fm = parseFrontmatter(content.slice(4, closeIdx));
	const bodyRaw = content.slice(closeIdx + FRONTMATTER_CLOSE_MARKER.length);
	return { entry: buildEntry(fm, id, bodyRaw), links: parseVaultLinks(id, bodyRaw) };
}

function buildEntry(fm: Record<string, unknown>, id: string, bodyRaw: string): MemoryEntry {
	const now = new Date().toISOString();
	const content = extractContent(bodyRaw);
	const persistedHash = fm['content_hash'] as string | undefined;
	const actualHash = computeContentHash(content);
	// Drift is only meaningful when the file actually carried a hash. Legacy
	// pre-hash files leave the entry unflagged (we cannot verify what we never
	// stamped). Round-trips through serialiseMemoryFile always re-stamp.
	const embeddingStale = persistedHash !== undefined && persistedHash !== actualHash ? true : undefined;
	return {
		accessCount: fmNum(fm, 'access_count', 0),
		agentRole: fmStr(fm, 'agent_role', ''),
		category: fmStr(fm, 'category', 'episodic') as MemoryEntry['category'],
		coAccess: fm['co_access'] as Record<string, number> | undefined,
		confidence: fmStr(fm, 'confidence', 'observed') as MemoryEntry['confidence'],
		content,
		contentHash: persistedHash,
		createdAt: fmStr(fm, 'created_at', now),
		embeddingDim: fm['embedding_dim'] as number | undefined,
		embeddingModel: fm['embedding_model'] as string | undefined,
		embeddingStale,
		halfLifeDays: fmNum(fm, 'half_life_days', 7),
		id: fmStr(fm, 'id', id),
		isError: fmBool(fm, 'is_error', false),
		lastAccessedAt: fmStr(fm, 'last_accessed_at', now),
		relatedPaths: (fm['related_paths'] as string[] | undefined) ?? [],
		sessionId: fmStr(fm, 'session_id', ''),
		source: (fm['source'] as MemoryEntry['source'] | undefined) ?? { command: '' },
		supersededBy: fm['superseded_by'] as string | undefined,
		supersedes: fm['supersedes'] as string | undefined,
		tags: (fm['tags'] as string[] | undefined) ?? [],
		updatedAt: fmStr(fm, 'updated_at', now)
	};
}

function fmBool(fm: Record<string, unknown>, key: string, fallback: boolean): boolean {
	return (fm[key] as boolean | undefined) ?? fallback;
}

function fmNum(fm: Record<string, unknown>, key: string, fallback: number): number {
	return (fm[key] as number | undefined) ?? fallback;
}

function fmStr(fm: Record<string, unknown>, key: string, fallback: string): string {
	return (fm[key] as string | undefined) ?? fallback;
}

/** Serialise a memory entry + outgoing edges into vault Markdown format. */
export function serialiseMemoryFile(entry: MemoryEntry, links: Edge[]): string {
	// Always stamp a fresh content_hash matching the body being written. Any
	// `entry.contentHash` provided by the caller is intentionally ignored — the
	// on-disk hash is the truth of "what content was stored", and downstream
	// drift detection compares that hash to the actual body on the next read.
	const fm: Record<string, unknown> = {
		access_count: entry.accessCount,
		agent_role: entry.agentRole,
		category: entry.category,
		co_access: entry.coAccess,
		confidence: entry.confidence,
		content_hash: computeContentHash(entry.content),
		created_at: entry.createdAt,
		embedding_dim: entry.embeddingDim,
		embedding_model: entry.embeddingModel,
		half_life_days: entry.halfLifeDays,
		id: entry.id,
		is_error: entry.isError,
		last_accessed_at: entry.lastAccessedAt,
		related_paths: entry.relatedPaths,
		session_id: entry.sessionId,
		source: entry.source,
		tags: entry.tags,
		updated_at: entry.updatedAt
	};

	if (entry.supersedes !== undefined) fm['supersedes'] = entry.supersedes;
	if (entry.supersededBy !== undefined) fm['superseded_by'] = entry.supersededBy;

	const frontmatter = serialiseFrontmatter(fm);
	const linkLines = links.map((e) => `[[${e.toId}|${e.kind}]]`).join('\n');
	const body = linkLines ? `${entry.content}\n\n${linkLines}` : entry.content;

	return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/**
 * Build a `.tmp` sibling path that is unique per writer. Combining the process
 * PID with a monotonic counter prevents two writers (e.g. CLI + pipeline) from
 * trampling each other's tmp file before either has run `renameSync`.
 */
let tmpCounter = 0;
function buildTmpPath(filePath: string): string {
	tmpCounter += 1;
	return `${filePath}.${process.pid}.${tmpCounter}.tmp`;
}

/**
 * Write content to a file atomically: write to a unique `.tmp` sibling first,
 * then rename. Creates parent directories as needed. The tmp filename includes
 * the writing process PID and a counter so concurrent writers never collide
 * on the staging file.
 */
export function atomicWriteFile(filePath: string, content: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const tmpPath = buildTmpPath(filePath);
	writeFileSync(tmpPath, content, 'utf-8');
	renameSync(tmpPath, filePath);
}

/**
 * Write a Buffer (binary payload) atomically via tmp+rename. Counterpart to
 * `atomicWriteFile` for non-text data such as packed embedding vectors.
 */
export function atomicWriteBuffer(filePath: string, data: Buffer): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const tmpPath = buildTmpPath(filePath);
	writeFileSync(tmpPath, data);
	renameSync(tmpPath, filePath);
}

// — internal helpers —

function parseFrontmatter(block: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const line of block.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const colonIdx = trimmed.indexOf(': ');
		if (colonIdx === -1) continue;
		const key = trimmed.slice(0, colonIdx).trim();
		const valueStr = trimmed.slice(colonIdx + 2);
		try {
			result[key] = JSON.parse(valueStr);
		} catch {
			// skip malformed lines silently — treat as absent
		}
	}
	return result;
}

function serialiseFrontmatter(fields: Record<string, unknown>): string {
	return Object.entries(fields)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
		.join('\n');
}

/** Build a fully-defaulted MemoryEntry for files that fail to parse. */
function emptyEntry(id: string): MemoryEntry {
	const now = new Date().toISOString();
	return {
		accessCount: 0,
		agentRole: '',
		category: 'episodic',
		confidence: 'observed',
		content: '',
		createdAt: now,
		halfLifeDays: 7,
		id,
		isError: false,
		lastAccessedAt: now,
		relatedPaths: [],
		sessionId: '',
		source: { command: '' },
		tags: [],
		updatedAt: now
	};
}

function extractContent(rawBody: string): string {
	return rawBody
		.split('\n')
		.filter((line) => !LINK_LINE_RE.test(line))
		.join('\n')
		.trim();
}
