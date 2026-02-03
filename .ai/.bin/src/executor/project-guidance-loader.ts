/**
 * Project Guidance Loader - Loads high-level guidance files for AI agents
 *
 * This module searches for and loads high-level guidance files commonly used
 * in AI-assisted coding projects (AGENTS.md, CLAUDE.md, etc.) to ensure
 * all AI commands follow project-specific guidelines.
 *
 * IMPORTANT: This module distinguishes between:
 * - GUIDANCE FILES (AGENTS.md, CLAUDE.md, etc.) - Always loaded, instruct AI behaviour
 * - PROJECT KNOWLEDGE (knowledge-base/*) - Selectively loaded per command to save tokens
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getLogger } from 'output/logger';
import { getProcessingFeedback } from 'output/processing-feedback';
import * as path from 'path';
import { dirExists, fileExists, getAIRoot, readFile } from 'utils/file-utils';

interface GuidanceFile {
	content: string;
	filename: string;
}

interface KnowledgeFile {
	content: string;
	filename: string;
}

/**
 * Configuration for guidance file patterns
 * These are common high-level guidance files used in AI-assisted coding
 */
const GUIDANCE_FILE_PATTERNS = [
	// Primary guidance files (in priority order)
	'AGENTS.md',
	'CLAUDE.md',
	'COPILOT.md',
	'AI-GUIDELINES.md',
	'AI-INSTRUCTIONS.md',
	'.cursorrules',
	'.github/copilot-instructions.md'
] as const;

/**
 * Cache for loaded guidance content
 * Key: project root path
 * Value: combined guidance content or null if no guidance files found
 */
const guidanceCache = new Map<string, null | string>();

/**
 * Get the project root directory (parent of .ai directory)
 */
export function getProjectRoot(): string {
	const aiRoot = getAIRoot();
	return path.dirname(aiRoot);
}

/**
 * Load a single guidance file if it exists
 */
async function loadGuidanceFile(
	filePath: string,
	displayName: string,
	logger: ReturnType<typeof getLogger>
): Promise<GuidanceFile | null> {
	if (!fileExists(filePath)) {
		return null;
	}

	try {
		const content = await readFile(filePath);

		if (content.trim()) {
			logger.debug(`Loaded AI guidance file: ${displayName}`, {
				contentLength: content.length
			});
			return {
				content: content.trim(),
				filename: displayName
			};
		}
	} catch (error) {
		logger.warn(`Failed to read guidance file: ${displayName}`, {
			error: (error as Error).message
		});
	}

	return null;
}

/**
 * Load guidance files from the project root
 */
async function loadRootGuidanceFiles(
	projectRoot: string,
	logger: ReturnType<typeof getLogger>
): Promise<GuidanceFile[]> {
	const results: GuidanceFile[] = [];

	for (const pattern of GUIDANCE_FILE_PATTERNS) {
		const filePath = path.join(projectRoot, pattern);
		const guidance = await loadGuidanceFile(filePath, pattern, logger);

		if (guidance) {
			results.push(guidance);
		}
	}

	return results;
}

/**
 * Search for and load all guidance files in the project root
 * Returns combined content of all found guidance files
 *
 * NOTE: This only loads GUIDANCE files (AGENTS.md, CLAUDE.md, etc.)
 * Project knowledge from knowledge-base/ is loaded separately via loadProjectKnowledge()
 */
export async function loadProjectGuidance(): Promise<null | string> {
	const logger = getLogger();
	const projectRoot = getProjectRoot();

	// Check cache first
	if (guidanceCache.has(projectRoot)) {
		const cached = guidanceCache.get(projectRoot);

		if (cached !== undefined) {
			logger.debug('Using cached AI guidance', { projectRoot });

			// Show processing feedback indicating cache hit
			if (cached !== null) {
				const feedback = getProcessingFeedback();
				const color = getColorAdapter();
				feedback.showInfo(`${color.bold(color.white('AI guidance loaded'))}: ${color.dim('(cached)')}`);
			}

			return cached;
		}
	}

	logger.debug('Searching for AI guidance files', { projectRoot });

	// Load guidance from root only (not knowledge-base)
	const foundGuidance = await loadRootGuidanceFiles(projectRoot, logger);

	if (foundGuidance.length === 0) {
		logger.debug('No AI guidance files found', { projectRoot });
		guidanceCache.set(projectRoot, null);
		return null;
	}

	// Combine all guidance content with clear section headers
	const combinedGuidance = formatGuidanceContent(foundGuidance);

	// Cache the result
	guidanceCache.set(projectRoot, combinedGuidance);

	// Log the loaded guidance files
	const filePaths = foundGuidance.map((g) => path.join(projectRoot, g.filename));
	logger.info(`Loaded ${foundGuidance.length} AI guidance file(s)`, {
		files: foundGuidance.map((g) => g.filename),
		paths: filePaths
	});

	// Show processing feedback to the user
	const feedback = getProcessingFeedback();
	const color = getColorAdapter();
	for (const { filename } of foundGuidance) {
		const fullPath = path.join(projectRoot, filename);
		feedback.showInfo(`${color.bold(color.white('AI guidance loaded'))}: ${fullPath}`);
	}

	return combinedGuidance;
}

