/**
 * Tests for error message templates
 */

import { describe, expect, it } from 'vitest';

import { getErrorCodes, getErrorMessage, hasErrorMessage } from './error-messages';

describe('Error Messages', () => {
	describe('getErrorMessage', () => {
		it('should return error template for valid code', () => {
			const template = getErrorMessage('CONFIGURATION_NOT_FOUND');
			expect(template).toBeDefined();
			expect(template?.title).toBe('Configuration Not Found');
			expect(template?.fixes).toBeInstanceOf(Array);
			expect(template?.fixes.length).toBeGreaterThan(0);
		});

		it('should return undefined for invalid code', () => {
			const template = getErrorMessage('INVALID_CODE');
			expect(template).toBeUndefined();
		});
	});

	describe('hasErrorMessage', () => {
		it('should return true for valid error code', () => {
			expect(hasErrorMessage('CONFIGURATION_NOT_FOUND')).toBe(true);
			expect(hasErrorMessage('API_RATE_LIMIT')).toBe(true);
		});

		it('should return false for invalid error code', () => {
			expect(hasErrorMessage('INVALID_CODE')).toBe(false);
		});
	});

	describe('getErrorCodes', () => {
		it('should return array of error codes', () => {
			const codes = getErrorCodes();
			expect(codes).toBeInstanceOf(Array);
			expect(codes.length).toBeGreaterThan(0);
		});

		it('should include known error codes', () => {
			const codes = getErrorCodes();
			expect(codes).toContain('CONFIGURATION_NOT_FOUND');
			expect(codes).toContain('API_RATE_LIMIT');
			expect(codes).toContain('NETWORK_CONNECTION_FAILED');
		});
	});

	describe('Error Template Structure', () => {
		it('all templates should have required fields', () => {
			const codes = getErrorCodes();

			codes.forEach((code) => {
				const template = getErrorMessage(code);
				expect(template).toBeDefined();
				expect(template?.title).toBeTruthy();
				expect(template?.message).toBeTruthy();
				expect(template?.fixes).toBeInstanceOf(Array);
				expect(template?.fixes.length).toBeGreaterThan(0);
			});
		});

		it('all templates should have actionable fixes', () => {
			const codes = getErrorCodes();

			codes.forEach((code) => {
				const template = getErrorMessage(code);
				expect(template?.fixes.every((fix) => fix.length > 10)).toBe(true);
			});
		});
	});
});
