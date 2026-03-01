/**
 * Model Mapping Registry Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { getModelMappingRegistry, ModelMappingRegistry, resetModelMappingRegistry } from '../model-mapping-registry';

describe('ModelMappingRegistry', () => {
	let registry: ModelMappingRegistry;

	beforeEach(() => {
		registry = new ModelMappingRegistry();
	});

	describe('initialization', () => {
		it('should initialize with default standard mappings', () => {
			const mappings = registry.getAllMappings('standard');

			expect(mappings['claude-sonnet-4.5']).toBe('claude-sonnet-4-5-20250929');
			expect(mappings['claude-opus-4.5']).toBe('claude-opus-4-5-20251101');
			expect(mappings['claude-haiku-4.5']).toBe('claude-haiku-4-5-20251001');
		});

		it('should initialize with default vertex mappings', () => {
			const mappings = registry.getAllMappings('vertex');

			expect(mappings['claude-sonnet-4.5']).toBe('claude-sonnet-4-5@20250929');
			expect(mappings['claude-opus-4.5']).toBe('claude-opus-4-5@20251101');
		});

		it('should initialize with default extended thinking mappings', () => {
			const mappings = registry.getAllMappings('extended-thinking');

			expect(mappings['claude-sonnet-4.5-extended thinking']).toBe('claude-sonnet-4-5-20250929');
			expect(mappings['claude-opus-4.5-extended thinking']).toBe('claude-opus-4-5-20251101');
		});
	});

	describe('resolve', () => {
		it('should resolve standard model alias', () => {
			const resolved = registry.resolve('claude-sonnet-4.5', 'standard');

			expect(resolved).toBe('claude-sonnet-4-5-20250929');
		});

		it('should resolve vertex model alias', () => {
			const resolved = registry.resolve('claude-sonnet-4.5', 'vertex');

			expect(resolved).toBe('claude-sonnet-4-5@20250929');
		});

		it('should return original if alias not found', () => {
			const resolved = registry.resolve('unknown-model', 'standard');

			expect(resolved).toBe('unknown-model');
		});

		it('should default to standard type', () => {
			const resolved = registry.resolve('claude-sonnet-4.5');

			expect(resolved).toBe('claude-sonnet-4-5-20250929');
		});
	});

	describe('resolveWithMode', () => {
		it('should resolve with extended thinking mode', () => {
			const resolved = registry.resolveWithMode('claude-sonnet-4.5', 'extended thinking', false);

			expect(resolved).toBe('claude-sonnet-4-5-20250929');
		});

		it('should resolve vertex model when useVertex is true', () => {
			const resolved = registry.resolveWithMode('claude-sonnet-4.5', undefined, true);

			expect(resolved).toBe('claude-sonnet-4-5@20250929');
		});

		it('should resolve standard model when useVertex is false', () => {
			const resolved = registry.resolveWithMode('claude-sonnet-4.5', undefined, false);

			expect(resolved).toBe('claude-sonnet-4-5-20250929');
		});

		it('should fallback to standard/vertex when mode key not found', () => {
			const resolved = registry.resolveWithMode('claude-sonnet-4.5', 'unknown-mode', false);

			expect(resolved).toBe('claude-sonnet-4-5-20250929');
		});
	});

	describe('register', () => {
		it('should register new standard mapping', () => {
			registry.register('custom-model', 'custom-model-id-123', 'standard');

			const resolved = registry.resolve('custom-model', 'standard');
			expect(resolved).toBe('custom-model-id-123');
		});

		it('should register new vertex mapping', () => {
			registry.register('custom-model', 'custom-model@123', 'vertex');

			const resolved = registry.resolve('custom-model', 'vertex');
			expect(resolved).toBe('custom-model@123');
		});

		it('should override existing mapping', () => {
			registry.register('claude-sonnet-4.5', 'overridden-id', 'standard');

			const resolved = registry.resolve('claude-sonnet-4.5', 'standard');
			expect(resolved).toBe('overridden-id');
		});
	});

	describe('registerBatch', () => {
		it('should register multiple mappings', () => {
			registry.registerBatch(
				{
					'model-a': 'model-a-id',
					'model-b': 'model-b-id'
				},
				'standard'
			);

			expect(registry.resolve('model-a', 'standard')).toBe('model-a-id');
			expect(registry.resolve('model-b', 'standard')).toBe('model-b-id');
		});
	});

	describe('getAliases', () => {
		it('should return all standard aliases', () => {
			const aliases = registry.getAliases('standard');

			expect(aliases).toContain('claude-sonnet-4.5');
			expect(aliases).toContain('claude-opus-4.5');
			expect(aliases).toContain('claude-haiku-4.5');
		});

		it('should return all vertex aliases', () => {
			const aliases = registry.getAliases('vertex');

			expect(aliases).toContain('claude-sonnet-4.5');
		});
	});

	describe('hasAlias', () => {
		it('should return true for existing alias', () => {
			expect(registry.hasAlias('claude-sonnet-4.5', 'standard')).toBe(true);
		});

		it('should return false for non-existing alias', () => {
			expect(registry.hasAlias('nonexistent', 'standard')).toBe(false);
		});
	});

	describe('remove', () => {
		it('should remove mapping and return true', () => {
			const result = registry.remove('claude-sonnet-4.5', 'standard');

			expect(result).toBe(true);
			expect(registry.hasAlias('claude-sonnet-4.5', 'standard')).toBe(false);
		});

		it('should return false for non-existing alias', () => {
			const result = registry.remove('nonexistent', 'standard');

			expect(result).toBe(false);
		});
	});

	describe('reset', () => {
		it('should restore default mappings after modifications', () => {
			const originalMapping = registry.resolve('claude-sonnet-4.5', 'standard');

			registry.register('claude-sonnet-4.5', 'modified', 'standard');
			registry.reset();

			expect(registry.resolve('claude-sonnet-4.5', 'standard')).toBe(originalMapping);
		});

		it('should remove custom mappings after reset', () => {
			registry.register('custom-model', 'custom-id', 'standard');
			registry.reset();

			expect(registry.hasAlias('custom-model', 'standard')).toBe(false);
		});
	});
});

describe('Singleton Pattern', () => {
	beforeEach(() => {
		resetModelMappingRegistry();
	});

	it('should return same instance on multiple calls', () => {
		const instance1 = getModelMappingRegistry();
		const instance2 = getModelMappingRegistry();

		expect(instance1).toBe(instance2);
	});

	it('should preserve modifications across calls', () => {
		const instance1 = getModelMappingRegistry();
		instance1.register('singleton-test', 'singleton-id', 'standard');

		const instance2 = getModelMappingRegistry();
		expect(instance2.resolve('singleton-test', 'standard')).toBe('singleton-id');
	});

	it('should create new instance after reset', () => {
		const instance1 = getModelMappingRegistry();
		instance1.register('before-reset', 'some-id', 'standard');

		resetModelMappingRegistry();

		const instance2 = getModelMappingRegistry();
		expect(instance2.hasAlias('before-reset', 'standard')).toBe(false);
	});
});
