/**
 * Configuration wizard - re-exports from modular components
 *
 * @deprecated Import from specific modules instead:
 * - import { SetupWizard } from './interactive-wizard';
 * - import { configureProvider, configureDefaults } from './validation-helpers';
 */

// Re-export for backward compatibility
export { SetupWizard } from './interactive-wizard';
export {
	configureDefaults,
	configureProvider,
	DEFAULT_MODELS,
	filterValidProviders,
	PROVIDER_CHOICES,
	PROVIDER_LABELS,
	QUICK_SETUP_CHOICES,
	validateApiKey
} from './validation-helpers';
