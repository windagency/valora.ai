import type { GoldenPrinciple, PrincipleViolation } from './maintenance.types';

export class GoldenPrinciplesScannerService {
	constructor(private readonly principles: GoldenPrinciple[]) {}

	scanCode(code: string, file: string): PrincipleViolation[] {
		const violations: PrincipleViolation[] = [];
		for (const principle of this.principles) {
			if (code.includes(principle.pattern)) {
				violations.push({
					file,
					match: principle.pattern,
					principleId: principle.id,
					remedy: principle.remedy
				});
			}
		}
		return violations;
	}
}
