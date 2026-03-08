/**
 * Init command - initializes a project-level .valora/ configuration directory
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';

interface InitOptions extends Record<string, unknown> {
	full?: boolean;
}

/**
 * Configure init command
 */
export function configureInitCommand(program: CommandAdapter): void {
	program
		.command('init')
		.description('Initialize a .valora/ project configuration directory')
		.option('--full', 'Create full directory structure with agent/command/prompt override directories')
		.action((options: InitOptions) => {
			const color = getColorAdapter();
			const projectRoot = process.cwd();
			const valoraDir = path.join(projectRoot, '.valora');

			if (fs.existsSync(valoraDir)) {
				console.log(color.yellow('.valora/ directory already exists in this project.'));
				return;
			}

			// Create .valora directory
			fs.mkdirSync(valoraDir, { recursive: true });

			// Create default config.json
			const defaultConfig = {
				defaults: {
					interactive: true,
					log_level: 'info',
					output_format: 'markdown',
					session_mode: true
				},
				providers: {}
			};
			fs.writeFileSync(path.join(valoraDir, 'config.json'), JSON.stringify(defaultConfig, null, 2) + '\n');

			// Create .gitignore
			const gitignoreContent = ['config.json', 'sessions/', 'logs/', 'cache/', 'idempotency/', ''].join('\n');
			fs.writeFileSync(path.join(valoraDir, '.gitignore'), gitignoreContent);

			if (options.full) {
				// Create override directories
				const dirs = ['agents', 'commands', 'prompts', 'templates'];
				for (const dir of dirs) {
					fs.mkdirSync(path.join(valoraDir, dir), { recursive: true });
					// Add .gitkeep to each empty directory
					fs.writeFileSync(path.join(valoraDir, dir, '.gitkeep'), '');
				}

				// Create hooks.json
				const hooksConfig = { hooks: {} };
				fs.writeFileSync(path.join(valoraDir, 'hooks.json'), JSON.stringify(hooksConfig, null, 2) + '\n');

				// Create external-mcp.json
				const mcpConfig = { schema_version: '1.0', servers: [] };
				fs.writeFileSync(path.join(valoraDir, 'external-mcp.json'), JSON.stringify(mcpConfig, null, 2) + '\n');
			}

			console.log(color.green('Initialized .valora/ project configuration directory.'));
			console.log();
			console.log('Created:');
			console.log(`  ${color.cyan('.valora/config.json')}     - Project configuration`);
			console.log(`  ${color.cyan('.valora/.gitignore')}      - Git ignore rules`);

			if (options.full) {
				console.log(`  ${color.cyan('.valora/hooks.json')}      - Hook definitions`);
				console.log(`  ${color.cyan('.valora/external-mcp.json')} - External MCP server config`);
				console.log(`  ${color.cyan('.valora/agents/')}         - Agent overrides`);
				console.log(`  ${color.cyan('.valora/commands/')}        - Command overrides`);
				console.log(`  ${color.cyan('.valora/prompts/')}         - Prompt overrides`);
				console.log(`  ${color.cyan('.valora/templates/')}       - Template overrides`);
			}

			console.log();
			console.log(`Edit ${color.cyan('.valora/config.json')} to configure providers and settings.`);
		});
}
