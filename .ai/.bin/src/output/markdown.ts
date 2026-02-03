/**
 * Markdown rendering and formatting
 */

import { getBoxFormatter } from './box-formatter';
import { getColorAdapter } from './color-adapter.interface';

export class MarkdownRenderer {
	/**
	 * Render markdown to terminal with colors
	 */
	render(markdown: string): string {
		const color = getColorAdapter();
		let output = markdown;

		// Headers
		output = output.replace(/^# (.+)$/gm, (_, text) => color.getRawFn('bold.blue')(text));
		output = output.replace(/^## (.+)$/gm, (_, text) => color.getRawFn('bold.cyan')(text));
		output = output.replace(/^### (.+)$/gm, (_, text) => color.getRawFn('bold.green')(text));
		output = output.replace(/^#### (.+)$/gm, (_, text) => color.getRawFn('bold.yellow')(text));

		// Bold
		output = output.replace(/\*\*(.+?)\*\*/g, (_, text) => color.bold(text));

		// Italic
		output = output.replace(/\*(.+?)\*/g, (_, text) => color.italic(text));

		// Inline code
		output = output.replace(/`(.+?)`/g, (_, text) => color.getRawFn('bgGray.white')(` ${text} `));

		// Links
		output = output.replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => {
			return color.getRawFn('blue.underline')(text) + color.gray(` (${url})`);
		});

		// Lists
		output = output.replace(/^- (.+)$/gm, (_, text) => color.gray('• ') + text);
		output = output.replace(/^\d+\. (.+)$/gm, (match, text) => {
			const num = match.match(/^(\d+)\./)?.[1];
			return color.gray(`${num}.`) + ` ${text}`;
		});

		// Code blocks
		output = output.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang: string | undefined, code: string) => {
			const boxFormatter = getBoxFormatter();
			const chars = boxFormatter.getBoxChars('single');
			const header = lang ? color.gray(`[${lang}]`) : '';
			const codeStr = String(code);
			const lines = codeStr.split('\n');
			const maxLineLength = Math.max(...lines.map((line) => line.length));
			const width = Math.min(maxLineLength + 4, 80);
			const block = lines.map((line) => color.gray(chars.vertical + ' ') + line).join('\n');
			const top = color.gray(chars.topLeft + chars.horizontal.repeat(width));
			const bottom = color.gray(chars.bottomLeft + chars.horizontal.repeat(width));
			return `${header}\n${top}\n${block}\n${bottom}`;
		});

		// Blockquotes
		output = output.replace(/^> (.+)$/gm, (_, text) => color.gray('│ ') + color.italic(text));

		// Horizontal rules
		output = output.replace(/^---+$/gm, () => color.gray('─'.repeat(80)));

		return output;
	}

	/**
	 * Format as a box
	 */
	box(content: string, title?: string): string {
		const boxFormatter = getBoxFormatter();

		// Calculate responsive max width based on terminal width, capped at 120
		const terminalWidth = process.stdout.columns || 120;
		const maxBoxWidth = 120;
		const maxWidth = Math.min(maxBoxWidth, terminalWidth - 4);

		// Content width available inside the box (accounting for borders and padding)
		const contentMaxWidth = maxWidth - 4; // 2 for borders, 2 for padding

		// Wrap content lines to fit within the box
		const wrappedLines = content.split('\n').flatMap((line) => this.wrapLine(line, contentMaxWidth));

		// Calculate minimum width needed (at least 40, up to maxWidth)
		const longestLine = Math.max(...wrappedLines.map((line) => line.length), title?.length ?? 0);
		const minWidth = Math.min(Math.max(longestLine + 4, 40), maxWidth);

		if (title) {
			return boxFormatter.formatBoxWithTitle(title, wrappedLines, {
				color: 'gray',
				maxWidth,
				minWidth,
				padding: 1
			});
		}

		return boxFormatter.formatBox(wrappedLines, {
			color: 'gray',
			maxWidth,
			minWidth,
			padding: 1
		});
	}

	/**
	 * Wrap a line to fit within specified width
	 */
	private wrapLine(line: string, maxWidth: number): string[] {
		if (line.length <= maxWidth) {
			return [line];
		}

		const words = line.split(' ');
		const lines: string[] = [];
		let currentLine = '';

		for (const word of words) {
			if (currentLine.length === 0) {
				currentLine = word;
			} else if (currentLine.length + 1 + word.length <= maxWidth) {
				currentLine += ' ' + word;
			} else {
				lines.push(currentLine);
				currentLine = word;
			}
		}

		if (currentLine.length > 0) {
			lines.push(currentLine);
		}

		return lines.length > 0 ? lines : [''];
	}

	/**
	 * Format as a panel
	 */
	panel(content: string, panelColor: 'error' | 'info' | 'success' | 'warning' = 'info'): string {
		const colorAdapter = getColorAdapter();
		const colorMap = {
			error: colorAdapter.red.bind(colorAdapter),
			info: colorAdapter.blue.bind(colorAdapter),
			success: colorAdapter.green.bind(colorAdapter),
			warning: colorAdapter.yellow.bind(colorAdapter)
		};

		const c = colorMap[panelColor];
		const lines = content.split('\n');

		return lines.map((line) => c('│ ') + line).join('\n');
	}

	/**
	 * Format table
	 */
	table(headers: string[], rows: string[][]): string {
		const color = getColorAdapter();
		const boxFormatter = getBoxFormatter();
		const chars = boxFormatter.getBoxChars('single');

		const colWidths = headers.map((h, i) => {
			const cellWidths = rows.map((r) => (r[i] ?? '').length);
			return Math.max(h.length, ...cellWidths);
		});

		const formatRow = (cells: string[], isBold = false): string => {
			const formatted = cells
				.map((cell, i) => {
					const padded = cell.padEnd(colWidths[i] ?? 0);
					return isBold ? color.bold(padded) : padded;
				})
				.join(` ${chars.vertical} `);
			return `${chars.vertical} ${formatted} ${chars.vertical}`;
		};

		const top = boxFormatter.formatTableBorder(colWidths, 'top', { color: 'gray' });
		const separator = boxFormatter.formatTableBorder(colWidths, 'separator', { color: 'gray' });
		const bottom = boxFormatter.formatTableBorder(colWidths, 'bottom', { color: 'gray' });

		const parts = [top, formatRow(headers, true), separator, ...rows.map((row) => formatRow(row)), bottom];

		return color.gray(parts.join('\n'));
	}

	/**
	 * Format JSON with syntax highlighting
	 */
	json(obj: unknown): string {
		const color = getColorAdapter();
		const json = JSON.stringify(obj, null, 2);

		return json
			.replace(/"([^"]+)":/g, (_, key) => color.cyan(`"${key}"`) + ':')
			.replace(/: "([^"]+)"/g, (_, val) => ': ' + color.green(`"${val}"`))
			.replace(/: (\d+)/g, (_, num) => ': ' + color.yellow(num))
			.replace(/: (true|false)/g, (_, bool) => ': ' + color.magenta(bool))
			.replace(/: null/g, ': ' + color.gray('null'));
	}

	/**
	 * Strip markdown formatting
	 */
	static strip(markdown: string): string {
		return markdown
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/\*\*(.+?)\*\*/g, '$1')
			.replace(/\*(.+?)\*/g, '$1')
			.replace(/`(.+?)`/g, '$1')
			.replace(/\[(.+?)\]\(.+?\)/g, '$1')
			.replace(/```[\s\S]*?```/g, '')
			.replace(/^> /gm, '')
			.replace(/^---+$/gm, '')
			.trim();
	}
}

// Singleton instance
let rendererInstance: MarkdownRenderer | null = null;

export function getRenderer(): MarkdownRenderer {
	rendererInstance ??= new MarkdownRenderer();
	return rendererInstance;
}
