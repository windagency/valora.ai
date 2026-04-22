// tests/integration/analysis/codebase-map.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it, afterEach } from 'vitest';

import { ASTIndexService } from 'ast/ast-index.service';
import { CodebaseGraphBuilder } from 'analysis/codebase-graph.builder';
import { DocumentationRenderer } from 'analysis/documentation.renderer';
import { DocumentationService } from 'analysis/documentation.service';

describe('DocumentationService integration', () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('generates index.md and at least one module file from real src/', async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-map-'));
		const projectRoot = path.resolve(__dirname, '../../../');
		const astIndex = new ASTIndexService(projectRoot);
		const builder = new CodebaseGraphBuilder(astIndex, projectRoot);
		const service = new DocumentationService(builder, new DocumentationRenderer(), tmpDir);

		await service.generate({ includeSymbols: false });

		const indexPath = path.join(tmpDir, 'index.md');
		expect(fs.existsSync(indexPath)).toBe(true);

		const indexContent = fs.readFileSync(indexPath, 'utf-8');
		expect(indexContent).toContain('```mermaid');
		expect(indexContent).toContain('graph LR');

		const moduleFiles = fs.readdirSync(tmpDir).filter((f) => f !== 'index.md');
		expect(moduleFiles.length).toBeGreaterThan(0);

		const firstModule = fs.readFileSync(path.join(tmpDir, moduleFiles[0]!), 'utf-8');
		expect(firstModule).toContain('# Module:');
	}, 60_000);
});
