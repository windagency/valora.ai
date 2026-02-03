# Provider Configuration

## Overview

All LLM provider metadata, models, and capabilities are centralized in `providers.config.ts`. This eliminates duplication across the codebase and provides a single source of truth for provider information.

**All provider and model string comparisons use type-safe enums and constants** to prevent typos and improve code maintainability.

## Type-Safe Provider and Model References

### Enums and Constants

All provider and model names are defined as type-safe enums and constants to prevent typos and improve IDE auto-completion:

```typescript
// Provider names - use instead of hard-coded strings
enum ProviderName {
  ANTHROPIC = 'anthropic',
  CURSOR = 'cursor',
  GOOGLE = 'google',
  MOONSHOT = 'moonshot',
  OPENAI = 'openai',
  XAI = 'xai'
}

// Model names - commonly used models as constants
const ModelName = {
  CLAUDE_SONNET_4_5: 'claude-sonnet-4.5',
  CURSOR_SONNET_4_5: 'cursor-sonnet-4.5',
  GPT_5: 'gpt-5',
  GEMINI_2_5_PRO: 'gemini-2.5-pro',
  GROK_CODE: 'grok-code',
  // ... all other models
} as const;
```

### Usage Examples

**Always use enums/constants instead of string literals:**

```typescript
// ✅ GOOD - Type-safe
if (providerName === ProviderName.CURSOR) {
  // ...
}

if (model === ModelName.CLAUDE_SONNET_4_5) {
  // ...
}

// ❌ BAD - Hard-coded strings (prone to typos)
if (providerName === 'cursor') {  // No autocomplete, no type checking
  // ...
}
```

### Benefits

1. **Type Safety**: Compiler catches typos at build time
2. **IDE Support**: Full auto-completion for provider and model names
3. **Refactoring**: Easy to rename providers or models across the codebase
4. **Documentation**: Self-documenting code with clear available options
5. **No Magic Strings**: All string literals are defined in one place

## Architecture

### Single Source of Truth

**Before**: Provider information was scattered across multiple files:
- `validation-helpers.ts` - had `PROVIDER_LABELS`, `DEFAULT_MODELS`, `PROVIDER_CHOICES`
- `provider-resolver.ts` - had `MODEL_PROVIDER_SUGGESTIONS` with full model lists
- Multiple other files with hard-coded provider names

**After**: All provider metadata is centralized in `providers.config.ts` with the `PROVIDER_REGISTRY`:

```typescript
PROVIDER_REGISTRY = {
  anthropic: { key, label, defaultModel, modelModes, requiresApiKey, ... },
  cursor: { key, label, defaultModel, modelModes, requiresApiKey, ... },
  google: { key, label, defaultModel, modelModes, requiresApiKey, ... },
  // ...
}
```

### Provider Metadata Structure

Each provider in the registry contains:

- `key`: Internal provider identifier (e.g., "anthropic")
- `label`: Display name for UI (e.g., "Anthropic")
- `defaultModel`: Default model for this provider (e.g., "claude-sonnet-4.5")
- `modelModes`: Array of available models with their modes
- `requiresApiKey`: Boolean indicating if API key is needed
- `description`: Optional description for setup wizard
- `helpText`: Optional help text (e.g., for Cursor provider)

## Adding a New Provider

To add a new provider, simply update `PROVIDER_REGISTRY` in `providers.config.ts`:

```typescript
newprovider: {
  key: 'newprovider',
  label: 'New Provider',
  defaultModel: 'new-model-1',
  modelModes: [
    { mode: 'default', model: 'new-model-1' },
    { mode: 'advanced', model: 'new-model-2' }
  ],
  requiresApiKey: true,
  description: 'Models from New Provider'
}
```

**That's it!** The following are automatically updated:
- Setup wizard choices (`PROVIDER_CHOICES`, `QUICK_SETUP_CHOICES`)
- Default models mapping (`DEFAULT_MODELS`)
- Provider labels (`PROVIDER_LABELS`)
- Model to provider suggestions (`MODEL_PROVIDER_SUGGESTIONS`)
- Config type definitions (add to `ProvidersConfig` in `config.types.ts`)

## Utility Functions

The `providers.config.ts` exports helpful utility functions:

### Provider Queries
- `getAllProviderKeys()` - Get all provider keys
- `getProviderMetadata(key)` - Get metadata for a specific provider
- `isValidProvider(key)` - Check if a provider key is valid
- `getProvidersRequiringApiKey()` - Get providers that need API keys
- `getProvidersWithoutApiKey()` - Get providers that don't need API keys

### Model Queries
- `getDefaultModel(providerKey)` - Get default model for a provider
- `getProviderModels(providerKey)` - Get all unique models for a provider
- `getAllModels()` - Get all unique models across all providers
- `hasModel(providerKey, model)` - Check if a provider has a specific model

## Benefits

1. **Single Source of Truth**: All provider data in one place
2. **Easy Maintenance**: Add/update providers in one location
3. **Type Safety**: Centralized types ensure consistency
4. **Automatic Propagation**: Changes automatically reflect everywhere
5. **Better Testing**: Comprehensive tests for provider configuration
6. **No Duplication**: Eliminated hard-coded values across files

## Migration Notes

The migration maintained backward compatibility:
- `PROVIDER_LABELS`, `DEFAULT_MODELS` still exported from `validation-helpers.ts`
- `MODEL_PROVIDER_SUGGESTIONS` still exported from `provider-resolver.ts`
- Both now derive from `PROVIDER_REGISTRY` automatically
- Existing code continues to work without changes

## Example: Cursor Provider

The Cursor provider demonstrates a provider that doesn't require an API key:

```typescript
cursor: {
  key: 'cursor',
  label: 'Cursor',
  defaultModel: 'cursor-sonnet-4.5',
  requiresApiKey: false, // <-- No API key needed
  helpText: 'The Cursor provider uses your Cursor subscription via MCP.',
  // ...
}
```

The setup wizard automatically handles this by:
- Not prompting for API key when Cursor is selected
- Displaying the helpText to explain how it works
- Prioritizing it in quick setup choices (no-API-key providers first)

## Tests

Comprehensive test coverage includes:
- `providers.config.test.ts` (27 tests) - Provider registry structure and utilities
- `validation-helpers.test.ts` (11 tests) - Setup wizard integration
- `provider-resolver.test.ts` (6 tests) - Alignment verification

**Total: 44 tests passing ✅**

