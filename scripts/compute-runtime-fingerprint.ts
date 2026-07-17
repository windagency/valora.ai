import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RUNTIME_DIR = path.resolve(__dirname, '..', 'packages', 'valora-runtime');
export const RUNTIME_SRC_DIR = path.join(RUNTIME_DIR, 'src');
export const RUNTIME_PACKAGE_JSON = path.join(RUNTIME_DIR, 'package.json');

function getRuntimeSourceFiles(): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(RUNTIME_SRC_DIR, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
		files.push(path.join(RUNTIME_SRC_DIR, entry.name));
	}
	return files.sort();
}

/**
 * Fingerprints valora-runtime's entire public source tree (not just the
 * exported symbol list) so any change to its published behaviour — not only
 * signature changes — requires a version bump. Deliberately simple: hashing
 * full file contents avoids building an AST-diff of the public API surface.
 */
export function computeRuntimeApiFingerprint(): string {
	const hash = crypto.createHash('sha256');
	for (const file of getRuntimeSourceFiles()) {
		hash.update(path.relative(RUNTIME_SRC_DIR, file));
		hash.update('\n');
		hash.update(fs.readFileSync(file, 'utf-8'));
	}
	return hash.digest('hex');
}
