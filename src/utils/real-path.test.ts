import { mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveRealPathBestEffort } from './real-path';

describe('resolveRealPathBestEffort', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'valora-real-path-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('returns the same path unchanged when no component is a symlink', () => {
		expect(resolveRealPathBestEffort(dir)).toBe(dir);
	});

	it('resolves a symlinked directory component, even for a not-yet-existing descendant path', () => {
		const realTarget = mkdtempSync(join(tmpdir(), 'valora-real-path-target-'));
		const link = join(dir, 'link');
		symlinkSync(realTarget, link);

		expect(resolveRealPathBestEffort(join(link, 'not-created-yet.txt'))).toBe(join(realTarget, 'not-created-yet.txt'));

		rmSync(realTarget, { recursive: true, force: true });
	});

	it('falls back to the lexical path when no ancestor exists at all', () => {
		const neverExisted = join(dir, 'a', 'b', 'c');
		expect(resolveRealPathBestEffort(neverExisted)).toBe(neverExisted);
	});
});
