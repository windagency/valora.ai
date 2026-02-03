/**
 * Markdown parsing utilities
 */

/**
 * Extract code blocks from markdown
 */
export function extractCodeBlocks(markdown: string): Array<{
	code: string;
	language: string;
	startLine: number;
}> {
	const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
	const matches = Array.from(markdown.matchAll(codeBlockRegex));

	return matches.map((match) => {
		const language = match[1] ?? 'text';
		const code = match[2]?.trim() ?? '';
		const beforeMatch = markdown.substring(0, match.index);
		const startLine = (beforeMatch.match(/\n/g) ?? []).length + 1;

		return { code, language, startLine };
	});
}

/**
 * Extract headings from markdown
 */
export function extractHeadings(markdown: string): Array<{ level: number; line: number; text: string }> {
	const lines = markdown.split('\n');
	const headings: Array<{ level: number; line: number; text: string }> = [];

	lines.forEach((line, index) => {
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (match?.[1] && match[2]) {
			const hashes = match[1];
			const headingText = match[2];
			headings.push({
				level: hashes.length,
				line: index + 1,
				text: headingText.trim()
			});
		}
	});

	return headings;
}

/**
 * Extract sections by heading
 */
export function extractSections(markdown: string): Map<string, string> {
	const lines = markdown.split('\n');
	const sections = new Map<string, string>();
	let currentSection = '';
	let currentContent: string[] = [];

	lines.forEach((line) => {
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch?.[1]) {
			if (currentSection) {
				sections.set(currentSection, currentContent.join('\n').trim());
			}
			const sectionName = headingMatch[1];
			currentSection = sectionName.trim();
			currentContent = [];
		} else if (currentSection) {
			currentContent.push(line);
		}
	});

	if (currentSection) {
		sections.set(currentSection, currentContent.join('\n').trim());
	}

	return sections;
}

/**
 * Remove markdown formatting
 */
export function stripMarkdown(markdown: string): string {
	return markdown
		.replace(/^#{1,6}\s+/gm, '') // Remove headings
		.replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
		.replace(/\*(.+?)\*/g, '$1') // Remove italic
		.replace(/`(.+?)`/g, '$1') // Remove inline code
		.replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
		.replace(/```[\s\S]*?```/g, '') // Remove code blocks
		.trim();
}

/**
 * Convert markdown to plain text sections
 */
export function markdownToSections(markdown: string): Record<string, string> {
	const sections = extractSections(markdown);

	return Object.fromEntries(sections.entries());
}
