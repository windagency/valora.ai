import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createArchiveAdapter } from './archive-adapter';
import { SessionExporter } from './session-exporter';
import { SessionStore } from './store';

describe('SessionExporter (real ZIP archives, real SessionStore)', () => {
	let sessionsDir: string;
	let store: SessionStore;
	let exporter: SessionExporter;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-session-exporter-'));
		store = new SessionStore(sessionsDir);
		exporter = new SessionExporter(store, createArchiveAdapter());
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	describe('exportSession / importSession round-trip', () => {
		it('exports a session to a real zip file and imports it back with matching content', async () => {
			const session = await store.createSession('sess-export-1');
			session.context = { note: 'hello world' };
			await store.saveSession(session);
			const zipPath = path.join(sessionsDir, 'export.zip');

			const outputPath = await exporter.exportSession('sess-export-1', { outputPath: zipPath });

			expect(fs.existsSync(outputPath)).toBe(true);

			await store.deleteSession('sess-export-1');
			await expect(store.sessionExists('sess-export-1')).resolves.toBe(false);

			const imported = await exporter.importSession(outputPath);

			expect(imported.session_id).toBe('sess-export-1');
			expect(imported.context).toEqual({ note: 'hello world' });
			await expect(store.sessionExists('sess-export-1')).resolves.toBe(true);
		});

		it('includes artifact files alongside the session and restores them on import', async () => {
			const session = await store.createSession('sess-with-artifacts');
			await store.saveSession(session);
			const artifactsSourceDir = path.join(sessionsDir, 'sess-with-artifacts');
			fs.mkdirSync(artifactsSourceDir, { recursive: true });
			fs.writeFileSync(path.join(artifactsSourceDir, 'notes.txt'), 'artifact content');
			const zipPath = path.join(sessionsDir, 'export-with-artifacts.zip');

			await exporter.exportSession('sess-with-artifacts', { outputPath: zipPath });
			await store.deleteSession('sess-with-artifacts');
			rmSync(artifactsSourceDir, { force: true, recursive: true });

			await exporter.importSession(zipPath);

			const restoredArtifact = path.join(sessionsDir, 'sess-with-artifacts', 'notes.txt');
			expect(fs.existsSync(restoredArtifact)).toBe(true);
			expect(fs.readFileSync(restoredArtifact, 'utf8')).toBe('artifact content');
		});

		it('omits artifacts when includeArtifacts is false', async () => {
			const session = await store.createSession('sess-no-artifacts');
			await store.saveSession(session);
			const artifactsSourceDir = path.join(sessionsDir, 'sess-no-artifacts');
			fs.mkdirSync(artifactsSourceDir, { recursive: true });
			fs.writeFileSync(path.join(artifactsSourceDir, 'notes.txt'), 'artifact content');
			const zipPath = path.join(sessionsDir, 'export-no-artifacts.zip');

			await exporter.exportSession('sess-no-artifacts', { includeArtifacts: false, outputPath: zipPath });
			await store.deleteSession('sess-no-artifacts');
			rmSync(artifactsSourceDir, { force: true, recursive: true });

			await exporter.importSession(zipPath);

			const restoredArtifact = path.join(sessionsDir, 'sess-no-artifacts', 'notes.txt');
			expect(fs.existsSync(restoredArtifact)).toBe(false);
		});

		it('rejects export of a session that does not exist', async () => {
			await expect(exporter.exportSession('does-not-exist')).rejects.toThrow(/Failed to export session/);
		});

		it('imports under a different session id when targetSessionId is given', async () => {
			const session = await store.createSession('sess-original');
			await store.saveSession(session);
			const zipPath = path.join(sessionsDir, 'export-retarget.zip');
			await exporter.exportSession('sess-original', { outputPath: zipPath });

			const imported = await exporter.importSession(zipPath, { targetSessionId: 'sess-renamed' });

			expect(imported.session_id).toBe('sess-renamed');
			await expect(store.sessionExists('sess-renamed')).resolves.toBe(true);
		});

		it('rejects importing over an existing session unless overwrite is set', async () => {
			const session = await store.createSession('sess-conflict');
			await store.saveSession(session);
			const zipPath = path.join(sessionsDir, 'export-conflict.zip');
			await exporter.exportSession('sess-conflict', { outputPath: zipPath });
			// Session already exists on disk (never deleted) - importing without overwrite must fail.

			await expect(exporter.importSession(zipPath)).rejects.toThrow(/already exists/);

			await expect(exporter.importSession(zipPath, { overwrite: true })).resolves.toMatchObject({
				session_id: 'sess-conflict'
			});
		});

		it('rejects import of a session.json whose checksum does not match the recorded metadata', async () => {
			const session = await store.createSession('sess-tamper');
			await store.saveSession(session);
			const zipPath = path.join(sessionsDir, 'export-tamper.zip');
			await exporter.exportSession('sess-tamper', { outputPath: zipPath });
			await store.deleteSession('sess-tamper');

			const tamperedZip = await tamperWithSessionJson(zipPath, sessionsDir);

			await expect(exporter.importSession(tamperedZip)).rejects.toThrow(/checksum mismatch/);
		});

		it('rejects import when the zip file does not exist', async () => {
			await expect(exporter.importSession(path.join(sessionsDir, 'does-not-exist.zip'))).rejects.toThrow(
				/Failed to import session/
			);
		});
	});

	describe('getExportStats', () => {
		it('reports command, artifact counts, and size for a real exported archive', async () => {
			const session = await store.createSession('sess-stats');
			session.commands.push({
				args: [],
				command: 'test',
				duration_ms: 1,
				flags: {},
				outputs: {},
				success: true,
				timestamp: new Date().toISOString()
			});
			await store.saveSession(session);
			const artifactsSourceDir = path.join(sessionsDir, 'sess-stats');
			fs.mkdirSync(artifactsSourceDir, { recursive: true });
			fs.writeFileSync(path.join(artifactsSourceDir, 'a.txt'), 'a');
			fs.writeFileSync(path.join(artifactsSourceDir, 'b.txt'), 'b');
			const zipPath = path.join(sessionsDir, 'export-stats.zip');
			await exporter.exportSession('sess-stats', { outputPath: zipPath });

			const stats = await exporter.getExportStats(zipPath);

			expect(stats.sessionId).toBe('sess-stats');
			expect(stats.commandCount).toBe(1);
			expect(stats.artifactCount).toBe(2);
			expect(stats.size).toBeGreaterThan(0);
		});
	});
});

/**
 * Re-zips a real exported archive with session.json's content mutated after
 * the checksum in metadata.json was already computed, to exercise the
 * tamper-detection path without hand-constructing zip bytes.
 */
async function tamperWithSessionJson(zipPath: string, workDir: string): Promise<string> {
	const adapter = createArchiveAdapter();
	const extractDir = path.join(workDir, 'tamper-extract');
	fs.mkdirSync(extractDir, { recursive: true });
	await adapter.extractArchive(zipPath, extractDir);

	const sessionJsonPath = path.join(extractDir, 'session.json');
	const original = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8')) as Record<string, unknown>;
	fs.writeFileSync(sessionJsonPath, JSON.stringify({ ...original, context: { tampered: true } }, null, 2));

	const entries = fs.readdirSync(extractDir).map((name) => ({
		content: fs.readFileSync(path.join(extractDir, name)),
		name
	}));
	const tamperedZipPath = path.join(workDir, 'tampered.zip');
	await adapter.createArchive(tamperedZipPath, entries);
	return tamperedZipPath;
}
