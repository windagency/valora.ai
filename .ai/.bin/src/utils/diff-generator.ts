/**
 * Unified Diff Generator
 *
 * Simple utility for generating unified diff format without external dependencies.
 * Used by dry-run mode to preview file changes.
 */

export interface DiffResult {
	/** Lines added */
	additions: number;
	/** Unified diff text */
	diffText: string;
	/** Lines deleted */
	deletions: number;
	/** Whether there are any changes */
	hasChanges: boolean;
}

interface DiffHunk {
	lines: string[];
	newLength: number;
	newStart: number;
	oldLength: number;
	oldStart: number;
}

/**
 * Generate a unified diff between old and new content
 *
 * @param oldContent - Original file content
 * @param newContent - New file content
 * @param filePath - Path to the file (for header)
 * @returns DiffResult with unified diff format
 */
export function generateUnifiedDiff(oldContent: string, newContent: string, filePath: string): DiffResult {
	// Handle empty content cases
	if (oldContent === newContent) {
		return {
			additions: 0,
			deletions: 0,
			diffText: '',
			hasChanges: false
		};
	}

	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');

	// Use Myers diff algorithm (simplified LCS approach)
	const diff = computeLineDiff(oldLines, newLines);

	// Generate hunks from diff operations
	const hunks = generateHunks(diff, oldLines, newLines);

	// Format as unified diff
	const diffText = formatUnifiedDiff(filePath, hunks);

	// Count additions and deletions using filter
	const additions = diff.filter((op) => op.type === 'add').length;
	const deletions = diff.filter((op) => op.type === 'remove').length;

	return {
		additions,
		deletions,
		diffText,
		hasChanges: true
	};
}

/**
 * Format a diff result for console display
 *
 * @param diff - The diff result to format
 * @param filePath - Path to the file
 * @returns Formatted string with ANSI colour codes
 */
export function formatDiffForDisplay(diff: DiffResult, filePath: string): string {
	if (!diff.hasChanges) {
		return `  ${filePath}: No changes`;
	}

	// Add the diff text with indentation
	// File headers (--- and +++) get 2-space indent, all other lines get 4-space indent
	const indentedDiffLines = diff.diffText.split('\n').map((line) => {
		const isFileHeader = line.startsWith('---') || line.startsWith('+++');
		return isFileHeader ? `  ${line}` : `    ${line}`;
	});

	return [`  ${filePath}`, `  +${diff.additions} -${diff.deletions}`, '', ...indentedDiffLines].join('\n');
}

/**
 * Create a diff result for a new file
 */
export function createNewFileDiff(content: string, filePath: string): DiffResult {
	const lines = content.split('\n');
	const additions = lines.length;

	const diffLines = [
		`--- /dev/null`,
		`+++ b/${filePath}`,
		`@@ -0,0 +1,${additions} @@`,
		...lines.map((line) => `+${line}`)
	];

	return {
		additions,
		deletions: 0,
		diffText: diffLines.join('\n'),
		hasChanges: true
	};
}

/**
 * Create a diff result for a deleted file
 */
export function createDeletedFileDiff(content: string, filePath: string): DiffResult {
	const lines = content.split('\n');
	const deletions = lines.length;

	const diffLines = [
		`--- a/${filePath}`,
		`+++ /dev/null`,
		`@@ -1,${deletions} +0,0 @@`,
		...lines.map((line) => `-${line}`)
	];

	return {
		additions: 0,
		deletions,
		diffText: diffLines.join('\n'),
		hasChanges: true
	};
}

// ============================================================================
// Internal diff computation
// ============================================================================

interface DiffOperation {
	newIndex?: number;
	oldIndex?: number;
	type: 'add' | 'equal' | 'remove';
}

/**
 * Compute line-by-line diff using a simplified LCS algorithm
 */
// eslint-disable-next-line complexity
function computeLineDiff(oldLines: string[], newLines: string[]): DiffOperation[] {
	const n = oldLines.length;
	const m = newLines.length;

	// Build LCS table
	const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const lcsRow = lcs[i];
			const lcsRowPrev = lcs[i - 1];
			if (!lcsRow || !lcsRowPrev) continue;

			if (oldLines[i - 1] === newLines[j - 1]) {
				lcsRow[j] = (lcsRowPrev[j - 1] ?? 0) + 1;
			} else {
				lcsRow[j] = Math.max(lcsRowPrev[j] ?? 0, lcsRow[j - 1] ?? 0);
			}
		}
	}

	// Backtrack to find diff operations
	const operations: DiffOperation[] = [];
	let i = n;
	let j = m;

	while (i > 0 || j > 0) {
		const lcsRow = lcs[i];
		const lcsRowPrev = lcs[i - 1];

		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			operations.unshift({ newIndex: j - 1, oldIndex: i - 1, type: 'equal' });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || (lcsRow?.[j - 1] ?? 0) >= (lcsRowPrev?.[j] ?? 0))) {
			operations.unshift({ newIndex: j - 1, type: 'add' });
			j--;
		} else {
			operations.unshift({ oldIndex: i - 1, type: 'remove' });
			i--;
		}
	}

	return operations;
}

