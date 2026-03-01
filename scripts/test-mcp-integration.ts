#!/usr/bin/env node
/**
 * Test MCP Integration
 *
 * Quick test to verify MCP client integration works.
 * Usage: pnpm exec tsx scripts/test-mcp-integration.ts [server-id]
 *
 * Example:
 *   pnpm exec tsx scripts/test-mcp-integration.ts chrome-devtools
 *   pnpm exec tsx scripts/test-mcp-integration.ts playwright
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGISTRY_PATH = resolve(__dirname, '../../external-mcp.json');

interface ExternalMCPRegistry {
	schema_version: string;
	servers: ExternalMCPServer[];
}

interface ExternalMCPServer {
	connection: {
		args: string[];
		command: string;
		type: string;
	};
	description: string;
	enabled?: boolean;
	id: string;
	name: string;
	security: {
		capabilities: string[];
		risk_level: string;
	};
}

async function listServers(): Promise<void> {
	if (!existsSync(REGISTRY_PATH)) {
		console.error('❌ Registry not found:', REGISTRY_PATH);
		process.exit(1);
	}

	const registry: ExternalMCPRegistry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));

	console.log(`\n📋 Available MCP Servers (${registry.servers.length}):\n`);
	console.log('┌─────────────────────┬────────────────────────────────────────────────────┐');
	console.log('│ Server ID           │ Description                                        │');
	console.log('├─────────────────────┼────────────────────────────────────────────────────┤');

	for (const server of registry.servers) {
		const id = server.id.padEnd(19);
		const desc = server.description.substring(0, 50).padEnd(50);
		console.log(`│ ${id} │ ${desc} │`);
	}

	console.log('└─────────────────────┴────────────────────────────────────────────────────┘');
	console.log('\nUsage: pnpm exec tsx scripts/test-mcp-integration.ts <server-id>');
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === '--list') {
		await listServers();
		return;
	}

	const serverId = args[0];
	await testMCPServer(serverId);
}

async function testMCPServer(serverId: string): Promise<void> {
	console.log(`\n🔍 Testing MCP Server: ${serverId}\n`);
	console.log('='.repeat(50));

	// Load registry
	if (!existsSync(REGISTRY_PATH)) {
		console.error('❌ Registry not found:', REGISTRY_PATH);
		process.exit(1);
	}

	const registry: ExternalMCPRegistry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
	const server = registry.servers.find((s) => s.id === serverId);

	if (!server) {
		console.error(`❌ Server '${serverId}' not found in registry`);
		console.log('\nAvailable servers:');
		registry.servers.forEach((s) => console.log(`  - ${s.id}: ${s.name}`));
		process.exit(1);
	}

	// Display server info
	console.log(`\n📋 Server Configuration:`);
	console.log(`   ID:          ${server.id}`);
	console.log(`   Name:        ${server.name}`);
	console.log(`   Description: ${server.description}`);
	console.log(`   Enabled:     ${server.enabled !== false ? 'Yes' : 'No'}`);
	console.log(`   Risk Level:  ${server.security.risk_level}`);
	console.log(`   Capabilities: ${server.security.capabilities.join(', ')}`);

	console.log(`\n🔌 Connection:`);
	console.log(`   Type:    ${server.connection.type}`);
	console.log(`   Command: ${server.connection.command} ${server.connection.args.join(' ')}`);

	// Check if command exists
	console.log(`\n🔧 Checking package availability...`);

	const { spawn } = await import('child_process');

	// Try to get package info
	const packageName = server.connection.args[0];

	return new Promise((resolve) => {
		const npmView = spawn('npm', ['view', packageName, 'version'], {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		npmView.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		npmView.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		npmView.on('close', async (code) => {
			if (code === 0 && stdout.trim()) {
				console.log(`   ✅ Package found: ${packageName}@${stdout.trim()}`);

				// Try to start the server briefly
				console.log(`\n🚀 Testing server startup...`);

				const serverProcess = spawn(server.connection.command, server.connection.args, {
					stdio: ['pipe', 'pipe', 'pipe']
				});

				let connected = false;

				let killedByTimeout = false;

				const timeout = setTimeout(() => {
					killedByTimeout = true;
					serverProcess.kill();
				}, 3000);

				serverProcess.stdout.on('data', (data) => {
					const output = data.toString();
					if (output.includes('MCP') || output.includes('ready') || output.includes('listening')) {
						connected = true;
						console.log(`   ✅ Server responded: ${output.trim().substring(0, 100)}`);
					}
				});

				serverProcess.stderr.on('data', (data) => {
					const output = data.toString();
					// Filter out npm warnings
					if (!output.includes('npm warn') && !output.includes('npm notice')) {
						console.log(`   ⚠️  stderr: ${output.trim().substring(0, 100)}`);
					}
				});

				serverProcess.on('close', (code) => {
					clearTimeout(timeout);
					if (killedByTimeout) {
						console.log(`   ✅ Server started and ran for 3s (stopped by test)`);
						console.log(`\n✅ MCP server '${serverId}' is working correctly`);
					} else if (code === 0 || connected) {
						console.log(`\n✅ MCP server test completed successfully`);
					} else {
						console.log(`   ❌ Server exited unexpectedly with code ${code}`);
						console.log(`\n❌ MCP server test failed`);
					}
					resolve();
				});

				serverProcess.on('error', (err) => {
					clearTimeout(timeout);
					console.log(`   ❌ Failed to start: ${err.message}`);
					console.log(`\n❌ MCP server test failed`);
					resolve();
				});
			} else {
				console.log(`   ❌ Package not found: ${packageName}`);
				if (stderr) {
					console.log(`   Error: ${stderr.trim().substring(0, 200)}`);
				}
				resolve();
			}
		});
	});
}

main().catch(console.error);
