/**
 * Context Analyzer Service
 *
 * Examines affected files, dependencies, and patterns to provide
 * additional context for agent selection and task classification.
 */

import type { CodebaseContext, TaskContext } from 'types/agent.types';

import { getLogger } from 'output/logger';
import * as path from 'path';
import { readFile } from 'utils/file-utils';

export class ContextAnalyzerService {
	private readonly analysisCache = new Map<string, CodebaseContext>();
	private readonly logger = getLogger();

	/**
	 * Analyse the codebase context for given file paths
	 */
	async analyzeContext(affectedFiles: string[]): Promise<CodebaseContext> {
		return this.doAnalyzeContext({
			affectedFiles,
			complexity: 'low',
			dependencies: [],
			description: ''
		});
	}

	/**
	 * Analyse task context (internal implementation)
	 */
	private async doAnalyzeContext(taskContext: TaskContext): Promise<CodebaseContext> {
		// Ensure affectedFiles is always an array
		const affectedFiles = taskContext.affectedFiles ?? [];

		this.logger.debug('Analyzing codebase context', {
			fileCount: affectedFiles.length,
			files: affectedFiles.slice(0, 5) // Log first 5 files
		});

		// Create cache key from sorted file paths
		const cacheKey = [...affectedFiles].sort().join('|');

		// Check cache first
		if (this.analysisCache.has(cacheKey)) {
			this.logger.debug('Returning cached context analysis');
			return this.analysisCache.get(cacheKey)!;
		}

		// Analyze file types
		const affectedFileTypes = this.extractFileTypes(affectedFiles);

		// Analyze import patterns (for files we can read)
		const importPatterns = await this.extractImportPatterns(affectedFiles);

		// Analyze architectural patterns
		const architecturalPatterns = this.detectArchitecturalPatterns(affectedFiles, importPatterns);

		// Detect technology stack
		const technologyStack = this.detectTechnologyStack(affectedFiles, importPatterns);

		// Detect infrastructure components
		const infrastructureComponents = this.detectInfrastructureComponents(affectedFiles);

		const context: CodebaseContext = {
			affectedFileTypes,
			architecturalPatterns,
			importPatterns,
			infrastructureComponents,
			technologyStack
		};

		// Cache the result
		this.analysisCache.set(cacheKey, context);

		this.logger.debug('Context analysis complete', {
			architecturalPatterns: architecturalPatterns.length,
			fileTypes: affectedFileTypes.length,
			importPatterns: importPatterns.length,
			infrastructureComponents: infrastructureComponents.length,
			technologyStack: technologyStack.length
		});

		return context;
	}

	/**
	 * Extract file extensions and types from affected files
	 */
	private extractFileTypes(filePaths: string[]): string[] {
		// Map file paths to extensions and flatten into a single set
		const extensions = new Set(
			filePaths.flatMap((filePath) => {
				const results: string[] = [];

				// Handle compound extensions like .d.ts
				let ext = path.extname(filePath).toLowerCase();
				if (filePath.toLowerCase().endsWith('.d.ts')) {
					ext = '.d.ts';
				}

				if (ext) {
					results.push(ext);
				}

				// Also detect special file types
				const fileName = path.basename(filePath).toLowerCase();
				if (fileName === 'dockerfile') {
					results.push('dockerfile');
				} else if (fileName.match(/\.tf$/)) {
					results.push('.tf');
				} else if (fileName.match(/\.(yml|yaml)$/)) {
					results.push('.yaml');
				}

				return results;
			})
		);

		return Array.from(extensions).sort();
	}

	/**
	 * Extract import patterns from readable files
	 */
	private async extractImportPatterns(filePaths: string[]): Promise<string[]> {
		// Only analyze readable text files
		const readableFiles = filePaths.filter(
			(file) => file.match(/\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/) ?? file.match(/\.(json|md|txt)$/)
		);

		// Read files in parallel and extract imports
		const importResults = await Promise.all(
			readableFiles.slice(0, 10).map(async (filePath) => {
				try {
					const content = await readFile(filePath);
					return this.extractImportsFromContent(content);
				} catch (error) {
					this.logger.debug(`Could not read file for import analysis: ${filePath}`, {
						error: (error as Error).message
					});
					return [];
				}
			})
		);

		// Flatten and deduplicate imports
		const patterns = new Set(importResults.flat());
		return Array.from(patterns).sort();
	}

