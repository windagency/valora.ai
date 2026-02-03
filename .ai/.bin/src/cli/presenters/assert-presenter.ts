/**
 * Assert Presenter - Displays assertion/validation summary
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import { BasePresenter } from './base-presenter';

/**
 * Type definitions for assert outputs
 */
interface CriticalIssue {
	description?: string;
	file?: string;
	line?: number;
	rule?: string;
}

interface DimensionStatus {
	issues?: number;
	status?: string;
}

interface FormattingResults {
	issues_count?: number;
	status?: string;
}

interface LintingResults {
	error_count?: number;
	warning_count?: number;
}

interface Metrics {
	code_coverage?: number;
	completeness?: number;
	complexity?: number;
	security_score?: number;
	type_coverage?: number;
}

interface MissingFeature {
	criterion?: string;
	recommendation?: string;
	severity?: string;
}

interface SecurityVulnerability {
	description?: string;
	severity?: string;
}

interface TypeErrorItem {
	description?: string;
	file?: string;
	line?: number;
}

interface ValidationReport {
	critical_issues?: CriticalIssue[];
	dimensions?: Record<string, DimensionStatus>;
	metrics?: Metrics;
	overall_status?: string;
	recommendation?: string;
	warnings?: Warning[];
}

interface Warning {
	description?: string;
	file?: string;
}

/**
 * Presenter for assert command output
 */