/**
 * Generate hunks from diff operations with context lines
 */
// eslint-disable-next-line complexity
function generateHunks(operations: DiffOperation[], oldLines: string[], newLines: string[]): DiffHunk[] {
	const contextLines = 3;
	const hunks: DiffHunk[] = [];

	// Find regions with changes
	let currentHunk: DiffHunk | null = null;
	let lastChangeIndex = -1;

	for (let i = 0; i < operations.length; i++) {
		const op = operations[i];
		if (!op) continue;

		if (op.type !== 'equal') {
			// Start a new hunk or extend current one
			if (currentHunk === null || i - lastChangeIndex > contextLines * 2) {
				// Start new hunk
				if (currentHunk !== null) {
					// Finish previous hunk with trailing context
					addTrailingContext(currentHunk, operations, lastChangeIndex, oldLines, contextLines);
					hunks.push(currentHunk);
				}

				currentHunk = createHunk(operations, i, oldLines, contextLines);
			}

			// Add the change to current hunk
			if (op.type === 'remove' && op.oldIndex !== undefined) {
				currentHunk.lines.push(`-${oldLines[op.oldIndex] ?? ''}`);
				currentHunk.oldLength++;
			} else if (op.type === 'add' && op.newIndex !== undefined) {
				currentHunk.lines.push(`+${newLines[op.newIndex] ?? ''}`);
				currentHunk.newLength++;
			}

			lastChangeIndex = i;
		} else if (currentHunk !== null && i - lastChangeIndex <= contextLines) {
			// Add context within a hunk
			if (op.oldIndex !== undefined) {
				currentHunk.lines.push(` ${oldLines[op.oldIndex] ?? ''}`);
				currentHunk.oldLength++;
				currentHunk.newLength++;
			}
		}
	}

	// Finish last hunk
	if (currentHunk !== null) {
		addTrailingContext(currentHunk, operations, lastChangeIndex, oldLines, contextLines);
		hunks.push(currentHunk);
	}

	return hunks;
}

/**
 * Create a new hunk with leading context
 */
// eslint-disable-next-line complexity
function createHunk(
	operations: DiffOperation[],
	changeIndex: number,
	oldLines: string[],
	contextLines: number
): DiffHunk {
	const hunk: DiffHunk = {
		lines: [],
		newLength: 0,
		newStart: 1,
		oldLength: 0,
		oldStart: 1
	};

	// Calculate start positions
	let oldPos = 0;
	let newPos = 0;
	for (let i = 0; i < changeIndex; i++) {
		const op = operations[i];
		if (!op) continue;
		if (op.type === 'equal') {
			oldPos++;
			newPos++;
		} else if (op.type === 'remove') {
			oldPos++;
		} else if (op.type === 'add') {
			newPos++;
		}
	}

	// Add leading context
	const contextStart = Math.max(0, changeIndex - contextLines);
	let contextOldPos = oldPos;
	let contextNewPos = newPos;

	// Recalculate position at context start
	for (let i = changeIndex - 1; i >= contextStart; i--) {
		const op = operations[i];
		if (!op) continue;
		if (op.type === 'equal') {
			contextOldPos--;
			contextNewPos--;
		}
	}

	hunk.oldStart = contextOldPos + 1;
	hunk.newStart = contextNewPos + 1;

	// Add leading context lines
	for (let i = contextStart; i < changeIndex; i++) {
		const op = operations[i];
		if (!op) continue;
		if (op.type === 'equal' && op.oldIndex !== undefined) {
			hunk.lines.push(` ${oldLines[op.oldIndex] ?? ''}`);
			hunk.oldLength++;
			hunk.newLength++;
		}
	}

	return hunk;
}

/**
 * Add trailing context to a hunk
 */
function addTrailingContext(
	hunk: DiffHunk,
	operations: DiffOperation[],
	lastChangeIndex: number,
	oldLines: string[],
	contextLines: number
): void {
	const contextEnd = Math.min(operations.length, lastChangeIndex + contextLines + 1);

	for (let i = lastChangeIndex + 1; i < contextEnd; i++) {
		const op = operations[i];
		if (!op) continue;
		if (op.type === 'equal' && op.oldIndex !== undefined) {
			hunk.lines.push(` ${oldLines[op.oldIndex] ?? ''}`);
			hunk.oldLength++;
			hunk.newLength++;
		}
	}
}

/**
 * Format hunks as unified diff text
 */
function formatUnifiedDiff(filePath: string, hunks: DiffHunk[]): string {
	if (hunks.length === 0) {
		return '';
	}

	const hunkLines = hunks.flatMap((hunk) => [
		`@@ -${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength} @@`,
		...hunk.lines
	]);

	return [`--- a/${filePath}`, `+++ b/${filePath}`, ...hunkLines].join('\n');
}
