/**
 * Document output type definitions
 *
 * Types for the document generation pipeline that transforms
 * command outputs into knowledge-base documents.
 */

/**
 * Document category determines the target subdirectory
 */
export type DocumentCategory = 'backend' | 'frontend' | 'infrastructure' | 'root';

/**
 * Document types supported by the knowledge-base
 */
export type DocumentType =
	| 'A11Y'
	| 'API'
	| 'ARCHITECTURE'
	| 'BACKLOG'
	| 'CODING-ASSERTIONS'
	| 'CONTAINER'
	| 'DATA'
	| 'DEPLOYMENT'
	| 'DESIGN'
	| 'FUNCTIONAL'
	| 'HLD'
	| 'LOGGING'
	| 'LZ'
	| 'PLAN'
	| 'PRD'
	| 'TESTING'
	| 'THOUGHTS'
	| 'WORKFLOW';

/**
 * Document status for lifecycle tracking
 */
export type DocumentStatus = 'COMPLETED' | 'DRAFT' | 'IN_REVIEW' | 'READY_TO_MERGE';

/**
 * Status emoji mapping
 */
export const DOCUMENT_STATUS_EMOJI: Record<DocumentStatus, string> = {
	COMPLETED: '\u{1F7E2}',
	DRAFT: '\u{1F6A7}',
	IN_REVIEW: '\u{1F575}',
	READY_TO_MERGE: '\u{1F680}'
};

/**
 * Document metadata matching knowledge-base template format
 */
export interface DocumentMetadata {
	author: string;
	createdDate: string;
	lastUpdatedDate: string;
	nextReviewDate?: string;
	purpose: string;
	status: DocumentStatus;
	title: string;
	version: string;
}

/**
 * Complete document definition for output
 */
export interface DocumentDefinition {
	category: DocumentCategory;
	content: string;
	filename: string;
	metadata: DocumentMetadata;
	type: DocumentType;
}

/**
 * Options for document output behaviour
 */
export interface DocumentOutputOptions {
	autoApprove?: boolean;
	category?: DocumentCategory;
	customPath?: string;
	documentType?: DocumentType;
	enabled: boolean;
	/** Task ID for PLAN documents (e.g., BE001, FE002) */
	taskId?: string;
}

/**
 * Result from document detection analysis
 */
export interface DocumentDetectionResult {
	confidence: number;
	isDocument: boolean;
	reasons: string[];
	suggestedCategory?: DocumentCategory;
	suggestedType?: DocumentType;
}

/**
 * Result from document write operation
 */
export interface DocumentWriteResult {
	error?: string;
	isUpdate: boolean;
	path: string;
	success: boolean;
}

/**
 * User approval decision
 */
export interface DocumentApprovalResult {
	approved: boolean;
	categoryOverride?: DocumentCategory;
	customPath?: string;
	modified?: Partial<DocumentDefinition>;
}

/**
 * Clarifying question for low-confidence scenarios
 */
export interface ClarifyingQuestion {
	id: string;
	impactField: 'category' | 'content' | 'purpose' | 'type';
	options: Array<{ label: string; value: string }>;
	question: string;
}

/**
 * Result from clarifying questions flow
 */
export interface ClarificationResult {
	answers: Record<string, string>;
	proceed: boolean;
	suggestedCategory?: DocumentCategory;
	suggestedType?: DocumentType;
	updatedConfidence: number;
}

/**
 * Mapping of document types to their valid categories
 */
export const DOCUMENT_TYPE_CATEGORIES: Record<DocumentType, DocumentCategory[]> = {
	A11Y: ['frontend'],
	API: ['backend'],
	ARCHITECTURE: ['backend', 'frontend', 'infrastructure'],
	BACKLOG: ['root'],
	'CODING-ASSERTIONS': ['backend', 'frontend'],
	CONTAINER: ['infrastructure'],
	DATA: ['backend'],
	DEPLOYMENT: ['infrastructure'],
	DESIGN: ['frontend'],
	FUNCTIONAL: ['root'],
	HLD: ['infrastructure'],
	LOGGING: ['infrastructure'],
	LZ: ['infrastructure'],
	PLAN: ['root'],
	PRD: ['root'],
	TESTING: ['backend', 'frontend'],
	THOUGHTS: ['root'],
	WORKFLOW: ['infrastructure']
};

/**
 * Confidence thresholds for document saving
 */
export const DOCUMENT_CONFIDENCE_THRESHOLDS = {
	/** Minimum confidence to offer save option */
	MIN_SAVE_THRESHOLD: 0.7,
	/** Confidence level considered high (auto-approve eligible) */
	HIGH_CONFIDENCE: 0.9,
	/** Below this, document is rejected outright */
	REJECTION_THRESHOLD: 0.3
} as const;

/**
 * Default category for each document type
 */
export const DOCUMENT_TYPE_DEFAULT_CATEGORY: Record<DocumentType, DocumentCategory> = {
	A11Y: 'frontend',
	API: 'backend',
	ARCHITECTURE: 'backend',
	BACKLOG: 'root',
	'CODING-ASSERTIONS': 'backend',
	CONTAINER: 'infrastructure',
	DATA: 'backend',
	DEPLOYMENT: 'infrastructure',
	DESIGN: 'frontend',
	FUNCTIONAL: 'root',
	HLD: 'infrastructure',
	LOGGING: 'infrastructure',
	LZ: 'infrastructure',
	PLAN: 'root',
	PRD: 'root',
	TESTING: 'backend',
	THOUGHTS: 'root',
	WORKFLOW: 'infrastructure'
};
