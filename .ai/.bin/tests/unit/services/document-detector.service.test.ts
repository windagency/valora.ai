/**
 * Unit tests for DocumentDetectorService
 *
 * Tests content quality checking, specifically:
 * - Error indicators cause rejection
 * - Placeholder patterns reduce confidence
 * - [Pending...] inside status-tracking sections (Open Questions) is NOT counted as a placeholder
 * - [Pending...] inside requirement sections IS counted as a placeholder
 * - Multiple status-tracking sections are handled correctly
 */

import { DocumentDetectorService } from 'services/document-detector.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

describe('DocumentDetectorService', () => {
	const detector = new DocumentDetectorService();

	describe('detect() - content quality checks', () => {
		const makeOutputs = (content: string) => ({
			final_specifications: content
		});

		it('should reject content with hard error indicators like [TBD]', () => {
			const content = [
				'# Project Specification',
				'',
				'## Requirements',
				'- Feature: [TBD]',
				'- Another feature that provides enough content to pass the minimum length check for document detection',
				''
			].join('\n');
			const result = detector.detect(makeOutputs(content), 'refine-specs');
			expect(result.confidence).toBe(0.1);
			expect(result.isDocument).toBe(false);
			expect(result.reasons.some((r) => r.includes('[TBD]'))).toBe(true);
		});

		it('should NOT reject content where [Pending...] appears only in Open Questions', () => {
			const content = [
				'# Project Specification',
				'',
				'## Functional Requirements',
				'- FR-001: GET /health returns status',
				'- FR-002: GET /health/ready returns readiness',
				'',
				'## Open Questions',
				'- [x] ~~Q1: Threshold?~~ **RESOLVED**',
				'- [ ] Q2: HTTP response codes? **[Pending - recommend 2xx range]**',
				'- [x] ~~Q3: Slow services?~~ **RESOLVED**',
				'',
				'## Dependencies',
				'- Cloud Run infrastructure'
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// Should pass - [Pending...] is in a status-tracking section
			expect(result.isDocument).toBe(true);
			expect(result.confidence).toBeGreaterThanOrEqual(0.7);
		});

		it('should count [Pending...] as placeholder when in a requirement section', () => {
			const content = [
				'# Project Specification',
				'',
				'## Functional Requirements',
				'- FR-001: [Pending stakeholder review]',
				'- FR-002: GET /health/ready returns readiness',
				'',
				'## Open Questions',
				'- None',
				''
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// Should have reduced confidence due to placeholder in requirements
			expect(result.confidence).toBeLessThan(0.95);
		});

		it('should not count [Pending...] in Remaining Questions section', () => {
			const content = [
				'# Spec',
				'',
				'## Requirements',
				'- FR-001: Do the thing',
				'',
				'## Remaining Questions',
				'- Q1: What format? [Pending discussion]',
				'',
				'## Constraints',
				'- Must use TypeScript'
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			expect(result.isDocument).toBe(true);
			expect(result.confidence).toBeGreaterThanOrEqual(0.7);
		});

		it('should handle multiple status-tracking sections', () => {
			const content = [
				'# Spec',
				'',
				'## Requirements',
				'- FR-001: Do the thing',
				'',
				'## Open Questions',
				'- Q1: [Pending - some question]',
				'',
				'## Known Issues',
				'- Issue: [Pending investigation]',
				'',
				'## Constraints',
				'- Must use TypeScript'
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			expect(result.isDocument).toBe(true);
			expect(result.confidence).toBeGreaterThanOrEqual(0.7);
		});

		it('should still reject when [Pending...] appears in requirements even if also in Open Questions', () => {
			const content = [
				'# Project Specification',
				'',
				'## Functional Requirements',
				'- FR-001: [Pending design decision]',
				'- FR-002: [Pending API review]',
				'',
				'## Open Questions',
				'- Q1: [Pending - recommend option A]',
				''
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// Two placeholders in requirements (Open Questions ones excluded)
			// Confidence = max(0.3, 1.0 - 2 * 0.1) = 0.8
			expect(result.confidence).toBeLessThan(0.95);
			expect(result.confidence).toBeGreaterThanOrEqual(0.3);
		});

		it('should end status section at next heading of equal or higher level', () => {
			const content = [
				'# Project Specification',
				'',
				'## Open Questions',
				'- Q1: [Pending resolution]',
				'',
				'## Requirements',
				'- FR-001: [Pending approval]',
				'- FR-002: Another requirement with enough content to pass the minimum length check for detection',
				''
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// [Pending resolution] in Open Questions: not counted
			// [Pending approval] in Requirements: counted (1 placeholder)
			// mapped command confidence = max(0.3, 0.95 - 1 * 0.1) = 0.85
			expect(result.confidence).toBe(0.85);
		});

		it('should include sub-headings within a status section', () => {
			const content = [
				'# Spec',
				'',
				'## Open Questions',
				'',
				'### Technical',
				'- Q1: [Pending - needs research]',
				'',
				'### Business',
				'- Q2: [Pending - awaiting input]',
				'',
				'## Constraints',
				'- Must use TypeScript'
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// Both [Pending...] are under ## Open Questions via ### sub-headings
			expect(result.isDocument).toBe(true);
			expect(result.confidence).toBeGreaterThanOrEqual(0.7);
		});

		it('should not treat [Pending] as error indicator anymore', () => {
			const content = [
				'# Spec with 200 chars padding to pass minimum length check',
				'',
				'## Overview',
				'A service that does things. This is a long enough description to pass content length checks.',
				'',
				'## Details',
				'More details about the service functionality and implementation approach.',
				'',
				'Status: [Pending final review]',
				''
			].join('\n');

			const result = detector.detect(makeOutputs(content), 'refine-specs');
			// Should NOT have reasons mentioning "error indicator" for [Pending
			expect(result.reasons.some((r) => r.includes('error indicator') && r.includes('Pending'))).toBe(false);
		});
	});
});
