#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

import { computeRuntimeApiFingerprint, RUNTIME_PACKAGE_JSON } from './compute-runtime-fingerprint.ts';

interface RuntimePackageJson {
	[key: string]: unknown;
	apiFingerprints?: Record<string, string>;
	version: string;
}

const pkg = JSON.parse(readFileSync(RUNTIME_PACKAGE_JSON, 'utf-8')) as RuntimePackageJson;
const fingerprint = computeRuntimeApiFingerprint();

pkg.apiFingerprints = { ...pkg.apiFingerprints, [pkg.version]: fingerprint };

writeFileSync(RUNTIME_PACKAGE_JSON, JSON.stringify(pkg, null, '\t') + '\n');

console.log(`Recorded apiFingerprints["${pkg.version}"] = ${fingerprint}`);
console.log(`Remember: bump the version first if this source change is meant to ship.`);
