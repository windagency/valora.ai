import type { DocValidator } from 'lint/doc-validator';

import type { GardenReport } from './maintenance.types';

export class DocGardenerService {
	constructor(private readonly validator: Pick<DocValidator, 'validateDirectory'>) {}

	async garden(dirPath: string): Promise<GardenReport> {
		const result = await this.validator.validateDirectory(dirPath);

		const stale = result.errors
			.filter((e) => e.kind === 'stale-updated' || e.kind === 'missing-updated')
			.map(({ file, message, remedy }) => ({ file, message, remedy }));

		const broken = result.errors
			.filter((e) => e.kind === 'broken-link')
			.map(({ file, message, remedy }) => ({ file, message, remedy }));

		return { broken, scannedFiles: result.scannedFiles, stale };
	}
}
