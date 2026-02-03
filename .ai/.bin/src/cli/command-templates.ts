/**
 * Command Templates System
 *
 * Reusable command templates for common patterns
 * Supports saving, using, listing, and editing templates
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getHeaderFormatter } from 'output/header-formatter';
import * as path from 'path';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { parseYamlContent, stringifyYaml } from 'utils/yaml-parser';

import type { CommandAdapter } from './command-adapter.interface';

const prompt = getPromptAdapter();

export interface CommandTemplate {
	args?: string[];
	command: string;
	created: string;
	description: string;
	name: string;
	options?: Record<string, boolean | number | string>;
	tags?: string[];
	updated: string;
	variables?: Record<string, { default?: string; description: string; required?: boolean }>;
}

export class TemplateManager {
	private templatesDir: string;

	constructor(templatesDir?: string) {
		this.templatesDir = templatesDir ?? path.join(os.homedir(), '.ai', 'templates');
	}

	/**
	 * Ensure templates directory exists
	 */
	private async ensureTemplatesDir(): Promise<void> {
		await fs.mkdir(this.templatesDir, { recursive: true });
	}

	/**
	 * Get path for a template file
	 */
	private getTemplatePath(name: string): string {
		return path.join(this.templatesDir, `${name}.yaml`);
	}

	/**
	 * Save a template
	 */
	async save(template: Omit<CommandTemplate, 'created' | 'updated'>): Promise<void> {
		const color = getColorAdapter();
		await this.ensureTemplatesDir();

		const templatePath = this.getTemplatePath(template.name);

		// Check if template already exists
		try {
			await fs.access(templatePath);

			// Template exists, ask for confirmation
			const answer = await prompt.prompt<{ overwrite: boolean }>([
				{
					default: false,
					message: `Template '${template.name}' already exists. Overwrite?`,
					name: 'overwrite',
					type: 'confirm'
				}
			]);

			if (!answer.overwrite) {
				console.log(color.yellow('  Template not saved.'));
				return;
			}
		} catch {
			// Template doesn't exist, continue
		}

		// Add timestamps
		const now = new Date().toISOString();
		const fullTemplate: CommandTemplate = {
			...template,
			created: now,
			updated: now
		};

		// Write template
		const content = stringifyYaml(fullTemplate);
		await fs.writeFile(templatePath, content, 'utf-8');

		console.log(color.green(`✓ Template '${template.name}' saved`));
		console.log(color.gray(`  Location: ${templatePath}`));
	}

	/**
	 * Load a template
	 */
	async load(name: string): Promise<CommandTemplate> {
		const templatePath = this.getTemplatePath(name);

		try {
			const content = await fs.readFile(templatePath, 'utf-8');
			const template = parseYamlContent(content) as CommandTemplate;
			return template;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Template '${name}' not found`);
			}
			throw error;
		}
	}

	/**
	 * List all templates
	 */
	async list(tags?: string[]): Promise<CommandTemplate[]> {
		await this.ensureTemplatesDir();

		try {
			const files = await fs.readdir(this.templatesDir);
			const yamlFiles = files.filter((f) => f.endsWith('.yaml'));

			const templates = await Promise.all(
				yamlFiles.map(async (file) => {
					try {
						const content = await fs.readFile(path.join(this.templatesDir, file), 'utf-8');
						const template = parseYamlContent(content) as CommandTemplate;

						// Filter by tags if provided
						if (tags && tags.length > 0) {
							const templateTags = template.tags ?? [];
							const hasTag = tags.some((tag) => templateTags.includes(tag));
							return hasTag ? template : null;
						}
						return template;
					} catch {
						// Silently skip invalid templates
						console.error(`Failed to load template ${file}`);
						return null;
					}
				})
			).then((results) => results.filter((t): t is CommandTemplate => t !== null));

			return templates.sort((a, b) => a.name.localeCompare(b.name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Delete a template
	 */
	async delete(name: string): Promise<void> {
		const color = getColorAdapter();
		const templatePath = this.getTemplatePath(name);

		try {
			await fs.unlink(templatePath);
			console.log(color.green(`✓ Template '${name}' deleted`));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Template '${name}' not found`);
			}
			throw error;
		}
	}

	/**
	 * Use a template (apply with variable substitution)
	 */
	async use(name: string, variables?: Record<string, string>): Promise<string> {
		const color = getColorAdapter();
		const template = await this.load(name);

		// Collect variable values
		const variableValues = variables ?? {};

		if (template.variables) {
			const missingVars = Object.entries(template.variables).filter(
				([key, config]) => config.required && !variableValues[key]
			);

			if (missingVars.length > 0) {
				// Prompt for missing variables
				console.log(color.cyan(`\n📝 Template: ${template.name}\n`));

				const prompts = missingVars.map(([key, config]) => ({
					default: config.default,
					message: config.description ?? key,
					name: key,
					type: 'input' as const
				}));

				const answers = await prompt.prompt(prompts);
				Object.assign(variableValues, answers);
			}
		}

		// Build command
		let command = `valora ${template.command}`;

		// Add args
		if (template.args) {
			const substitutedArgs = template.args.map((arg) => this.substituteVariables(arg, variableValues));
			command += ' ' + substitutedArgs.join(' ');
		}

		// Add options using functional pattern
		if (template.options) {
			const optionStrings = Object.entries(template.options)
				.map(([key, value]) => {
					if (typeof value === 'boolean') {
						return value ? ` --${key}` : '';
					}
					const substitutedValue = this.substituteVariables(String(value), variableValues);
					return ` --${key}=${substitutedValue}`;
				})
				.filter((opt) => opt !== '');

			command += optionStrings.join('');
		}

		return command;
	}

	/**
	 * Substitute variables in a string
	 */
	private substituteVariables(text: string, variables: Record<string, string>): string {
		// Substitute variables using functional pattern
		return Object.entries(variables).reduce(
			(result, [key, value]) => result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
			text
		);
	}

	/**
	 * Edit a template
	 */
	async edit(name: string): Promise<void> {
		const color = getColorAdapter();
		const templatePath = this.getTemplatePath(name);

		// Check if template exists
		try {
			await fs.access(templatePath);
		} catch {
			throw new Error(`Template '${name}' not found`);
		}

		// Open in editor
		const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? 'vim';

		console.log(color.cyan(`\n📝 Opening template in ${editor}...\n`));

		const { spawn } = await import('child_process');

		return new Promise((resolve, reject) => {
			const child = spawn(editor, [templatePath], {
				stdio: 'inherit'
			});

			child.on('exit', (code) => {
				if (code === 0) {
					console.log(color.green('\n✓ Template updated'));
					resolve();
				} else {
					reject(new Error(`Editor exited with code ${code}`));
				}
			});

			child.on('error', (error) => {
				reject(error);
			});
		});
	}

	/**
	 * Export template to file
	 */
	async export(name: string, outputPath: string): Promise<void> {
		const color = getColorAdapter();
		const template = await this.load(name);
		const content = stringifyYaml(template);

		await fs.writeFile(outputPath, content, 'utf-8');

		console.log(color.green(`✓ Template exported to: ${outputPath}`));
	}

	/**
	 * Import template from file
	 */
	async import(filePath: string): Promise<void> {
		const content = await fs.readFile(filePath, 'utf-8');
		const template = parseYamlContent(content) as CommandTemplate;

		if (!template.name) {
			throw new Error('Template must have a name');
		}

		await this.save(template);
	}

	/**
	 * Format template list for display
	 */
	formatList(templates: CommandTemplate[]): string {
		const color = getColorAdapter();
		if (templates.length === 0) {
			return color.yellow('\n  No templates found.\n');
		}

		const headerFormatter = getHeaderFormatter();
		const lines: string[] = [];

		lines.push(headerFormatter.formatHeader('📋 COMMAND TEMPLATES'));

		templates.forEach((template) => {
			const tags = template.tags ? color.gray(`[${template.tags.join(', ')}]`) : '';
			lines.push(`  • ${color.cyan(template.name.padEnd(25))} ${template.description}`);
			if (tags) {
				lines.push(`    ${tags}`);
			}
		});

		lines.push(`
${color.gray('  Use: valora template use <name>')}
${color.gray('  Manage: valora template edit <name>')}
`);

		return lines.join('\n');
	}
}

