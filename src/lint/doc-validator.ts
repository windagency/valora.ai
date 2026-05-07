import matter from 'gray-matter';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { DocValidationError, DocValidationResult } from './lint.types';

interface DocValidatorOptions {
	stalenessThresholdDays: number;
}

export class DocValidator {
	private readonly stalenessThresholdDays: number;

	constructor(options: DocValidatorOptions) {
		this.stalenessThresholdDays = options.stalenessThresholdDays;
	}

	async validateDirectory(dirPath: string): Promise<DocValidationResult> {
		const entries = await fs.readdir(dirPath, { recursive: true, withFileTypes: true });
		const mdFiles = entries
			.filter((e) => e.isFile() && e.name.endsWith('.md'))
			.map((e) => path.join(e.parentPath, e.name));

		const results = await Promise.all(mdFiles.map((f) => this.validateFile(f)));
		return {
			errors: results.flatMap((r) => r.errors),
			scannedFiles: mdFiles.length
		};
	}

	async validateFile(filePath: string): Promise<DocValidationResult> {
		const content = await fs.readFile(filePath, 'utf-8');
		const { content: body, data } = matter(content);
		const errors: DocValidationError[] = [];

		errors.push(...this.checkFrontmatter(filePath, data));
		errors.push(...(await this.checkLinks(filePath, body)));

		return { errors, scannedFiles: 1 };
	}

	private checkFrontmatter(filePath: string, data: Record<string, unknown>): DocValidationError[] {
		const today = new Date().toISOString().slice(0, 10);

		if (!data['updated']) {
			return [
				{
					file: filePath,
					kind: 'missing-updated',
					message: `Missing 'updated' frontmatter field`,
					remedy: `Add the following frontmatter block to the top of ${path.basename(filePath)}:\n---\nupdated: ${today}\n---`
				}
			];
		}

		const updated = new Date(data['updated'] as string);
		const daysSince = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);

		if (daysSince > this.stalenessThresholdDays) {
			return [
				{
					file: filePath,
					kind: 'stale-updated',
					message: `Doc not updated in ${Math.floor(daysSince)} days (threshold: ${this.stalenessThresholdDays} days)`,
					remedy: `Review ${path.basename(filePath)} to ensure it reflects current code behaviour, then update 'updated: ${today}' in its frontmatter.`
				}
			];
		}

		return [];
	}

	private async checkLinks(filePath: string, body: string): Promise<DocValidationError[]> {
		const linkPattern = /\[([^\]]+)\]\(([^)#]+)[^)]*\)/g;
		const dir = path.dirname(filePath);
		const errors: DocValidationError[] = [];
		const strippedBody = this.stripCodeBlocks(body);

		for (const match of strippedBody.matchAll(linkPattern)) {
			const href = match[2];
			if (!href || href.startsWith('http') || href.startsWith('mailto:')) continue;

			const resolved = path.resolve(dir, href);
			try {
				await fs.access(resolved);
			} catch {
				errors.push({
					file: filePath,
					kind: 'broken-link',
					message: `Broken link: '${href}' resolves to non-existent '${resolved}'`,
					remedy: `Fix the link '${href}' in ${path.basename(filePath)}. Run \`ls ${path.dirname(resolved)}\` to see files available in that directory.`
				});
			}
		}

		return errors;
	}

	private stripCodeBlocks(body: string): string {
		return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
	}
}
