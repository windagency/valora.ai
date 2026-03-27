/**
 * Language Map Tests
 */

import { describe, expect, it } from 'vitest';

import {
	getGrammarWasmFile,
	getLanguageForExtension,
	getSupportedExtensions,
	getSupportedLanguages,
	isSupportedExtension
} from './language-map';

describe('Language Map', () => {
	describe('getLanguageForExtension', () => {
		it('should map .ts to typescript', () => {
			expect(getLanguageForExtension('.ts')).toBe('typescript');
		});

		it('should map .tsx to typescript', () => {
			expect(getLanguageForExtension('.tsx')).toBe('typescript');
		});

		it('should map .js to javascript', () => {
			expect(getLanguageForExtension('.js')).toBe('javascript');
		});

		it('should map .py to python', () => {
			expect(getLanguageForExtension('.py')).toBe('python');
		});

		it('should map .go to go', () => {
			expect(getLanguageForExtension('.go')).toBe('go');
		});

		it('should map .rs to rust', () => {
			expect(getLanguageForExtension('.rs')).toBe('rust');
		});

		it('should map .java to java', () => {
			expect(getLanguageForExtension('.java')).toBe('java');
		});

		it('should return null for unsupported extensions', () => {
			expect(getLanguageForExtension('.txt')).toBeNull();
			expect(getLanguageForExtension('.html')).toBeNull();
			expect(getLanguageForExtension('.css')).toBeNull();
		});

		it('should handle case-insensitive extensions', () => {
			expect(getLanguageForExtension('.TS')).toBe('typescript');
			expect(getLanguageForExtension('.PY')).toBe('python');
		});
	});

	describe('getGrammarWasmFile', () => {
		it('should return correct WASM file for typescript', () => {
			expect(getGrammarWasmFile('typescript')).toBe('tree-sitter-typescript.wasm');
		});

		it('should return correct WASM file for python', () => {
			expect(getGrammarWasmFile('python')).toBe('tree-sitter-python.wasm');
		});
	});

	describe('getSupportedExtensions', () => {
		it('should include all major extensions', () => {
			const exts = getSupportedExtensions();
			expect(exts).toContain('.ts');
			expect(exts).toContain('.tsx');
			expect(exts).toContain('.js');
			expect(exts).toContain('.py');
			expect(exts).toContain('.go');
			expect(exts).toContain('.rs');
			expect(exts).toContain('.java');
		});
	});

	describe('isSupportedExtension', () => {
		it('should return true for supported extensions', () => {
			expect(isSupportedExtension('.ts')).toBe(true);
			expect(isSupportedExtension('.py')).toBe(true);
		});

		it('should return false for unsupported extensions', () => {
			expect(isSupportedExtension('.txt')).toBe(false);
			expect(isSupportedExtension('.md')).toBe(false);
		});
	});

	describe('getSupportedLanguages', () => {
		it('should return all 6 supported languages', () => {
			const langs = getSupportedLanguages();
			expect(langs).toContain('typescript');
			expect(langs).toContain('javascript');
			expect(langs).toContain('python');
			expect(langs).toContain('go');
			expect(langs).toContain('rust');
			expect(langs).toContain('java');
		});
	});
});
