/**
 * Agent loader - loads agent definitions from markdown files
 */

import * as path from 'path';

import type { AgentDefinition, AgentMetadata } from 'types/agent.types';

import { getLogger } from 'output/logger';
import { ValidationError } from 'utils/error-handler';
import { fileExists, listFiles, readFile } from 'utils/file-utils';
import { getPackageDataDir } from 'utils/paths';
import { parseMarkdownWithFrontmatter, validateRequiredFields, YamlParseError } from 'utils/yaml-parser';

export class AgentLoader {
	private agentsDir: string;
	private cache: Map<string, AgentDefinition> = new Map();
	private pluginDirs = new Set<string>();

	constructor(agentsDir?: string) {
		this.agentsDir = agentsDir ?? path.join(getPackageDataDir(), 'agents');
	}

	/**
	 * Register an additional agent directory contributed by a plugin.
	 * Plugin agents are available as fallbacks when the primary directory lacks the role.
	 */
	registerPluginDir(dir: string): void {
		this.pluginDirs.add(dir);
	}

	/**
	 * Load a specific agent by role
	 */
	async loadAgent(role: string): Promise<AgentDefinition> {
		// Check cache first
		if (this.cache.has(role)) {
			return this.cache.get(role)!;
		}

		const filePath = this.resolveAgentPath(role);

		try {
			const content = await readFile(filePath);
			const parsed = parseMarkdownWithFrontmatter<AgentMetadata>(content, filePath);

			// Validate required fields
			validateRequiredFields(
				parsed.metadata as unknown as Record<string, unknown>,
				['role', 'version', 'description', 'specialization', 'tone', 'capabilities'],
				filePath
			);

			// Validate capabilities
			const caps = parsed.metadata.capabilities;
			if (
				typeof caps !== 'object' ||
				!('can_write_knowledge' in caps) ||
				!('can_write_code' in caps) ||
				!('can_review_code' in caps) ||
				!('can_run_tests' in caps)
			) {
				throw new ValidationError('Agent must have valid capabilities', {
					file: filePath
				});
			}

			const agent: AgentDefinition = {
				...parsed.metadata,
				content: parsed.content
			};

			// Cache the agent
			this.cache.set(role, agent);

			return agent;
		} catch (error) {
			if (error instanceof YamlParseError || error instanceof ValidationError) {
				throw error;
			}
			throw new ValidationError(`Failed to load agent: ${role}`, {
				error: (error as Error).message,
				file: filePath
			});
		}
	}

	/**
	 * Resolve the file path for an agent role, checking plugin dirs if not in the primary dir.
	 */
	private resolveAgentPath(role: string): string {
		const primary = path.join(this.agentsDir, `${role}.md`);
		if (fileExists(primary)) return primary;

		for (const pluginDir of this.pluginDirs) {
			const candidate = path.join(pluginDir, `${role}.md`);
			if (fileExists(candidate)) return candidate;
		}

		return primary; // Preserve existing error path when role is not found
	}

	/**
	 * Load all agents
	 */
	async loadAllAgents(): Promise<Map<string, AgentDefinition>> {
		const allDirs = [this.agentsDir, ...this.pluginDirs];
		const dirFileLists = await Promise.all(allDirs.map((dir) => listFiles(dir, '.md').catch(() => [] as string[])));
		const allFiles = [...new Set(dirFileLists.flat())];
		const logger = getLogger();

		// Filter out template files and load agents in parallel
		const agentEntries = await Promise.all(
			allFiles
				.filter((file) => !file.startsWith('_'))
				.map(async (file) => {
					const role = file.replace('.md', '');
					try {
						const agent = await this.loadAgent(role);
						return { agent, role };
					} catch (error) {
						logger.warn(`Failed to load agent ${role}`, { error: (error as Error).message });
						return null;
					}
				})
		);

		// Convert successful entries to Map, filtering out failed loads
		return new Map(
			agentEntries
				.filter((entry): entry is { agent: AgentDefinition; role: string } => entry !== null)
				.map(({ agent, role }) => [role, agent])
		);
	}

	/**
	 * List available agent roles from primary and plugin directories.
	 */
	async listAgents(): Promise<string[]> {
		const allDirs = [this.agentsDir, ...this.pluginDirs];
		const seen = new Set<string>();

		for (const dir of allDirs) {
			const files = await listFiles(dir, '.md').catch(() => [] as string[]);
			for (const f of files) {
				if (!f.startsWith('_')) seen.add(f.replace('.md', ''));
			}
		}

		return Array.from(seen);
	}

	/**
	 * Check if an agent exists
	 */
	async agentExists(role: string): Promise<boolean> {
		const agents = await this.listAgents();
		return agents.includes(role);
	}

	/**
	 * Get agent expertise areas
	 */
	async getAgentExpertise(role: string): Promise<string[]> {
		const agent = await this.loadAgent(role);
		return agent.expertise ?? [];
	}

	/**
	 * Find agents by capability
	 */
	async findAgentsByCapability(capability: keyof AgentDefinition['capabilities']): Promise<string[]> {
		const allAgents = await this.loadAllAgents();

		return Array.from(allAgents.entries())
			.filter(([, agent]) => agent.capabilities[capability])
			.map(([role]) => role);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache size
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	/**
	 * Inject a pre-loaded agent into the cache
	 * Used by dry-run cache to speed up subsequent execution
	 */
	injectCachedAgent(
		role: string,
		agentData: { content: string; decision_making?: { escalation_criteria?: string[] } }
	): void {
		// Create a minimal AgentDefinition with the cached data
		// The full metadata isn't needed for execution, just the content and decision_making
		const cachedAgent: AgentDefinition = {
			capabilities: {
				can_review_code: false,
				can_run_tests: false,
				can_write_code: false,
				can_write_knowledge: false
			},
			content: agentData.content,
			decision_making: agentData.decision_making
				? {
						autonomy_level: 'medium',
						escalation_criteria: agentData.decision_making.escalation_criteria
					}
				: undefined,
			description: 'Cached from dry-run',
			role,
			specialization: '',
			tone: 'concise-technical',
			version: 'cached'
		};
		this.cache.set(role, cachedAgent);
	}

	/**
	 * Export cache contents for session storage
	 * Returns minimal data needed for cache restoration
	 */
	exportCache(): Record<string, { content: string; decision_making?: { escalation_criteria?: string[] } }> {
		const exported: Record<string, { content: string; decision_making?: { escalation_criteria?: string[] } }> = {};

		for (const [role, agent] of this.cache.entries()) {
			exported[role] = {
				content: agent.content,
				decision_making: agent.decision_making
					? { escalation_criteria: agent.decision_making.escalation_criteria }
					: undefined
			};
		}

		return exported;
	}
}
