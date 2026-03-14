/**
 * LSP Context Enricher
 *
 * Injects diagnostics and type information into message context.
 * Used to provide compiler feedback to the LLM without explicit tool calls.
 */

import { getLSPClientManager } from './lsp-client-manager.service';

/** Maximum number of diagnostic items to include in enriched context */
const MAX_DIAGNOSTIC_ITEMS = 10;

/** LSP diagnostic severity: Error */
const LSP_SEVERITY_ERROR = 1;

/** LSP diagnostic severity: Warning */
const LSP_SEVERITY_WARNING = 2;

/**
 * Enrich context with diagnostics for files that will be sent to the LLM
 */
interface DiagnosticItem {
	message?: string;
	range?: { start?: { line?: number } };
	severity?: number;
}

export async function enrichContextWithDiagnostics(filePaths: string[], projectRoot: string): Promise<null | string> {
	const manager = getLSPClientManager(projectRoot);
	const diagnosticLines: string[] = [];

	for (const filePath of filePaths) {
		await collectFileDiagnosticLines(manager, filePath, diagnosticLines);
	}

	if (diagnosticLines.length === 0) return null;

	return `## Compiler Diagnostics\n\n${diagnosticLines.join('\n')}`;
}

async function collectFileDiagnosticLines(
	manager: ReturnType<typeof getLSPClientManager>,
	filePath: string,
	diagnosticLines: string[]
): Promise<void> {
	const client = await manager.getClientForFile(filePath);
	if (!client) return;

	try {
		const result = (await client.sendRequest('textDocument/diagnostic', {
			textDocument: { uri: `file://${filePath}` }
		})) as null | { items?: DiagnosticItem[] };

		formatDiagnosticItems(result?.items ?? [], filePath, diagnosticLines);
	} catch {
		// Server unavailable — skip
	}
}

function formatDiagnosticItems(items: DiagnosticItem[], filePath: string, diagnosticLines: string[]): void {
	const errors = items.filter((d) => d.severity === LSP_SEVERITY_ERROR);
	const warnings = items.filter((d) => d.severity === LSP_SEVERITY_WARNING);

	if (errors.length === 0 && warnings.length === 0) return;

	diagnosticLines.push(`### ${filePath}`);

	for (const d of [...errors, ...warnings].slice(0, MAX_DIAGNOSTIC_ITEMS)) {
		const severity = d.severity === LSP_SEVERITY_ERROR ? 'ERROR' : 'WARN';
		const line = (d.range?.start?.line ?? 0) + 1;
		diagnosticLines.push(`  ${severity} line ${line}: ${d.message ?? ''}`);
	}
}

/**
 * Get a quick health check of a file's diagnostic state
 */
export async function getFileDiagnosticSummary(
	filePath: string,
	projectRoot: string
): Promise<null | { errors: number; warnings: number }> {
	const manager = getLSPClientManager(projectRoot);
	const client = await manager.getClientForFile(filePath);
	if (!client) return null;

	try {
		const result = (await client.sendRequest('textDocument/diagnostic', {
			textDocument: { uri: `file://${filePath}` }
		})) as null | { items?: Array<{ severity?: number }> };

		const items = result?.items ?? [];
		return {
			errors: items.filter((d) => d.severity === LSP_SEVERITY_ERROR).length,
			warnings: items.filter((d) => d.severity === LSP_SEVERITY_WARNING).length
		};
	} catch {
		return null;
	}
}
