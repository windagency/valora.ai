import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, EdgeKind, MemoryEntry } from 'types/memory.types';

export interface ParsedMemoryFile {
	entry: MemoryEntry;
	links: Edge[];
}

// Matches [[targetId]] and [[targetId|kind]]
const LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

const FRONTMATTER_CLOSE_MARKER = '\n---\n';

/** Parse `[[id|kind]]` and `[[id]]` wikilinks from a Markdown body. */
export function parseVaultLinks(fromId: string, body: string): Edge[] {
	const edges: Edge[] = [];
	for (const match of body.matchAll(LINK_RE)) {
		const toId = match[1]?.trim();
		const kindRaw = match[2]?.trim();
		if (!toId) continue;
		edges.push({ fromId, kind: (kindRaw ?? 'related') as EdgeKind, toId });
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
	return {
		accessCount: fmNum(fm, 'access_count', 0),
		agentRole: fmStr(fm, 'agent_role', ''),
		category: fmStr(fm, 'category', 'episodic') as MemoryEntry['category'],
		coAccess: fm['co_access'] as Record<string, number> | undefined,
		confidence: fmStr(fm, 'confidence', 'observed') as MemoryEntry['confidence'],
		content: extractContent(bodyRaw),
		contentHash: fm['content_hash'] as string | undefined,
		createdAt: fmStr(fm, 'created_at', now),
		embeddingDim: fm['embedding_dim'] as number | undefined,
		embeddingModel: fm['embedding_model'] as string | undefined,
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
	const fm: Record<string, unknown> = {
		access_count: entry.accessCount,
		agent_role: entry.agentRole,
		category: entry.category,
		co_access: entry.coAccess,
		confidence: entry.confidence,
		content_hash: entry.contentHash,
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
 * Write content to a file atomically: write to a `.tmp` sibling first, then rename.
 * Creates parent directories as needed.
 */
export function atomicWriteFile(filePath: string, content: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	writeFileSync(tmpPath, content, 'utf-8');
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

/** Strip link lines from body to recover pure content. */
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
		.filter((line) => !LINK_RE.test(line))
		.join('\n')
		.trim();
}