/**
 * Format guidance content from multiple files into a single coherent block
 */
function formatGuidanceContent(guidance: GuidanceFile[]): string {
	const sections: string[] = [];

	sections.push('## AI GUIDANCE (HIGH-LEVEL INSTRUCTIONS)');
	sections.push('');
	sections.push(
		'The following guidance comes from project-level configuration files. ' +
			'You MUST follow these instructions strictly, as they represent project-specific ' +
			'requirements, conventions, and best practices.'
	);
	sections.push('');

	for (const { content, filename } of guidance) {
		sections.push(`### From: ${filename}`);
		sections.push('');
		sections.push(content);
		sections.push('');
	}

	sections.push('---');
	sections.push('END OF AI GUIDANCE');
	sections.push('---');

	return sections.join('\n');
}

/**
 * Clear the guidance cache (useful for testing or when files change)
 */
export function clearGuidanceCache(): void {
	guidanceCache.clear();
	knowledgeCache.clear();
}

/**
 * Cache for loaded knowledge content
 * Key: comma-separated list of requested files
 * Value: combined knowledge content or null if no files found
 */
const knowledgeCache = new Map<string, null | string>();

/**
 * Load a single knowledge file if it exists
 */
async function loadKnowledgeFile(
	filePath: string,
	displayName: string,
	logger: ReturnType<typeof getLogger>
): Promise<KnowledgeFile | null> {
	if (!fileExists(filePath)) {
		logger.debug(`Knowledge file not found: ${displayName}`);
		return null;
	}

	try {
		const content = await readFile(filePath);

		if (content.trim()) {
			logger.debug(`Loaded knowledge file: ${displayName}`, {
				contentLength: content.length
			});
			return {
				content: content.trim(),
				filename: displayName
			};
		}
	} catch (error) {
		logger.warn(`Failed to read knowledge file: ${displayName}`, {
			error: (error as Error).message
		});
	}

	return null;
}

/**
 * Load project knowledge files selectively based on command requirements
 *
 * @param knowledgeFiles - Array of filenames to load from knowledge-base/ directory
 *                         Examples: ['FUNCTIONAL.md', 'PRD.md', 'PLAN-*.md']
 *                         Supports glob patterns for dynamic file matching
 * @returns Combined content of requested knowledge files, or null if none found
 *
 * Usage:
 * - create-prd command: loadProjectKnowledge(['FUNCTIONAL.md'])
 * - create-backlog command: loadProjectKnowledge(['PRD.md'])
 * - implement command: loadProjectKnowledge(['PLAN-*.md']) // loads latest plan
 * - review-functional command: loadProjectKnowledge(['PRD.md', 'FUNCTIONAL.md'])
 */
export async function loadProjectKnowledge(knowledgeFiles: string[]): Promise<null | string> {
	const logger = getLogger();
	const projectRoot = getProjectRoot();
	const knowledgeBasePath = path.join(projectRoot, 'knowledge-base');

	if (!knowledgeFiles || knowledgeFiles.length === 0) {
		logger.debug('No knowledge files requested');
		return null;
	}

	if (!dirExists(knowledgeBasePath)) {
		logger.debug('Knowledge base directory not found', { path: knowledgeBasePath });
		return null;
	}

	// Check cache
	const cacheKey = [...knowledgeFiles].sort().join(',');
	const cached = getCachedKnowledge(cacheKey, knowledgeFiles, logger);
	if (cached !== undefined) {
		return cached;
	}

	// Load knowledge files
	logger.debug('Loading project knowledge files', { requestedFiles: knowledgeFiles });
	const loadedKnowledge = await loadAllKnowledgeFiles(knowledgeBasePath, knowledgeFiles, logger);

	if (loadedKnowledge.length === 0) {
		logger.debug('No knowledge files found', { requestedFiles: knowledgeFiles });
		knowledgeCache.set(cacheKey, null);
		return null;
	}

	// Combine and cache
	const combinedKnowledge = formatKnowledgeContent(loadedKnowledge);
	knowledgeCache.set(cacheKey, combinedKnowledge);

	// Log and display feedback
	displayLoadedKnowledgeFeedback(loadedKnowledge, projectRoot, logger);

	return combinedKnowledge;
}

/**
 * Get cached knowledge if available
 */
function getCachedKnowledge(
	cacheKey: string,
	knowledgeFiles: string[],
	logger: ReturnType<typeof getLogger>
): null | string | undefined {
	if (!knowledgeCache.has(cacheKey)) {
		return undefined;
	}

	const cached = knowledgeCache.get(cacheKey);
	if (cached === undefined) {
		return undefined;
	}

	logger.debug('Using cached project knowledge', { files: knowledgeFiles });

	if (cached !== null) {
		const feedback = getProcessingFeedback();
		const color = getColorAdapter();
		const fileList = knowledgeFiles.join(', ');
		feedback.showInfo(`${color.bold(color.cyan('Project knowledge loaded'))}: ${fileList} ${color.dim('(cached)')}`);
	}

	return cached;
}

