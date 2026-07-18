import { existsSync, readdirSync, readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn()
}));
vi.mock('./compute-registry-integrity.ts', () => ({
	computeIntegrity: vi.fn()
}));

const { computeIntegrity } = await import('./compute-registry-integrity.ts');
const { buildRegistryEntries } = await import('./generate-plugin-registry.ts');

const PACKAGES_DIR = '/fake/packages';

function manifest(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ contributes: ['code'], description: 'desc', version: '1.0.0', ...overrides });
}

describe('buildRegistryEntries', () => {
	beforeEach(() => {
		vi.mocked(existsSync).mockReturnValue(true);
	});

	it('returns an entry per discoverable valora-plugin-* directory that has a manifest', async () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-a', 'valora-plugin-b'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockImplementation(() => manifest());
		vi.mocked(computeIntegrity).mockResolvedValue('sha256-fake=');

		const entries = await buildRegistryEntries(PACKAGES_DIR);

		expect(entries.map((e) => e.name)).toEqual(['valora-plugin-a', 'valora-plugin-b']);
	});

	it('ignores directories that are not valora-plugin-* packages', async () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-runtime', 'valora-plugin-a'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockImplementation(() => manifest());
		vi.mocked(computeIntegrity).mockResolvedValue('sha256-fake=');

		const entries = await buildRegistryEntries(PACKAGES_DIR);

		expect(entries.map((e) => e.name)).toEqual(['valora-plugin-a']);
	});

	it('skips a package whose manifest fails to parse, keeping the rest', async () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-broken', 'valora-plugin-a'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockImplementation((path) => (String(path).includes('broken') ? 'not json' : manifest()));
		vi.mocked(computeIntegrity).mockResolvedValue('sha256-fake=');

		const entries = await buildRegistryEntries(PACKAGES_DIR);

		expect(entries.map((e) => e.name)).toEqual(['valora-plugin-a']);
	});

	it('skips a package whose integrity computation fails for an ordinary reason, keeping the rest', async () => {
		vi.mocked(readdirSync).mockReturnValue(['valora-plugin-a', 'valora-plugin-b'] as unknown as ReturnType<
			typeof readdirSync
		>);
		vi.mocked(readFileSync).mockImplementation(() => manifest());
		vi.mocked(computeIntegrity).mockImplementation((_dir, packageName: string) =>
			packageName.endsWith('valora-plugin-a')
				? Promise.reject(new Error('pnpm pack failed'))
				: Promise.resolve('sha256-fake=')
		);

		const entries = await buildRegistryEntries(PACKAGES_DIR);

		expect(entries.map((e) => e.name)).toEqual(['valora-plugin-b']);
	});
});