	/**
	 * Extract import statements from file content
	 */
	private extractImportsFromContent(content: string): string[] {
		// Match various import patterns
		const patterns = [
			// ES6 imports
			/import\s+{[^}]*}\s+from\s+['"]([^'"]+)['"]/g,
			/import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g,
			/import\s+\w+\s+from\s+['"]([^'"]+)['"]/g,
			// Dynamic imports
			/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
			// Require statements
			/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
			/const\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
			/const\s+{\s*[^}]*\s*}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
		];

		// Extract all matches from all patterns
		const imports = patterns.flatMap((pattern) => {
			const matches = Array.from(content.matchAll(pattern));
			return matches
				.map((match) => {
					const importPath = match[1];
					if (!importPath) return null;

					// Extract package name (handle scoped packages properly)
					let packageName: string | undefined;
					if (importPath.startsWith('@')) {
						// For scoped packages like @prisma/client, extract @scope/package
						const parts = importPath.split('/');
						if (parts.length >= 2) {
							packageName = `${parts[0]}/${parts[1]}`;
						} else {
							packageName = parts[0];
						}
					} else {
						// For regular packages, take just the first part
						packageName = importPath.split('/')[0];
					}

					return packageName && !packageName.startsWith('.') ? packageName : null;
				})
				.filter((pkg): pkg is string => pkg !== null);
		});

		return imports;
	}

	/**
	 * Detect architectural patterns from files and imports
	 */
	private detectArchitecturalPatterns(filePaths: string[], importPatterns: string[]): string[] {
		const patterns: string[] = [];

		// Framework detection
		const frameworkPatterns = {
			angular: ['@angular/core'],
			express: ['express'],
			fastify: ['fastify'],
			koa: ['koa'],
			nestjs: ['@nestjs/core', '@nestjs/common'],
			react: ['react', 'react-dom', 'next'],
			svelte: ['svelte'],
			vue: ['vue', 'nuxt']
		};

		// Extract frameworks using functional pattern
		const detectedFrameworks = Object.entries(frameworkPatterns)
			.filter(([, packages]) => packages.some((pkg) => importPatterns.includes(pkg)))
			.map(([framework]) => framework);
		patterns.push(...detectedFrameworks);

		// Architecture pattern detection from file structure
		const filePatterns = {
			cleanArchitecture: filePaths.some((f) => f.includes('usecase') || f.includes('interactor')),
			cqrs: filePaths.some((f) => f.includes('command') || f.includes('query')),
			ddd: filePaths.some(
				(f) =>
					f.includes('domain') ||
					f.includes('entity') ||
					f.includes('aggregate') ||
					f.includes('repositories') ||
					f.includes('repository') ||
					(f.includes('service') && f.includes('controller'))
			),
			eventDriven: filePaths.some((f) => f.includes('event') || f.includes('pubsub')),
			hexagonal: filePaths.some((f) => f.includes('adapter') || f.includes('port')),
			microservices: filePaths.some((f) => f.includes('service') || f.includes('microservice')),
			monolithic: filePaths.some((f) => f.includes('app') || f.includes('main'))
		};

		// Extract file-based patterns using functional pattern
		const detectedPatterns = Object.entries(filePatterns)
			.filter(([, detected]) => detected)
			.map(([pattern]) => pattern);
		patterns.push(...detectedPatterns);

		return patterns;
	}

	/**
	 * Detect technology stack from files and imports
	 */
	private detectTechnologyStack(filePaths: string[], importPatterns: string[]): string[] {
		const technologies: string[] = [];

		// Language detection
		const hasTypeScript = filePaths.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
		const hasJavaScript = filePaths.some((f) => f.endsWith('.js') || f.endsWith('.jsx'));

		if (hasTypeScript) technologies.push('typescript');
		if (hasJavaScript) technologies.push('javascript');

		// Database detection
		const databasePatterns = {
			mongodb: ['mongodb', 'mongoose'],
			mysql: ['mysql', 'mysql2'],
			postgresql: ['pg', 'postgres', 'postgresql'],
			prisma: ['@prisma/client'],
			redis: ['redis', 'ioredis'],
			typeorm: ['typeorm']
		};

		// Detect databases using functional pattern
		const detectedDatabases = Object.entries(databasePatterns)
			.filter(([, packages]) => packages.some((pkg) => importPatterns.includes(pkg)))
			.map(([db]) => db);
		technologies.push(...detectedDatabases);

		// Web framework detection
		const webFrameworkPatterns = {
			angular: ['@angular/core', '@angular/common'],
			express: ['express'],
			fastify: ['fastify'],
			hapi: ['@hapi/hapi', 'hapi'],
			koa: ['koa'],
			meteor: ['meteor'],
			nestjs: ['@nestjs/core', '@nestjs/common'],
			react: ['react', 'react-dom', 'next'],
			svelte: ['svelte'],
			vue: ['vue', 'nuxt']
		};

		// Detect web frameworks using functional pattern
		const detectedWebFrameworks = Object.entries(webFrameworkPatterns)
			.filter(([, packages]) => packages.some((pkg) => importPatterns.includes(pkg)))
			.map(([framework]) => framework);
		technologies.push(...detectedWebFrameworks);

		// Testing framework detection
		const testingPatterns = {
			cypress: ['cypress'],
			jest: ['jest', '@types/jest', '@jest/globals'],
			playwright: ['@playwright/test'],
			vitest: ['vitest']
		};

		// Detect testing frameworks using functional pattern
		const detectedTestingFrameworks = Object.entries(testingPatterns)
			.filter(([, packages]) => packages.some((pkg) => importPatterns.includes(pkg)))
			.map(([framework]) => framework);
		technologies.push(...detectedTestingFrameworks);

		// Build tool detection
		const buildPatterns = {
			esbuild: ['esbuild'],
			swc: ['@swc/core'],
			tsup: ['tsup'],
			vite: ['vite'],
			webpack: ['webpack']
		};

		// Detect build tools using functional pattern
		const detectedBuildTools = Object.entries(buildPatterns)
			.filter(([, packages]) => packages.some((pkg) => importPatterns.includes(pkg)))
			.map(([tool]) => tool);
		technologies.push(...detectedBuildTools);

		return technologies;
	}

	/**
	 * Detect infrastructure components from file paths
	 */
	private detectInfrastructureComponents(filePaths: string[]): string[] {
		const infrastructurePatterns = {
			aws: filePaths.some((f) => f.includes('aws') || f.includes('ec2') || f.includes('s3')),
			azure: filePaths.some((f) => f.includes('azure') || f.includes('azurerm')),
			ci: filePaths.some((f) => f.includes('.github/workflows') || f.includes('ci') || f.includes('pipeline')),
			docker: filePaths.some((f) => f.toLowerCase().includes('docker')),
			gcp: filePaths.some((f) => f.includes('gcp') || f.includes('google')),
			kubernetes: filePaths.some((f) => f.includes('.yaml') || f.includes('.yml')),
			logging: filePaths.some((f) => f.includes('elk') || f.includes('elasticsearch')),
			monitoring: filePaths.some((f) => f.includes('prometheus') || f.includes('grafana')),
			terraform: filePaths.some((f) => f.endsWith('.tf'))
		};

		// Extract detected components using functional pattern
		return Object.entries(infrastructurePatterns)
			.filter(([, detected]) => detected)
			.map(([component]) => component);
	}

	/**
	 * Analyse a complete task context including affected files and dependencies
	 */
	async analyzeTaskContext(taskContext: TaskContext): Promise<CodebaseContext> {
		return this.doAnalyzeContext(taskContext);
	}

	/**
	 * Clear the analysis cache
	 */
	clearCache(): void {
		this.analysisCache.clear();
		this.logger.debug('Context analysis cache cleared');
	}

	/**
	 * Get cache size for monitoring
	 */
	getCacheSize(): number {
		return this.analysisCache.size;
	}
}