/**
 * Built-in templates
 */
export const BUILTIN_TEMPLATES: Array<Omit<CommandTemplate, 'created' | 'updated'>> = [
	{
		command: 'plan',
		description: 'Plan new feature with auto-review',
		name: 'feature-plan',
		options: {
			'auto-next': true
		},
		tags: ['planning', 'feature'],
		variables: {
			description: {
				description: 'Feature description',
				required: true
			}
		}
	},
	{
		args: ['{{description}}'],
		command: 'plan',
		description: 'Quick bug fix workflow',
		name: 'bug-fix',
		options: {
			model: 'claude-haiku-4.5',
			session: 'bug-fix-{{bugId}}'
		},
		tags: ['bugfix', 'quick'],
		variables: {
			bugId: {
				description: 'Bug ID or number',
				required: true
			},
			description: {
				description: 'Bug description',
				required: true
			}
		}
	},
	{
		args: ['{{description}}'],
		command: 'plan',
		description: 'Safe refactoring with tests',
		name: 'refactor',
		options: {
			'auto-next': true,
			session: 'refactor-{{date}}'
		},
		tags: ['refactoring', 'testing'],
		variables: {
			date: {
				default: new Date().toISOString().split('T')[0],
				description: 'Date (YYYY-MM-DD)'
			},
			description: {
				description: 'Refactoring description',
				required: true
			}
		}
	},
	{
		args: ['{{description}}'],
		command: 'refine-specs',
		description: 'Complete feature from spec to PR',
		name: 'full-feature',
		options: {
			'auto-next': true
		},
		tags: ['feature', 'workflow'],
		variables: {
			description: {
				description: 'Feature specification',
				required: true
			}
		}
	}
];

