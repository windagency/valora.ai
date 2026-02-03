/**
 * Integration tests for TemplateLoader
 * Tests actual template file loading from filesystem
 */

import { describe, it, expect } from 'vitest';

import { getTemplateLoader, resetTemplateLoader } from './template-loader';

describe('TemplateLoader Integration Tests', () => {
	describe('loadTemplate with actual file', () => {
		it('should load GUIDED_COMPLETION template from filesystem', async () => {
			const loader = getTemplateLoader();
			const template = await loader.loadTemplate('GUIDED_COMPLETION');

			// Verify template was loaded
			expect(template).toBeTruthy();
			expect(template.length).toBeGreaterThan(0);

			// Verify template contains expected sections
			expect(template).toContain('CURSOR GUIDED COMPLETION MODE');
			expect(template).toContain('SYSTEM INSTRUCTIONS');
			expect(template).toContain('USER PROMPT');
			expect(template).toContain('GENERATION PARAMETERS');
			expect(template).toContain('YOUR RESPONSE BELOW');

			// Verify template has placeholders
			expect(template).toContain('{{systemPrompt}}');
			expect(template).toContain('{{userPrompt}}');
			expect(template).toContain('{{model}}');
			expect(template).toContain('{{maxTokens}}');
			expect(template).toContain('{{temperature}}');
		});

		it('should cache template on subsequent loads', async () => {
			resetTemplateLoader(); // Start fresh

			const loader = getTemplateLoader();

			// First load
			const start1 = Date.now();
			const template1 = await loader.loadTemplate('GUIDED_COMPLETION');
			const duration1 = Date.now() - start1;

			// Second load (from cache, should be faster)
			const start2 = Date.now();
			const template2 = await loader.loadTemplate('GUIDED_COMPLETION');
			const duration2 = Date.now() - start2;

			// Both should be identical
			expect(template1).toBe(template2);

			// Cached load should be significantly faster (or at least not slower)
			// Note: This might be flaky in CI, but it demonstrates caching
			expect(duration2).toBeLessThanOrEqual(duration1 + 5); // Allow 5ms tolerance
		});

		it('should throw error for non-existent template', async () => {
			const loader = getTemplateLoader();

			await expect(loader.loadTemplate('NON_EXISTENT_TEMPLATE')).rejects.toThrow();
		});
	});

	describe('renderTemplate with actual file', () => {
		it('should load and populate GUIDED_COMPLETION template', async () => {
			const loader = getTemplateLoader();

			const result = await loader.renderTemplate('GUIDED_COMPLETION', {
				maxTokens: 4096,
				model: 'claude-sonnet-4.5',
				systemPrompt: 'You are a helpful assistant specialized in code review.',
				temperature: '0.7',
				userPrompt: 'Please review this authentication implementation.'
			});

			// Verify template was populated
			expect(result).toContain('claude-sonnet-4.5');
			expect(result).toContain('4096');
			expect(result).toContain('0.7');
			expect(result).toContain('helpful assistant specialized in code review');
			expect(result).toContain('review this authentication implementation');

			// Verify placeholders were replaced
			expect(result).not.toContain('{{systemPrompt}}');
			expect(result).not.toContain('{{userPrompt}}');
			expect(result).not.toContain('{{model}}');
			expect(result).not.toContain('{{maxTokens}}');
			expect(result).not.toContain('{{temperature}}');

			// Verify structure is maintained
			expect(result).toContain('CURSOR GUIDED COMPLETION MODE');
			expect(result).toContain('SYSTEM INSTRUCTIONS');
			expect(result).toContain('USER PROMPT');
		});

		it('should handle multi-line system prompts', async () => {
			const loader = getTemplateLoader();

			const multiLineSystemPrompt =
				'You are a senior engineer.\n\n' +
				'Your responsibilities include:\n' +
				'1. Code review\n' +
				'2. Architecture decisions\n' +
				'3. Mentoring';

			const result = await loader.renderTemplate('GUIDED_COMPLETION', {
				maxTokens: 2000,
				model: 'gpt-5',
				systemPrompt: multiLineSystemPrompt,
				temperature: '0.8',
				userPrompt: 'Design a microservices architecture'
			});

			// All lines should be present
			expect(result).toContain('senior engineer');
			expect(result).toContain('Code review');
			expect(result).toContain('Architecture decisions');
			expect(result).toContain('Mentoring');
			expect(result).toContain('microservices architecture');
		});

		it('should handle special characters in prompts', async () => {
			const loader = getTemplateLoader();

			const result = await loader.renderTemplate('GUIDED_COMPLETION', {
				maxTokens: 1000,
				model: 'test-model',
				systemPrompt: 'Handle $pecial ch@racters & symbols!',
				temperature: '0.5',
				userPrompt: 'Test with <tags> and {braces} and [brackets]'
			});

			// Special characters should be preserved
			expect(result).toContain('$pecial ch@racters & symbols!');
			expect(result).toContain('<tags>');
			expect(result).toContain('{braces}');
			expect(result).toContain('[brackets]');
		});
	});

	describe('End-to-end template workflow', () => {
		it('should complete full workflow: load -> populate -> verify output', async () => {
			const loader = getTemplateLoader();

			// Step 1: Load template
			const template = await loader.loadTemplate('GUIDED_COMPLETION');
			expect(template).toContain('{{systemPrompt}}');

			// Step 2: Populate with realistic data
			const variables = {
				maxTokens: 4096,
				model: 'claude-sonnet-4.5 (default)',
				systemPrompt:
					'You are a Product Manager specialized in requirements gathering.\n\n' +
					'Your expertise includes user story creation and backlog management.',
				temperature: '0.7 (default)',
				userPrompt: 'Refine specifications for user authentication with OAuth2'
			};

			const result = await loader.renderTemplate('GUIDED_COMPLETION', variables);

			// Step 3: Verify output structure
			expect(result).toContain('CURSOR GUIDED COMPLETION MODE');
			expect(result).toContain('Zero Config!');

			// Step 4: Verify all variables were replaced
			Object.keys(variables).forEach((key) => {
				expect(result).not.toContain(`{{${key}}}`);
			});

			// Step 5: Verify content is present
			expect(result).toContain('Product Manager');
			expect(result).toContain('OAuth2');
			expect(result).toContain('claude-sonnet-4.5');

			// Step 6: Verify output is ready for Cursor AI
			expect(result).toContain('YOUR RESPONSE BELOW');
			expect(result.length).toBeGreaterThan(500); // Should be substantial
		});
	});
});
