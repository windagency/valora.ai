import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');

import * as fs from 'node:fs';

import { setupObsidianVault } from './obsidian-setup.js';

const FAKE_VAULT = '/fake/vault';
const FAKE_CONFIG = {
	obsidian: {
		colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' },
		vaultDir: FAKE_VAULT
	}
};

describe('writeJsonAtomic error handling', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
		vi.mocked(fs.renameSync).mockReturnValue(undefined);
		vi.mocked(fs.rmSync).mockReturnValue(undefined);
	});

	it('calls rmSync on the .tmp file when renameSync throws', async () => {
		vi.mocked(fs.renameSync).mockImplementationOnce(() => {
			throw new Error('EPERM: rename failed');
		});

		await setupObsidianVault(FAKE_CONFIG);

		expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), { force: true });
	});
});