/**
 * Load all knowledge files from patterns
 */
async function loadAllKnowledgeFiles(
	knowledgeBasePath: string,
	knowledgeFiles: string[],
	logger: ReturnType<typeof getLogger>
): Promise<KnowledgeFile[]> {
	const loadedKnowledge: KnowledgeFile[] = [];

	for (const filePattern of knowledgeFiles) {
		const files = await loadKnowledgePattern(knowledgeBasePath, filePattern, logger);
		loadedKnowledge.push(...files);
	}

	return loadedKnowledge;
}

/**
 * Load knowledge files matching a pattern (glob or direct)
 */
async function loadKnowledgePattern(
	knowledgeBasePath: string,
	filePattern: string,
	logger: ReturnType<typeof getLogger>
): Promise<KnowledgeFile[]> {
	const results: KnowledgeFile[] = [];

	if (filePattern.includes('*')) {
		const matchedFiles = await resolveGlobPattern(knowledgeBasePath, filePattern, logger);
		for (const matchedFile of matchedFiles) {
			const filePath = path.join(knowledgeBasePath, matchedFile);
			const knowledge = await loadKnowledgeFile(filePath, `knowledge-base/${matchedFile}`, logger);
			if (knowledge) {
				results.push(knowledge);
			}
		}
	} else {
		const filePath = path.join(knowledgeBasePath, filePattern);
		const knowledge = await loadKnowledgeFile(filePath, `knowledge-base/${filePattern}`, logger);
		if (knowledge) {
			results.push(knowledge);
		}
	}

	return results;
}

/**
 * Display feedback for loaded knowledge files
 */
function displayLoadedKnowledgeFeedback(
	loadedKnowledge: KnowledgeFile[],
	projectRoot: string,
	logger: ReturnType<typeof getLogger>
): void {
	logger.info(`Loaded ${loadedKnowledge.length} project knowledge file(s)`, {
		files: loadedKnowledge.map((k) => k.filename)
	});

	const feedback = getProcessingFeedback();
	const color = getColorAdapter();
	for (const { filename } of loadedKnowledge) {
		const fullPath = path.join(projectRoot, filename);
		feedback.showInfo(`${color.bold(color.cyan('Project knowledge loaded'))}: ${fullPath}`);
	}
}

/**
 * Resolve glob pattern to matching files in knowledge-base directory
 * Returns files sorted by modification time (most recent first) for patterns like PLAN-*.md
 */
async function resolveGlobPattern(
	knowledgeBasePath: string,
	pattern: string,
	logger: ReturnType<typeof getLogger>
): Promise<string[]> {
	const fs = await import('fs');
	const files: string[] = [];

	try {
		const allFiles = fs.readdirSync(knowledgeBasePath);

		// Convert glob pattern to regex
		const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
		const regex = new RegExp(`^${regexPattern}$`);

		for (const file of allFiles) {
			if (regex.test(file)) {
				files.push(file);
			}
		}

		// Sort by modification time (most recent first) for patterns like PLAN-*.md
		if (files.length > 1) {
			files.sort((a, b) => {
				const statA = fs.statSync(path.join(knowledgeBasePath, a));
				const statB = fs.statSync(path.join(knowledgeBasePath, b));
				return statB.mtimeMs - statA.mtimeMs;
			});
		}

		logger.debug(`Resolved glob pattern "${pattern}" to ${files.length} file(s)`, { files });
	} catch (error) {
		logger.warn(`Failed to resolve glob pattern: ${pattern}`, {
			error: (error as Error).message
		});
	}

	return files;
}

/**
 * Format knowledge content from multiple files into a single coherent block
 */
function formatKnowledgeContent(knowledge: KnowledgeFile[]): string {
	const sections: string[] = [];

	sections.push('## PROJECT KNOWLEDGE (CONTEXT FOR THIS TASK)');
	sections.push('');
	sections.push(
		'The following content comes from project knowledge files. ' +
			'Use this information to understand project requirements, specifications, and plans.'
	);
	sections.push('');

	for (const { content, filename } of knowledge) {
		sections.push(`### From: ${filename}`);
		sections.push('');
		sections.push(content);
		sections.push('');
	}

	sections.push('---');
	sections.push('END OF PROJECT KNOWLEDGE');
	sections.push('---');

	return sections.join('\n');
}

/**
 * Clear only the knowledge cache (useful when knowledge files change)
 */
export function clearKnowledgeCache(): void {
	knowledgeCache.clear();
}

/**
 * Check if any guidance files exist in the project
 */
export function hasProjectGuidance(): boolean {
	const projectRoot = getProjectRoot();

	for (const pattern of GUIDANCE_FILE_PATTERNS) {
		const filePath = path.join(projectRoot, pattern);
		if (fileExists(filePath)) {
			return true;
		}
	}

	return false;
}

/**
 * Get the list of guidance file patterns being searched for
 */
export function getGuidanceFilePatterns(): readonly string[] {
	return GUIDANCE_FILE_PATTERNS;
}
