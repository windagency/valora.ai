/**
 * Services module exports
 */

export { AgentCapabilityMatcherService } from './agent-capability-matcher.service';
export { AgentCapabilityRegistryService } from './agent-capability-registry.service';
export { AgentSelectionAnalyticsService } from './agent-selection-analytics.service';
export { ContextAnalyzerService } from './context-analyzer.service';
export { DocumentDetectorService } from './document-detector.service';
export { DocumentPathResolverService } from './document-path-resolver.service';
export { DocumentTemplateService } from './document-template.service';
export { DocumentWriterService } from './document-writer.service';
export { DynamicAgentResolverService } from './dynamic-agent-resolver.service';
export {
	type ConfirmStashFn,
	createGitStashProtection,
	getGitStashProtection,
	GitStashProtectionService
} from './git-stash-protection.service';
export { getIdempotencyStore, IdempotencyStoreService, resetIdempotencyStore } from './idempotency-store.service';
export { TaskClassifierService } from './task-classifier.service';
export {
	DomainKeywordRegistry,
	getDomainKeywordRegistry,
	resetDomainKeywordRegistry
} from 'utils/domain-keyword-registry';
