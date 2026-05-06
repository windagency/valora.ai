export interface DomainGrade {
	domain: string;
	lastUpdated: string;
	score: number;
}

export interface GardenReport {
	broken: Array<{ file: string; message: string; remedy: string }>;
	scannedFiles: number;
	stale: Array<{ file: string; message: string; remedy: string }>;
}

export interface GoldenPrinciple {
	description: string;
	id: string;
	pattern: string;
	remedy: string;
}

export interface PrincipleViolation {
	file: string;
	match: string;
	principleId: string;
	remedy: string;
}
