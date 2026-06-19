export interface DocValidationError {
	file: string;
	kind: 'broken-link' | 'missing-updated' | 'stale-updated';
	message: string;
	remedy: string;
}

export interface DocValidationResult {
	errors: DocValidationError[];
	scannedFiles: number;
}
