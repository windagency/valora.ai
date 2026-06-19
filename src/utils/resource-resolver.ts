/**
 * Resource Resolver - Dual-source resource resolution
 *
 * Resolves resources (agents, commands, prompts, templates) from two sources:
 * 1. Project overrides: .valora/{type}/ (highest priority)
 * 2. Package built-ins: data/{type}/ (fallback)
 *
 * Project-level resources override built-in ones when they share the same name.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getPackageDataDir, getProjectConfigDir } from './paths';

export interface ResourceInfo {
	name: string;
	path: string;
	source: 'builtin' | 'project';
}

export type ResourceType = 'agents' | 'commands' | 'hooks' | 'prompts' | 'templates';

export class ResourceResolver {
	private readonly packageDataDir: string;
	private readonly pluginDirs: Set<string> = new Set();
	private readonly projectConfigDir: null | string;

	constructor() {
		this.packageDataDir = getPackageDataDir();
		this.projectConfigDir = getProjectConfigDir();
	}

	/**
	 * Register a plugin directory as an allowed resource location.
	 * Must be called before any loader attempts to use the plugin directory.
	 */
	registerPluginDir(dir: string): void {
		this.pluginDirs.add(path.resolve(dir));
	}

	/**
	 * Get ordered list of directories to search for a resource type.
	 * Project directory comes first (higher priority), then package directory.
	 */
	getSources(resourceType: ResourceType): string[] {
		const sources: string[] = [];

		// Project override directory (highest priority)
		if (this.projectConfigDir) {
			const projectDir = path.join(this.projectConfigDir, resourceType);
			if (fs.existsSync(projectDir)) {
				sources.push(projectDir);
			}
		}

		// Package built-in directory (fallback)
		const packageDir = path.join(this.packageDataDir, resourceType);
		if (fs.existsSync(packageDir)) {
			sources.push(packageDir);
		}

		return sources;
	}

	/**
	 * Resolve the path to a single resource file.
	 * Project override wins over built-in.
	 */
	resolveResource(resourceType: ResourceType, name: string): null | string {
		// Check project override first
		if (this.projectConfigDir) {
			const projectPath = path.join(this.projectConfigDir, resourceType, name);
			if (fs.existsSync(projectPath)) {
				return projectPath;
			}
		}

		// Fall back to package built-in
		const packagePath = path.join(this.packageDataDir, resourceType, name);
		if (fs.existsSync(packagePath)) {
			return packagePath;
		}

		return null;
	}

	/**
	 * Resolve a resource directory path.
	 * Returns the first existing directory: project override, then package built-in.
	 * For loaders that need a single directory path.
	 */
	resolveResourceDir(resourceType: ResourceType): string {
		// If project override directory exists, prefer it
		if (this.projectConfigDir) {
			const projectDir = path.join(this.projectConfigDir, resourceType);
			if (fs.existsSync(projectDir)) {
				return projectDir;
			}
		}

		// Fall back to package built-in
		return path.join(this.packageDataDir, resourceType);
	}

	/**
	 * List all resources from both sources, merged with deduplication.
	 * Project overrides take precedence when names collide.
	 */
	listResources(resourceType: ResourceType, extension?: string): ResourceInfo[] {
		const resources = new Map<string, ResourceInfo>();

		// Load package built-ins first
		const packageDir = path.join(this.packageDataDir, resourceType);
		this.addResourcesFromDir(packageDir, 'builtin', resources, extension);

		// Override with project resources (higher priority)
		if (this.projectConfigDir) {
			const projectDir = path.join(this.projectConfigDir, resourceType);
			this.addResourcesFromDir(projectDir, 'project', resources, extension);
		}

		return Array.from(resources.values());
	}

	/**
	 * Get the package data directory path.
	 */
	getPackageDataDir(): string {
		return this.packageDataDir;
	}

	/**
	 * Get the project config directory path, or null if not in a project.
	 */
	getProjectConfigDir(): null | string {
		return this.projectConfigDir;
	}

	/**
	 * Check if a directory is within the package data dir, project config dir, or a registered plugin dir.
	 * Used for security validation.
	 */
	isAllowedDirectory(dirPath: string): boolean {
		const resolvedPath = path.resolve(dirPath);

		// Allow package data directory
		if (resolvedPath.startsWith(path.resolve(this.packageDataDir))) {
			return true;
		}

		// Allow project config directory
		if (this.projectConfigDir && resolvedPath.startsWith(path.resolve(this.projectConfigDir))) {
			return true;
		}

		// Allow registered plugin directories
		for (const pluginDir of this.pluginDirs) {
			if (resolvedPath.startsWith(pluginDir)) {
				return true;
			}
		}

		return false;
	}

	private addResourcesFromDir(
		dirPath: string,
		source: 'builtin' | 'project',
		resources: Map<string, ResourceInfo>,
		extension?: string
	): void {
		if (!fs.existsSync(dirPath)) return;

		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile()) continue;
				if (extension && !entry.name.endsWith(extension)) continue;

				resources.set(entry.name, {
					name: entry.name,
					path: path.join(dirPath, entry.name),
					source
				});
			}
		} catch {
			// Directory unreadable, skip
		}
	}
}

// Singleton instance
let resolverInstance: null | ResourceResolver = null;

export function getResourceResolver(): ResourceResolver {
	resolverInstance ??= new ResourceResolver();
	return resolverInstance;
}

export function resetResourceResolver(): void {
	resolverInstance = null;
}
