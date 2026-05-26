import * as fs from 'node:fs';
import * as path from 'node:path';

import { CONCERN_PATTERNS, countConcernHits, extractImports } from './fingerprint.js';
import {
	type AuditConfig,
	type AuditReport,
	type ConcernCategory,
	type Severity,
	type SiblingGroup,
	type Violation
} from './scanner.types.js';

type SiblingData = { concernHits: Map<ConcernCategory, number>; fileCount: number; imports: Set<string> };

export async function scan(rootPath: string, config: AuditConfig): Promise<AuditReport> {
	const warnings: string[] = [];
	const parents = collectParentPaths(rootPath, config);

	const siblingGroups: SiblingGroup[] = parents
		.map((parentPath) => analyseParent(rootPath, parentPath, config, warnings))
		.filter((g): g is SiblingGroup => g !== undefined);

	const allViolations = siblingGroups.flatMap((g) => g.violations);

	return {
		depth: config.depth,
		rootPath,
		scannedAt: new Date().toISOString(),
		siblingGroups,
		summary: {
			highSeverity: allViolations.filter((v) => v.severity === 'high').length,
			lowSeverity: allViolations.filter((v) => v.severity === 'low').length,
			mediumSeverity: allViolations.filter((v) => v.severity === 'medium').length,
			...(parents.length === 0 && {
				note: `No directories with 2+ siblings found within depth ${config.depth} from ${rootPath}`
			}),
			totalViolations: allViolations.length
		},
		threshold: config.threshold,
		warnings
	};
}

function analyseParent(
	rootPath: string,
	parentPath: string,
	config: AuditConfig,
	warnings: string[]
): SiblingGroup | undefined {
	const siblings = getSiblingNames(parentPath, config.exclude);
	const siblingData = buildSiblingData(parentPath, siblings, config, warnings);
	const relParent = path.relative(rootPath, parentPath) || '.';

	const violations: Violation[] = [
		...detectConcernViolations(siblingData, config, relParent),
		...detectImportViolations(siblingData, config, relParent)
	];

	if (violations.length === 0) return undefined;
	return { parentPath: relParent, siblings, violations };
}

function buildSiblingData(
	parentPath: string,
	siblings: string[],
	config: AuditConfig,
	warnings: string[]
): Map<string, SiblingData> {
	const siblingData = new Map<string, SiblingData>();
	for (const sibling of siblings) {
		const { content, fileCount, warning } = readDirContents(path.join(parentPath, sibling));
		if (warning) warnings.push(warning);
		if (fileCount === 0) continue;
		const imports = extractImports(content);
		const concernHits = new Map<ConcernCategory, number>();
		for (const category of config.concerns) {
			concernHits.set(category, countConcernHits(content, CONCERN_PATTERNS[category]));
		}
		siblingData.set(sibling, { concernHits, fileCount, imports });
	}
	return siblingData;
}

function collectParentPaths(rootPath: string, config: AuditConfig): string[] {
	const parents: string[] = [];

	const recurse = (currentPath: string, currentDepth: number): void => {
		const siblings = getSiblingNames(currentPath, config.exclude);
		if (siblings.length >= 2) {
			parents.push(currentPath);
		}
		if (currentDepth < config.depth) {
			for (const sibling of siblings) {
				recurse(path.join(currentPath, sibling), currentDepth + 1);
			}
		}
	};

	recurse(rootPath, 0);
	return parents;
}

function computeSeverity(n: number, threshold: number): Severity {
	if (n >= threshold + 2) return 'high';
	if (n === threshold + 1) return 'medium';
	return 'low';
}

function detectConcernViolations(
	siblingData: Map<string, SiblingData>,
	config: AuditConfig,
	relParent: string
): Violation[] {
	const violations: Violation[] = [];
	for (const category of config.concerns) {
		const flagged = [...siblingData.entries()].filter(([, d]) => {
			const hits = d.concernHits.get(category) ?? 0;
			return hits / d.fileCount >= config.densityFloor;
		});
		if (flagged.length >= config.threshold) {
			violations.push({
				affectedSiblings: flagged.map(([name]) => name),
				concern: category,
				severity: computeSeverity(flagged.length, config.threshold),
				suggestedExtractionPath: `${relParent}/shared/${category}`,
				topKeywords: (CONCERN_PATTERNS[category] ?? []).slice(0, 3)
			});
		}
	}
	return violations;
}

function detectImportViolations(
	siblingData: Map<string, SiblingData>,
	config: AuditConfig,
	relParent: string
): Violation[] {
	const importCounts = new Map<string, string[]>();
	for (const [sibling, data] of siblingData) {
		for (const mod of data.imports) {
			const list = importCounts.get(mod) ?? [];
			list.push(sibling);
			importCounts.set(mod, list);
		}
	}
	const sharedModules = [...importCounts.entries()]
		.filter(([, names]) => names.length >= config.threshold)
		.map(([mod]) => mod);

	if (sharedModules.length === 0) return [];

	const affectedSiblings = [...new Set(sharedModules.flatMap((m) => importCounts.get(m) ?? []))];
	return [
		{
			affectedSiblings,
			concern: 'import',
			severity: computeSeverity(affectedSiblings.length, config.threshold),
			suggestedExtractionPath: `${relParent}/shared/import`,
			topKeywords: sharedModules.slice(0, 3)
		}
	];
}

function getSiblingNames(dirPath: string, exclude: string[]): string[] {
	try {
		return fs
			.readdirSync(dirPath, { withFileTypes: true })
			.filter((e) => e.isDirectory() && !matchesExclude(e.name, exclude))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

function matchesExclude(name: string, patterns: string[]): boolean {
	return patterns.some((p) => (p.startsWith('*') ? name.endsWith(p.slice(1)) : name === p));
}

function readDirContents(dirPath: string): { content: string; fileCount: number; warning?: string } {
	const parts: string[] = [];
	let fileCount = 0;

	const recurse = (p: string): string | undefined => {
		let warn: string | undefined;
		try {
			for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
				const full = path.join(p, entry.name);
				if (entry.isDirectory()) {
					warn ??= recurse(full);
				} else if (entry.isFile()) {
					try {
						parts.push(fs.readFileSync(full, 'utf-8'));
						fileCount++;
					} catch {
						/* skip unreadable file */
					}
				}
			}
		} catch (e) {
			return `Cannot read ${p}: ${String(e)}`;
		}
		return warn;
	};

	const warning = recurse(dirPath);
	return { content: parts.join('\n'), fileCount, warning };
}
