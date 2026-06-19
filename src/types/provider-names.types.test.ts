/**
 * Tests for the ProviderName branded type and BuiltinProviders constants
 */

import { describe, expect, it } from 'vitest';

import { BuiltinProviders, providerName, type ProviderName } from './provider-names.types';

describe('providerName branded type factory', () => {
	it('returns a value that equals the underlying string', () => {
		const result = providerName('anthropic');
		expect(result).toBe('anthropic');
	});

	it('accepts a plugin-contributed name and equals the given string', () => {
		const plugin: ProviderName = providerName('my-plugin');
		expect(plugin).toBe('my-plugin');
	});
});

describe('BuiltinProviders constants', () => {
	it('ANTHROPIC equals the string "anthropic"', () => {
		expect(BuiltinProviders.ANTHROPIC).toBe('anthropic');
	});

	it('CURSOR equals the string "cursor"', () => {
		expect(BuiltinProviders.CURSOR).toBe('cursor');
	});

	it('GOOGLE equals the string "google"', () => {
		expect(BuiltinProviders.GOOGLE).toBe('google');
	});

	it('LOCAL equals the string "local"', () => {
		expect(BuiltinProviders.LOCAL).toBe('local');
	});

	it('MOONSHOT equals the string "moonshot"', () => {
		expect(BuiltinProviders.MOONSHOT).toBe('moonshot');
	});

	it('OPENAI equals the string "openai"', () => {
		expect(BuiltinProviders.OPENAI).toBe('openai');
	});

	it('XAI equals the string "xai"', () => {
		expect(BuiltinProviders.XAI).toBe('xai');
	});
});
