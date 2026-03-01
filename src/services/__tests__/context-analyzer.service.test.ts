/**
 * Unit tests for ContextAnalyzerService service
 *
 * Tests the codebase context analysis functionality, including:
 * - File type extraction
 * - Import pattern analysis
 * - Architectural pattern detection
 * - Technology stack identification
 * - Infrastructure component detection
 */

import { ContextAnalyzerService } from 'services/context-analyzer.service';
import { readFile } from 'utils/file-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock file utilities
vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return {
		...actual,
		listFiles: vi.fn(),
		readFile: vi.fn(),
		resolveAIPath: vi.fn(() => '/mock/path')
	};
});

const mockReadFile = vi.mocked(readFile);

describe('ContextAnalyzerService', () => {
	let analyzer: ContextAnalyzerService;

	beforeEach(() => {
		vi.clearAllMocks();
		analyzer = new ContextAnalyzerService();
	});

	describe('analyzeContext', () => {
		it('should analyze file types correctly', async () => {
			const affectedFiles = [
				'src/component.tsx',
				'src/service.ts',
				'src/styles.css',
				'infrastructure/main.tf',
				'k8s/deployment.yaml',
				'Dockerfile'
			];

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context.affectedFileTypes).toContain('.tsx');
			expect(context.affectedFileTypes).toContain('.ts');
			expect(context.affectedFileTypes).toContain('.css');
			expect(context.affectedFileTypes).toContain('.tf');
			expect(context.affectedFileTypes).toContain('.yaml');
			expect(context.affectedFileTypes).toContain('dockerfile');
		});

		it('should extract import patterns from readable files', async () => {
			const affectedFiles = ['src/component.tsx', 'src/service.ts'];
			const mockContent1 = `
				import React from 'react';
				import { useState } from 'react';
				import { UserService } from './userService';
			`;
			const mockContent2 = `
				import express from 'express';
				import { PrismaClient } from '@prisma/client';
				require('dotenv');
			`;

			mockReadFile.mockResolvedValueOnce(mockContent1).mockResolvedValueOnce(mockContent2);

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context.importPatterns).toContain('react');
			expect(context.importPatterns).toContain('express');
			expect(context.importPatterns).toContain('@prisma/client');
			expect(context.importPatterns).toContain('dotenv');
			expect(context.importPatterns).not.toContain('./userService'); // Local imports excluded
		});

		it('should detect architectural patterns', async () => {
			const affectedFiles = [
				'src/services/userService.ts',
				'src/controllers/userController.ts',
				'src/repositories/userRepository.ts'
			];

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context.architecturalPatterns).toContain('ddd'); // Domain-driven design
		});

		it('should identify technology stack', async () => {
			const affectedFiles = ['src/component.tsx', 'src/service.ts'];
			const mockContent = `
				import React from 'react';
				import { PrismaClient } from '@prisma/client';
				import express from 'express';
				import { jest } from '@types/jest';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context.technologyStack).toContain('react');
			expect(context.technologyStack).toContain('prisma');
			expect(context.technologyStack).toContain('express');
			expect(context.technologyStack).toContain('jest');
			expect(context.technologyStack).toContain('typescript');
		});

		it('should detect infrastructure components', async () => {
			const affectedFiles = ['infrastructure/main.tf', 'k8s/deployment.yaml', 'Dockerfile', '.github/workflows/ci.yml'];

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context.infrastructureComponents).toContain('terraform');
			expect(context.infrastructureComponents).toContain('kubernetes');
			expect(context.infrastructureComponents).toContain('docker');
			expect(context.infrastructureComponents).toContain('ci');
		});

		it('should handle file read errors gracefully', async () => {
			const affectedFiles = ['src/component.tsx'];
			mockReadFile.mockRejectedValue(new Error('File not found'));

			const context = await analyzer.analyzeContext(affectedFiles);

			expect(context).toBeDefined();
			expect(context.affectedFileTypes).toContain('.tsx');
		});

		it('should cache analysis results', async () => {
			const affectedFiles = ['src/component.tsx'];
			mockReadFile.mockResolvedValue("import React from 'react';");

			// First call
			const context1 = await analyzer.analyzeContext(affectedFiles);
			expect(mockReadFile).toHaveBeenCalledTimes(1);

			// Second call with same files should use cache
			const context2 = await analyzer.analyzeContext(affectedFiles);
			expect(mockReadFile).toHaveBeenCalledTimes(1); // Still 1 call

			expect(context1).toEqual(context2);
		});
	});

	describe('file type extraction', () => {
		it('should extract TypeScript extensions', async () => {
			const files = ['src/file.ts', 'src/file.tsx', 'src/file.d.ts'];
			const context = await analyzer.analyzeContext(files);

			expect(context.affectedFileTypes).toEqual(['.d.ts', '.ts', '.tsx']);
		});

		it('should extract infrastructure file types', async () => {
			const files = ['infra/main.tf', 'k8s/deploy.yaml', 'Dockerfile'];
			const context = await analyzer.analyzeContext(files);

			expect(context.affectedFileTypes).toContain('.tf');
			expect(context.affectedFileTypes).toContain('.yaml');
			expect(context.affectedFileTypes).toContain('dockerfile');
		});

		it('should handle mixed file types', async () => {
			const files = ['src/app.js', 'src/app.css', 'README.md', 'package.json'];
			const context = await analyzer.analyzeContext(files);

			expect(context.affectedFileTypes).toContain('.js');
			expect(context.affectedFileTypes).toContain('.css');
			expect(context.affectedFileTypes).toContain('.md');
			expect(context.affectedFileTypes).toContain('.json');
		});
	});

	describe('import pattern extraction', () => {
		it('should extract ES6 import statements', async () => {
			const files = ['src/component.tsx'];
			const mockContent = `
				import React from 'react';
				import { useState, useEffect } from 'react';
				import * as utils from './utils';
				import type { User } from '../types/user';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.importPatterns).toContain('react');
			expect(context.importPatterns).not.toContain('./utils');
			expect(context.importPatterns).not.toContain('../types/user');
		});

		it('should extract CommonJS require statements', async () => {
			const files = ['src/service.js'];
			const mockContent = `
				const express = require('express');
				const { PrismaClient } = require('@prisma/client');
				const utils = require('./utils');
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.importPatterns).toContain('express');
			expect(context.importPatterns).toContain('@prisma/client');
			expect(context.importPatterns).not.toContain('./utils');
		});

		it('should extract dynamic imports', async () => {
			const files = ['src/lazy.ts'];
			const mockContent = `
				import('./lazy-component').then(module => {});
				const component = await import('react-component');
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.importPatterns).toContain('react-component');
		});

		it('should deduplicate import patterns', async () => {
			const files = ['src/file1.ts', 'src/file2.ts'];
			const mockContent1 = "import React from 'react';";
			const mockContent2 = "import { Component } from 'react';";

			mockReadFile.mockResolvedValueOnce(mockContent1).mockResolvedValueOnce(mockContent2);

			const context = await analyzer.analyzeContext(files);

			const reactCount = context.importPatterns.filter((p) => p === 'react').length;
			expect(reactCount).toBe(1);
		});

		it('should limit files analyzed for performance', async () => {
			const files = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
			const mockContent = "import React from 'react';";

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			// Should only analyze first 10 files
			expect(mockReadFile).toHaveBeenCalledTimes(10);
			expect(context.importPatterns).toContain('react');
		});
	});

	describe('architectural pattern detection', () => {
		it('should detect framework patterns', async () => {
			const files = ['src/app.ts'];
			const mockContent = `
				import { NestFactory } from '@nestjs/core';
				import express from 'express';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.architecturalPatterns).toContain('nestjs');
			expect(context.architecturalPatterns).toContain('express');
		});

		it('should detect DDD patterns from file structure', async () => {
			const files = [
				'src/domain/entities/user.ts',
				'src/domain/repositories/userRepository.ts',
				'src/application/services/userService.ts'
			];

			const context = await analyzer.analyzeContext(files);

			expect(context.architecturalPatterns).toContain('ddd');
		});

		it('should detect CQRS patterns', async () => {
			const files = ['src/commands/createUser.ts', 'src/queries/getUser.ts'];

			const context = await analyzer.analyzeContext(files);

			expect(context.architecturalPatterns).toContain('cqrs');
		});

		it('should detect microservices patterns', async () => {
			const files = ['src/services/user-service/index.ts', 'src/services/order-service/index.ts'];

			const context = await analyzer.analyzeContext(files);

			expect(context.architecturalPatterns).toContain('microservices');
		});
	});

	describe('technology stack detection', () => {
		it('should detect TypeScript usage', async () => {
			const files = ['src/file.ts'];
			const context = await analyzer.analyzeContext(files);

			expect(context.technologyStack).toContain('typescript');
		});

		it('should detect JavaScript usage', async () => {
			const files = ['src/file.js'];
			const context = await analyzer.analyzeContext(files);

			expect(context.technologyStack).toContain('javascript');
		});

		it('should detect database technologies', async () => {
			const files = ['src/db.ts'];
			const mockContent = `
				import { PrismaClient } from '@prisma/client';
				import mongoose from 'mongoose';
				import { createClient } from 'redis';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.technologyStack).toContain('prisma');
			expect(context.technologyStack).toContain('mongodb');
			expect(context.technologyStack).toContain('redis');
		});

		it('should detect testing frameworks', async () => {
			const files = ['test/file.test.ts'];
			const mockContent = `
				import { describe, it, expect } from 'vitest';
				import { jest } from '@jest/globals';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.technologyStack).toContain('vitest');
			expect(context.technologyStack).toContain('jest');
		});

		it('should detect build tools', async () => {
			const files = ['build.ts'];
			const mockContent = `
				import { build } from 'esbuild';
				import webpack from 'webpack';
			`;

			mockReadFile.mockResolvedValue(mockContent);

			const context = await analyzer.analyzeContext(files);

			expect(context.technologyStack).toContain('esbuild');
			expect(context.technologyStack).toContain('webpack');
		});
	});

	describe('infrastructure component detection', () => {
		it('should detect cloud platforms', async () => {
			const files = ['infra/aws/main.tf', 'infra/gcp/deploy.yaml'];
			const context = await analyzer.analyzeContext(files);

			expect(context.infrastructureComponents).toContain('aws');
			expect(context.infrastructureComponents).toContain('gcp');
		});

		it('should detect containerization', async () => {
			const files = ['Dockerfile', 'docker-compose.yml'];
			const context = await analyzer.analyzeContext(files);

			expect(context.infrastructureComponents).toContain('docker');
		});

		it('should detect CI/CD', async () => {
			const files = ['.github/workflows/ci.yml', '.gitlab-ci.yml'];
			const context = await analyzer.analyzeContext(files);

			expect(context.infrastructureComponents).toContain('ci');
		});

		it('should detect monitoring', async () => {
			const files = ['monitoring/prometheus.yml', 'grafana/dashboards.json'];
			const context = await analyzer.analyzeContext(files);

			expect(context.infrastructureComponents).toContain('monitoring');
		});
	});

	describe('caching', () => {
		it('should cache analysis results by file hash', async () => {
			const files1 = ['src/file1.ts', 'src/file2.ts'];
			const files2 = ['src/file1.ts', 'src/file2.ts']; // Same files
			const files3 = ['src/file1.ts', 'src/file3.ts']; // Different files

			mockReadFile.mockResolvedValue("import React from 'react';");

			await analyzer.analyzeContext(files1);
			await analyzer.analyzeContext(files2); // Should use cache
			await analyzer.analyzeContext(files3); // Should not use cache

			expect(mockReadFile).toHaveBeenCalledTimes(4); // files1 (2 files) + files3 (2 files), files2 uses cache
		});

		it('should clear cache when requested', async () => {
			const files = ['src/file.ts'];
			mockReadFile.mockResolvedValue("import React from 'react';");

			await analyzer.analyzeContext(files);
			expect(analyzer.getCacheSize()).toBe(1);

			analyzer.clearCache();
			expect(analyzer.getCacheSize()).toBe(0);
		});

		it('should report cache size', async () => {
			const files1 = ['src/file1.ts'];
			const files2 = ['src/file2.ts'];

			mockReadFile.mockResolvedValue("import React from 'react';");

			await analyzer.analyzeContext(files1);
			await analyzer.analyzeContext(files2);

			expect(analyzer.getCacheSize()).toBe(2);
		});
	});

	describe('error handling', () => {
		it('should handle file read failures gracefully', async () => {
			const files = ['src/component.tsx'];
			mockReadFile.mockRejectedValue(new Error('Permission denied'));

			const context = await analyzer.analyzeContext(files);

			expect(context).toBeDefined();
			expect(context.affectedFileTypes).toContain('.tsx');
			expect(context.importPatterns).toEqual([]);
		});

		it('should handle empty file list', async () => {
			const context = await analyzer.analyzeContext([]);

			expect(context.affectedFileTypes).toEqual([]);
			expect(context.importPatterns).toEqual([]);
			expect(context.architecturalPatterns).toEqual([]);
			expect(context.technologyStack).toEqual([]);
			expect(context.infrastructureComponents).toEqual([]);
		});

		it('should handle files with no extensions', async () => {
			const files = ['Dockerfile', 'Makefile', 'README'];
			const context = await analyzer.analyzeContext(files);

			expect(context.affectedFileTypes).toContain('dockerfile');
			expect(context.affectedFileTypes).toHaveLength(1);
		});
	});
});