export class AssertPresenter extends BasePresenter {
	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		super(console, renderer);
	}

	display(outputs: Record<string, unknown>): void {
		this.displaySummaryBox('Assertion Summary');
		this.displayVerdict(outputs);
		this.displayCompleteness(outputs);
		this.displayMissingFeatures(outputs);
		this.displayValidationDimensions(outputs);
		this.displayCriticalIssues(outputs);
		this.displayTypeErrors(outputs);
		this.displaySecurityVulnerabilities(outputs);
		this.displayStandardsCompliance(outputs);
		this.displayQualityMetrics(outputs);
		this.displayWarnings(outputs);
		this.displayRecommendation(outputs);
		this.displayNextSteps(outputs);
		this.displaySummaryFooter();
	}

	getCommandName(): string {
		return 'assert';
	}

	private displayCompleteness(outputs: Record<string, unknown>): void {
		const completenessStatus = this.getString(outputs, 'completeness_status');
		const coveragePercentage = this.getNumber(outputs, 'coverage_percentage');

		if (!completenessStatus && coveragePercentage === undefined) return;

		this.console.print('\n📋 Completeness:');
		if (completenessStatus) {
			const statusIcon = this.getCompletenessIcon(completenessStatus);
			this.console.print(`   Status: ${statusIcon} ${completenessStatus.replace(/_/g, ' ')}`);
		}
		if (coveragePercentage !== undefined) {
			this.console.print(`   Coverage: ${coveragePercentage.toFixed(1)}%`);
		}
	}

	private displayCriticalIssues(outputs: Record<string, unknown>): void {
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const criticalIssues = validationReport?.critical_issues;
		if (!criticalIssues || criticalIssues.length === 0) return;

		this.console.print(`\n🚨 Critical Issues (${criticalIssues.length}):`);
		for (const issue of criticalIssues.slice(0, 5)) {
			const rule = issue.rule ? `[${issue.rule}]` : '';
			this.console.print(`   • ${rule} ${issue.description ?? 'Unknown issue'}`);
			if (issue.file) {
				const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
				this.console.print(`     at ${location}`);
			}
		}
		if (criticalIssues.length > 5) {
			this.console.print(`   ... and ${criticalIssues.length - 5} more`);
		}
	}

	private displayMissingFeatures(outputs: Record<string, unknown>): void {
		const missingFeatures = this.getArray<MissingFeature>(outputs, 'missing_features');
		if (!missingFeatures || missingFeatures.length === 0) return;

		this.console.print(`\n❌ Missing Features (${missingFeatures.length}):`);
		for (const feature of missingFeatures.slice(0, 5)) {
			const severity = feature.severity ? `[${feature.severity}]` : '';
			this.console.print(`   • ${severity} ${feature.criterion ?? 'Unknown criterion'}`);
		}
		if (missingFeatures.length > 5) {
			this.console.print(`   ... and ${missingFeatures.length - 5} more`);
		}
	}

	private displayNextSteps(outputs: Record<string, unknown>): void {
		const validationStatus = this.getString(outputs, 'validation_status');
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const status = validationStatus ?? validationReport?.overall_status;

		if (!status) return;

		this.console.print('\n🚀 Next Steps:');
		const upper = status.toUpperCase();
		if (['PASS', 'PASSED'].includes(upper)) {
			this.console.print('   Ready to proceed to testing phase');
			this.console.print('   Run: valora test');
		} else if (['WARN', 'WARNING'].includes(upper)) {
			this.console.print('   May proceed to testing with caution');
			this.console.print('   Consider addressing warnings first');
		} else {
			this.console.print('   Address blockers before testing');
			this.console.print('   Run: valora implement (to fix issues)');
		}
	}

	private displayQualityMetrics(outputs: Record<string, unknown>): void {
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const metrics = validationReport?.metrics;
		if (!metrics) return;

		this.console.print('\n📈 Quality Metrics:');
		if (metrics.completeness !== undefined) {
			this.console.print(`   Completeness: ${metrics.completeness.toFixed(1)}%`);
		}
		if (metrics.code_coverage !== undefined) {
			this.console.print(`   Code Coverage: ${metrics.code_coverage.toFixed(1)}%`);
		}
		if (metrics.type_coverage !== undefined) {
			this.console.print(`   Type Coverage: ${metrics.type_coverage.toFixed(1)}%`);
		}
		if (metrics.security_score !== undefined) {
			this.console.print(`   Security Score: ${metrics.security_score.toFixed(1)}/10`);
		}
	}

	private displayRecommendation(outputs: Record<string, unknown>): void {
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const recommendation = validationReport?.recommendation ?? this.getString(outputs, 'recommendation');
		if (!recommendation) return;

		this.console.print('\n💡 Recommendation:');
		const truncated = this.truncate(recommendation, 300);
		this.console.print(`   ${truncated}`);
	}

	private displaySecurityVulnerabilities(outputs: Record<string, unknown>): void {
		const securityVulnerabilities = this.getArray<SecurityVulnerability>(outputs, 'security_vulnerabilities');
		if (!securityVulnerabilities || securityVulnerabilities.length === 0) return;

		this.console.print(`\n🔒 Security Vulnerabilities (${securityVulnerabilities.length}):`);
		for (const vuln of securityVulnerabilities.slice(0, 3)) {
			const severity = vuln.severity ? `[${vuln.severity.toUpperCase()}]` : '';
			this.console.print(`   • ${severity} ${vuln.description ?? 'Security issue'}`);
		}
		if (securityVulnerabilities.length > 3) {
			this.console.print(`   ... and ${securityVulnerabilities.length - 3} more`);
		}
	}

	private displayStandardsCompliance(outputs: Record<string, unknown>): void {
		const lintingResults = this.getObject<LintingResults>(outputs, 'linting_results');
		const formattingResults = this.getObject<FormattingResults>(outputs, 'formatting_results');

		if (!lintingResults && !formattingResults) return;

		this.console.print('\n🔍 Standards Compliance:');
		if (lintingResults) {
			const errors = lintingResults.error_count ?? 0;
			const warnings = lintingResults.warning_count ?? 0;
			this.console.print(`   Linting: ${errors} errors, ${warnings} warnings`);
		}
		if (formattingResults) {
			const status = formattingResults.status ?? 'unknown';
			const issues = formattingResults.issues_count ?? 0;
			this.console.print(`   Formatting: ${status} (${issues} issues)`);
		}
	}

	private displayTypeErrors(outputs: Record<string, unknown>): void {
		const typeErrors = this.getArray<TypeErrorItem>(outputs, 'type_errors');
		if (!typeErrors || typeErrors.length === 0) return;

		this.console.print(`\n🔷 Type Errors (${typeErrors.length}):`);
		for (const error of typeErrors.slice(0, 3)) {
			this.console.print(`   • ${error.description ?? 'Type error'}`);
			if (error.file) {
				const location = error.line ? `${error.file}:${error.line}` : error.file;
				this.console.print(`     at ${location}`);
			}
		}
		if (typeErrors.length > 3) {
			this.console.print(`   ... and ${typeErrors.length - 3} more`);
		}
	}

	private displayValidationDimensions(outputs: Record<string, unknown>): void {
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const dimensions = validationReport?.dimensions;
		if (!dimensions || Object.keys(dimensions).length === 0) return;

		this.console.print('\n📊 Validation Dimensions:');
		for (const [dimension, data] of Object.entries(dimensions)) {
			const statusIcon = data.status ? this.getStatusIcon(data.status) : '○';
			const issueCount = data.issues !== undefined ? ` (${data.issues} issues)` : '';
			const formattedDimension = this.formatKey(dimension);
			this.console.print(`   ${statusIcon} ${formattedDimension}${issueCount}`);
		}
	}

	private displayVerdict(outputs: Record<string, unknown>): void {
		const validationStatus = this.getString(outputs, 'validation_status');
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const blockerCount = this.getNumber(outputs, 'blocker_count');

		const status = validationStatus ?? validationReport?.overall_status ?? 'UNKNOWN';
		const statusIcon = this.getVerdictIcon(status);
		this.console.print(`\n${statusIcon} Verdict: ${status.toUpperCase()}`);

		if (blockerCount !== undefined) {
			this.console.print(`   Blockers: ${blockerCount}`);
		}
	}

	private displayWarnings(outputs: Record<string, unknown>): void {
		const validationReport = this.getObject<ValidationReport>(outputs, 'validation_report');
		const warnings = validationReport?.warnings;
		if (!warnings || warnings.length === 0) return;

		this.console.print(`\n⚠️  Warnings (${warnings.length}):`);
		for (const warning of warnings.slice(0, 3)) {
			this.console.print(`   • ${warning.description ?? 'Warning'}`);
		}
		if (warnings.length > 3) {
			this.console.print(`   ... and ${warnings.length - 3} more`);
		}
	}

	private getCompletenessIcon(status: string): string {
		if (status === 'complete') return '✓';
		if (status === 'mostly_complete') return '○';
		return '✗';
	}

	private getVerdictIcon(status: string): string {
		const upper = status.toUpperCase();
		if (['PASS', 'PASSED'].includes(upper)) return '✅';
		if (['BLOCKED', 'FAIL', 'FAILED'].includes(upper)) return '❌';
		return '⚠️';
	}
}
