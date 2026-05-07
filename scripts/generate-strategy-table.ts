#!/usr/bin/env tsx
/**
 * generate-strategy-table.ts
 *
 * Parses every `registerStrategy('NAME', ...)` call in the three built-in
 * compression plugins and emits:
 *   1. Per-plugin sorted strategy lists.
 *   2. The total count.
 *   3. A markdown table ready to paste into session-optimization.md.
 *
 * Run with:
 *   pnpm exec tsx scripts/generate-strategy-table.ts
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

interface PluginDef {
	label: string;
	path: string;
}

const plugins: PluginDef[] = [
	{
		label: 'python',
		path: 'packages/valora-plugin-compression-python/src/index.ts'
	},
	{
		label: 'typescript',
		path: 'packages/valora-plugin-compression-typescript/src/index.ts'
	},
	{
		label: 'universal',
		path: 'packages/valora-plugin-compression-universal/src/index.ts'
	}
];

interface ParsedPlugin {
	label: string;
	package: string;
	strategies: string[];
}

function extractStrategies(source: string): string[] {
	const pattern = /registerStrategy\(\s*['"]([^'"]+)['"]/g;
	const names: string[] = [];
	let match: null | RegExpExecArray;
	while ((match = pattern.exec(source)) !== null) {
		names.push(match[1]);
	}
	// Sort alphabetically for deterministic output.
	return names.sort((a, b) => a.localeCompare(b));
}

const results: ParsedPlugin[] = plugins.map(({ label, path }) => {
	const source = readFileSync(resolve(repoRoot, path), 'utf-8');
	const strategies = extractStrategies(source);
	return {
		label,
		package: `packages/valora-plugin-compression-${label}/`,
		strategies
	};
});

const total = results.reduce((sum, r) => sum + r.strategies.length, 0);

console.log(`Total strategies: ${String(total)}`);
console.log('');
results.forEach(({ label, strategies }) => {
	console.log(`  ${label}: ${String(strategies.length)} (${strategies.join(', ')})`);
});
console.log('');

// Markdown table
const header = '| Package | Count | Strategies (sorted) |';
const divider = '| ------- | -----:| ------------------- |';
const rows = results.map(({ package: pkg, strategies }) => {
	return `| \`${pkg}\` | ${String(strategies.length)} | ${strategies.map((s) => `\`${s}\``).join(', ')} |`;
});

console.log(header);
console.log(divider);
rows.forEach((row) => console.log(row));
console.log('');
console.log(`**Total: ${String(total)} strategies across ${String(results.length)} plugins.**`);
