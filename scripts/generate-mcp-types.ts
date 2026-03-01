#!/usr/bin/env node
/**
 * Generate MCP Types from external-mcp.json
 *
 * This script reads the external MCP registry and generates/validates
 * the MCPServerId type in mcp-registry.types.ts.
 *
 * Usage:
 *   node scripts/generate-mcp-types.js         # Validate types match JSON
 *   node scripts/generate-mcp-types.js --fix   # Update types to match JSON
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGISTRY_PATH = resolve(__dirname, '../../external-mcp.json');
const TYPES_PATH = resolve(__dirname, '../src/types/mcp-registry.types.ts');

interface ExternalMCPRegistry {
	schema_version: string;
	servers: ExternalMCPServer[];
}

interface ExternalMCPServer {
	description: string;
	id: string;
	name: string;
}

function generateMCPServerIdType(serverIds: string[]): string {
	const lines = serverIds.map((id, i) => {
		const prefix = i === 0 ? '\t| ' : '\t| ';
		return `${prefix}'${id}'`;
	});

	return `export type MCPServerId =\n${lines.join('\n')};`;
}

function main(): void {
	const args = process.argv.slice(2);
	const shouldFix = args.includes('--fix');

	// Read registry
	if (!existsSync(REGISTRY_PATH)) {
		console.error(`Registry not found: ${REGISTRY_PATH}`);
		process.exit(1);
	}

	const registry: ExternalMCPRegistry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
	const serverIds = registry.servers.map((s) => s.id).sort();

	// Generate expected type
	const expectedType = generateMCPServerIdType(serverIds);

	// Read current types file
	if (!existsSync(TYPES_PATH)) {
		console.error(`Types file not found: ${TYPES_PATH}`);
		process.exit(1);
	}

	const currentContent = readFileSync(TYPES_PATH, 'utf-8');

	// Extract current MCPServerId type
	const typeMatch = currentContent.match(/export type MCPServerId =\s*\n([\s\S]*?);/);

	if (!typeMatch) {
		console.error('Could not find MCPServerId type in mcp-registry.types.ts');
		process.exit(1);
	}

	const currentType = typeMatch[0];

	// Compare
	if (currentType === expectedType) {
		console.log('✓ MCPServerId type is in sync with external-mcp.json');
		console.log(`  ${serverIds.length} servers defined`);
		process.exit(0);
	}

	console.log('✗ MCPServerId type is out of sync with external-mcp.json');
	console.log('\nExpected servers:', serverIds.join(', '));

	if (shouldFix) {
		// Update the file
		const updatedContent = currentContent.replace(/export type MCPServerId =\s*\n[\s\S]*?;/, expectedType);

		writeFileSync(TYPES_PATH, updatedContent);
		console.log('\n✓ Updated mcp-registry.types.ts');
		console.log('  Run `pnpm build` to verify');
	} else {
		console.log('\nRun with --fix to update the types file');
		process.exit(1);
	}
}

main();
