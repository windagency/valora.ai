/**
 * LSP Language Registry Tests
 */

import { describe, expect, it, afterEach } from 'vitest';

import { getAllServers, getServerForFile, getServerForLanguage, resetLanguageRegistry } from './lsp-language-registry';

describe('LSP Language Registry', () => {
	afterEach(() => {
		resetLanguageRegistry();
	});

	describe('getServerForFile', () => {
		it('should return typescript-language-server config for .ts files', () => {
			const config = getServerForFile('src/foo.ts');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('typescript-language-server');
			expect(config!.args).toEqual(['--stdio']);
		});

		it('should return typescript-language-server config for .tsx files', () => {
			const config = getServerForFile('src/App.tsx');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('typescript-language-server');
		});

		it('should return typescript-language-server config for .js files', () => {
			const config = getServerForFile('index.js');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('typescript-language-server');
		});

		it('should return pyright config for .py files', () => {
			const config = getServerForFile('main.py');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('pyright-langserver');
		});

		it('should return gopls config for .go files', () => {
			const config = getServerForFile('main.go');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('gopls');
		});

		it('should return rust-analyzer config for .rs files', () => {
			const config = getServerForFile('main.rs');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('rust-analyzer');
		});

		it('should return null for unsupported file types', () => {
			expect(getServerForFile('readme.md')).toBeNull();
			expect(getServerForFile('styles.css')).toBeNull();
			expect(getServerForFile('config.yaml')).toBeNull();
		});
	});

	describe('getServerForLanguage', () => {
		it('should return config for typescript', () => {
			const config = getServerForLanguage('typescript');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('typescript-language-server');
		});

		it('should return config for python', () => {
			const config = getServerForLanguage('python');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('pyright-langserver');
		});

		it('should return config for go', () => {
			const config = getServerForLanguage('go');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('gopls');
		});

		it('should return config for rust', () => {
			const config = getServerForLanguage('rust');
			expect(config).not.toBeNull();
			expect(config!.command).toBe('rust-analyzer');
		});
	});

	describe('getAllServers', () => {
		it('should return all default server configurations', () => {
			const servers = getAllServers();
			expect(Object.keys(servers).length).toBeGreaterThanOrEqual(4);
			expect(servers['typescript-language-server']).toBeDefined();
			expect(servers['pyright-langserver']).toBeDefined();
			expect(servers['gopls']).toBeDefined();
			expect(servers['rust-analyzer']).toBeDefined();
		});
	});
});