/**
 * Configure template command
 */
export function configureTemplateCommand(program: CommandAdapter): void {
	const template = program.command('template').description('Manage command templates');

	template
		.command('list')
		.description('List all templates')
		.option('--tags <tags>', 'Filter by tags (comma-separated)')
		.action(async (options: { tags?: string }) => {
			const manager = new TemplateManager();
			const tags = options.tags ? options.tags.split(',').map((t) => t.trim()) : undefined;
			const templates = await manager.list(tags);
			console.log(manager.formatList(templates));
		});

	template
		.command('use')
		.description('Use a template')
		.argument('<name>', 'Template name')
		.option(
			'--var <key=value>',
			'Template variable',
			(value: string, previous: Record<string, string>) => {
				const [key, val] = value.split('=');
				// Ensure both key and val are defined before assignment
				if (key && val !== undefined) {
					previous[key] = val;
				}
				return previous;
			},
			{}
		)
		.action(async (...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const options = args[1] as unknown as { var: Record<string, string> };
			const color = getColorAdapter();
			const manager = new TemplateManager();
			const command = await manager.use(name, options.var);
			console.log(color.cyan('\n📋 Generated command:\n'));
			console.log(color.green('  $ ' + command));
			console.log();

			const answer = await prompt.prompt<{ execute: boolean }>([
				{
					default: true,
					message: 'Execute this command?',
					name: 'execute',
					type: 'confirm'
				}
			]);

			if (answer.execute) {
				// Execute the command
				const args = command.split(' ').slice(1); // Remove 'ai'
				// Safely access process.argv with fallback values
				const execPath = process.argv[0] ?? process.execPath;
				const scriptPath = process.argv[1] ?? '';
				process.argv = [execPath, scriptPath, ...args];
				// Let the main CLI handle it
			}
		});

	template
		.command('edit')
		.description('Edit a template')
		.argument('<name>', 'Template name')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const manager = new TemplateManager();
			await manager.edit(name);
		});

	template
		.command('delete')
		.description('Delete a template')
		.argument('<name>', 'Template name')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const manager = new TemplateManager();
			await manager.delete(name);
		});

	template
		.command('export')
		.description('Export a template')
		.argument('<name>', 'Template name')
		.argument('<output>', 'Output file path')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const output = args[1] as unknown as string;
			const manager = new TemplateManager();
			await manager.export(name, output);
		});

	template
		.command('import')
		.description('Import a template')
		.argument('<file>', 'Template file path')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const file = args[0] as unknown as string;
			const manager = new TemplateManager();
			await manager.import(file);
		});

	template
		.command('init')
		.description('Initialize built-in templates')
		.action(async () => {
			const color = getColorAdapter();
			const manager = new TemplateManager();

			console.log(color.cyan('\n📦 Installing built-in templates...\n'));

			await Promise.all(BUILTIN_TEMPLATES.map((tmpl) => manager.save(tmpl)));

			console.log(color.green(`\n✓ Installed ${BUILTIN_TEMPLATES.length} built-in templates`));
			console.log(color.gray('  List them: valora template list'));
			console.log();
		});
}
