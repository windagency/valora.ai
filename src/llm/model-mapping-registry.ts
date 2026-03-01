/**
 * Model Mapping Registry
 *
 * Configurable registry for model name mappings across different providers.
 * Follows Open/Closed Principle - open for extension, closed for modification.
 */

/**
 * Model mapping type
 */
export type ModelMappingType = 'extended-thinking' | 'standard' | 'vertex';

/**
 * Default standard Anthropic API model mappings
 * See https://platform.claude.com/docs/en/about-claude/models/overview
 */
const DEFAULT_STANDARD_MAPPINGS: Record<string, string> = {
	// Claude 4.5 series (latest)
	'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
	'claude-opus-4.5': 'claude-opus-4-5-20251101',
	'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
	// Claude 4.x series (legacy)
	'claude-opus-4': 'claude-opus-4-20250514',
	'claude-opus-4.1': 'claude-opus-4-1-20250805',
	'claude-sonnet-4': 'claude-sonnet-4-20250514',
	// Claude 3.x series (legacy)
	'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
	'claude-3-haiku': 'claude-3-haiku-20240307',
	'claude-3-opus': 'claude-3-opus-20240229',
	'claude-3-sonnet': 'claude-3-sonnet-20240229',
	'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
	'claude-sonnet-3.7': 'claude-3-7-sonnet-20250219'
};

/**
 * Default Vertex AI model mappings
 */
const DEFAULT_VERTEX_MAPPINGS: Record<string, string> = {
	// Claude 4.5 series (latest)
	'claude-haiku-4.5': 'claude-haiku-4-5@20251001',
	'claude-opus-4.5': 'claude-opus-4-5@20251101',
	'claude-sonnet-4.5': 'claude-sonnet-4-5@20250929',
	// Claude 4.x series (legacy)
	'claude-opus-4': 'claude-opus-4@20250514',
	'claude-opus-4.1': 'claude-opus-4-1@20250805',
	'claude-sonnet-4': 'claude-sonnet-4@20250514',
	// Claude 3.x series (legacy)
	'claude-3-5-sonnet': 'claude-3-5-sonnet-v2@20241022',
	'claude-3-haiku': 'claude-3-haiku@20240307',
	'claude-3-opus': 'claude-3-opus@20240229',
	'claude-3-sonnet': 'claude-3-sonnet@20240229',
	'claude-haiku-3.5': 'claude-3-5-haiku@20241022',
	'claude-sonnet-3.7': 'claude-3-7-sonnet@20250219'
};

/**
 * Default extended thinking model mappings
 */
const DEFAULT_EXTENDED_THINKING_MAPPINGS: Record<string, string> = {
	'claude-haiku-4.5-extended thinking': 'claude-haiku-4-5-20251001',
	'claude-opus-4.1-extended thinking': 'claude-opus-4-1-20250805',
	'claude-opus-4.5-extended thinking': 'claude-opus-4-5-20251101',
	'claude-sonnet-3.7-extended thinking': 'claude-3-7-sonnet-20250219',
	'claude-sonnet-4-extended thinking': 'claude-sonnet-4-20250514',
	'claude-sonnet-4.5-extended thinking': 'claude-sonnet-4-5-20250929'
};

/**
 * Registry for model name mappings
 * Allows runtime extension of model definitions
 */
export class ModelMappingRegistry {
	private extendedThinkingMappings: Map<string, string>;
	private standardMappings: Map<string, string>;
	private vertexMappings: Map<string, string>;

	constructor() {
		this.standardMappings = new Map();
		this.vertexMappings = new Map();
		this.extendedThinkingMappings = new Map();
		this.initializeDefaults();
	}

	/**
	 * Initialize with default mappings
	 */
	private initializeDefaults(): void {
		for (const [alias, modelId] of Object.entries(DEFAULT_STANDARD_MAPPINGS)) {
			this.standardMappings.set(alias, modelId);
		}
		for (const [alias, modelId] of Object.entries(DEFAULT_VERTEX_MAPPINGS)) {
			this.vertexMappings.set(alias, modelId);
		}
		for (const [alias, modelId] of Object.entries(DEFAULT_EXTENDED_THINKING_MAPPINGS)) {
			this.extendedThinkingMappings.set(alias, modelId);
		}
	}

	/**
	 * Resolve a model alias to its actual model ID
	 */
	resolve(alias: string, type: ModelMappingType = 'standard'): string {
		const mappings = this.getMappingsForType(type);
		return mappings.get(alias) ?? alias;
	}

	/**
	 * Resolve model with optional mode (for extended thinking)
	 */
	resolveWithMode(model: string, mode?: string, useVertex = false): string {
		// Handle extended thinking modes
		if (mode) {
			const modelModeKey = `${model}-${mode}`;
			const extendedResult = this.extendedThinkingMappings.get(modelModeKey);
			if (extendedResult) {
				return extendedResult;
			}
		}

		// Use appropriate mapping type
		const type: ModelMappingType = useVertex ? 'vertex' : 'standard';
		return this.resolve(model, type);
	}

	/**
	 * Register a new model mapping
	 */
	register(alias: string, modelId: string, type: ModelMappingType = 'standard'): void {
		const mappings = this.getMappingsForType(type);
		mappings.set(alias, modelId);
	}

	/**
	 * Register multiple mappings at once
	 */
	registerBatch(mappings: Record<string, string>, type: ModelMappingType = 'standard'): void {
		for (const [alias, modelId] of Object.entries(mappings)) {
			this.register(alias, modelId, type);
		}
	}

	/**
	 * Get all mappings for a type
	 */
	getAllMappings(type: ModelMappingType = 'standard'): Record<string, string> {
		const mappings = this.getMappingsForType(type);
		const result: Record<string, string> = {};
		for (const [alias, modelId] of mappings.entries()) {
			result[alias] = modelId;
		}
		return result;
	}

	/**
	 * Get all registered aliases
	 */
	getAliases(type: ModelMappingType = 'standard'): string[] {
		const mappings = this.getMappingsForType(type);
		return Array.from(mappings.keys());
	}

	/**
	 * Check if an alias exists
	 */
	hasAlias(alias: string, type: ModelMappingType = 'standard'): boolean {
		const mappings = this.getMappingsForType(type);
		return mappings.has(alias);
	}

	/**
	 * Remove a mapping
	 */
	remove(alias: string, type: ModelMappingType = 'standard'): boolean {
		const mappings = this.getMappingsForType(type);
		return mappings.delete(alias);
	}

	/**
	 * Reset to default mappings
	 */
	reset(): void {
		this.standardMappings.clear();
		this.vertexMappings.clear();
		this.extendedThinkingMappings.clear();
		this.initializeDefaults();
	}

	/**
	 * Get the appropriate mappings map for a type
	 */
	private getMappingsForType(type: ModelMappingType): Map<string, string> {
		switch (type) {
			case 'extended-thinking':
				return this.extendedThinkingMappings;
			case 'vertex':
				return this.vertexMappings;
			default:
				return this.standardMappings;
		}
	}
}

/**
 * Singleton instance
 */
let registryInstance: ModelMappingRegistry | null = null;

/**
 * Get the singleton model mapping registry
 */
export function getModelMappingRegistry(): ModelMappingRegistry {
	registryInstance ??= new ModelMappingRegistry();
	return registryInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetModelMappingRegistry(): void {
	registryInstance = null;
}
