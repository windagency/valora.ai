import { realpathSync } from 'fs';
import * as path from 'path';

/**
 * Resolve `candidatePath` to its real (symlink-free) form, walking up to the
 * nearest existing ancestor when the path itself doesn't exist yet (e.g. a
 * file about to be created inside an existing, possibly symlinked, directory)
 * and rejoining the non-existent remainder onto the resolved ancestor.
 * Falls back to the original lexical path if no ancestor exists at all
 * (filesystem root reached with nothing resolvable).
 *
 * Path scoping/identity checks based on lexical resolution alone (`path.resolve`)
 * can be defeated by a symlinked directory component — this closes that gap
 * for any caller that needs to compare or scope real filesystem locations.
 */
export function resolveRealPathBestEffort(candidatePath: string): string {
	let current = candidatePath;
	let suffix = '';

	while (true) {
		try {
			const real = realpathSync(current);
			return suffix ? path.join(real, suffix) : real;
		} catch {
			const parent = path.dirname(current);
			if (parent === current) return suffix ? path.join(current, suffix) : current;
			suffix = suffix ? path.join(path.basename(current), suffix) : path.basename(current);
			current = parent;
		}
	}
}
