/**
 * Session export/import functionality with ZIP archives
 *
 */

import type { Session } from 'types/session.types';

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { getLogger } from 'output/logger';
import * as path from 'path';
import { SessionError } from 'utils/error-handler';

import type { ArchiveAdapter, ArchiveEntry } from './archive-adapter.interface';
import type { SessionStore } from './store';

export interface ExportMetadata {
	checksums: Record<string, string>;
	exportedAt: string;
	sessionId: string;
	version: string;
}

export interface ExportOptions {
	includeArtifacts?: boolean;
	outputPath?: string;
}

export interface ImportOptions {
	overwrite?: boolean;
	targetSessionId?: string;
}

export class SessionExporter {
	constructor(
		private sessionStore: SessionStore,
		private archiveAdapter: ArchiveAdapter
	) {}

	/**
	 * Export a session as a ZIP archive
	 */
	async exportSession(sessionId: string, options: ExportOptions = {}): Promise<string> {
		const logger = getLogger();
		const includeArtifacts = options.includeArtifacts ?? true;

		try {
			// Load session
			const session = await this.sessionStore.loadSession(sessionId);

			// Determine output path
			const outputPath = options.outputPath ?? path.join(process.cwd(), `session-${sessionId}-${Date.now()}.zip`);

			// Prepare archive entries
			const entries: ArchiveEntry[] = [];
			const checksums: Record<string, string> = {};

			// Add session.json
			const sessionJson = JSON.stringify(session, null, 2);
			entries.push({ content: sessionJson, name: 'session.json' });
			checksums['session.json'] = this.calculateChecksum(sessionJson);

			// Add artifacts if they exist and includeArtifacts is true
			if (includeArtifacts) {
				const sessionDir = path.join(this.sessionStore.getSessionsDir(), sessionId);
				try {
					const stats = await fs.stat(sessionDir);
					if (stats.isDirectory()) {
						const files = await fs.readdir(sessionDir);

						// Process artifacts
						await Promise.all(
							files
								.filter((file) => !file.endsWith('.json')) // Skip session.json
								.map(async (file) => {
									const filePath = path.join(sessionDir, file);
									try {
										const fileStats = await fs.stat(filePath);
										if (fileStats.isFile()) {
											const content = await fs.readFile(filePath);
											entries.push({ content, name: `artifacts/${file}` });
											checksums[`artifacts/${file}`] = this.calculateChecksum(content.toString());
										}
									} catch (error) {
										logger.warn(`Failed to read artifact ${file}`, { error, sessionId });
									}
								})
						);
					}
				} catch {
					// Session directory doesn't exist - that's okay
					logger.debug('No artifacts directory found for session', { sessionId });
				}
			}

			// Add metadata
			const metadata: ExportMetadata = {
				checksums,
				exportedAt: new Date().toISOString(),
				sessionId: session.session_id,
				version: '1.0.0'
			};
			entries.push({ content: JSON.stringify(metadata, null, 2), name: 'metadata.json' });

			// Create archive using adapter
			const result = await this.archiveAdapter.createArchive(outputPath, entries, { compressionLevel: 9 });

			logger.info('Session exported successfully', {
				outputPath: result.outputPath,
				sessionId,
				size: result.size
			});

			return result.outputPath;
		} catch (error) {
			logger.error('Failed to export session', error as Error, { sessionId });
			throw new SessionError(`Failed to export session: ${(error as Error).message}`, {
				error: (error as Error).message,
				sessionId
			});
		}
	}

	/**
	 * Read and parse metadata from extracted archive
	 */
	private async readMetadata(tempDir: string): Promise<ExportMetadata | null> {
		const logger = getLogger();
		const metadataPath = path.join(tempDir, 'metadata.json');

		try {
			const metadataContent = await fs.readFile(metadataPath, 'utf-8');
			return JSON.parse(metadataContent) as ExportMetadata;
		} catch {
			logger.warn('No metadata found in archive, proceeding without validation');
			return null;
		}
	}

	/**
	 * Read and verify session data
	 */
	private async readAndVerifySession(tempDir: string, metadata: ExportMetadata | null): Promise<Session> {
		const sessionPath = path.join(tempDir, 'session.json');
		const sessionContent = await fs.readFile(sessionPath, 'utf-8');
		const session = JSON.parse(sessionContent) as Session;

		// Verify checksum if metadata exists
		if (metadata?.checksums?.['session.json']) {
			const actualChecksum = this.calculateChecksum(sessionContent);
			if (actualChecksum !== metadata.checksums['session.json']) {
				throw new SessionError('Session file checksum mismatch - file may be corrupted');
			}
		}

		return session;
	}

	/**
	 * Import artifacts from extracted archive
	 */
	private async importArtifacts(
		tempDir: string,
		targetSessionId: string,
		metadata: ExportMetadata | null
	): Promise<void> {
		const logger = getLogger();
		const artifactsDir = path.join(tempDir, 'artifacts');

		try {
			const stats = await fs.stat(artifactsDir);
			if (!stats.isDirectory()) {
				return;
			}

			const targetArtifactsDir = path.join(this.sessionStore.getSessionsDir(), targetSessionId);
			await fs.mkdir(targetArtifactsDir, { recursive: true });

			const files = await fs.readdir(artifactsDir);

			// Process and verify artifacts using functional pattern
			await Promise.all(
				files.map(async (file) => {
					const sourcePath = path.join(artifactsDir, file);
					const targetPath = path.join(targetArtifactsDir, file);

					// Verify checksum if metadata exists
					if (metadata?.checksums?.[`artifacts/${file}`]) {
						const content = await fs.readFile(sourcePath, 'utf-8');
						const actualChecksum = this.calculateChecksum(content);
						if (actualChecksum !== metadata.checksums[`artifacts/${file}`]) {
							logger.warn(`Artifact ${file} checksum mismatch, skipping`, {
								file,
								sessionId: targetSessionId
							});
							return; // Skip this file
						}
					}

					await fs.copyFile(sourcePath, targetPath);
				})
			);

			logger.debug('Artifacts imported', {
				count: files.length,
				sessionId: targetSessionId
			});
		} catch {
			// No artifacts directory - that's okay
			logger.debug('No artifacts found in archive', { sessionId: targetSessionId });
		}
	}

	/**
	 * Import a session from a ZIP archive
	 */
	async importSession(zipPath: string, options: ImportOptions = {}): Promise<Session> {
		const logger = getLogger();

		try {
			// Verify file exists
			await fs.access(zipPath);

			// Create temporary extraction directory
			const tempDir = path.join(this.sessionStore.getSessionsDir(), '.temp-import-' + Date.now());
			await fs.mkdir(tempDir, { recursive: true });

			try {
				// Extract ZIP using adapter
				await this.archiveAdapter.extractArchive(zipPath, tempDir);

				// Read metadata
				const metadata = await this.readMetadata(tempDir);

				// Read and verify session
				const session = await this.readAndVerifySession(tempDir, metadata);

				// Determine target session ID
				const targetSessionId = options.targetSessionId ?? session.session_id;

				// Check if session already exists
				const exists = await this.sessionStore.sessionExists(targetSessionId);
				if (exists && !options.overwrite) {
					throw new SessionError(`Session ${targetSessionId} already exists. Use --overwrite to replace it.`, {
						sessionId: targetSessionId
					});
				}

				// Update session ID if different
				if (targetSessionId !== session.session_id) {
					session.session_id = targetSessionId;
				}

				// Save session
				await this.sessionStore.saveSession(session);

				// Import artifacts if they exist
				await this.importArtifacts(tempDir, targetSessionId, metadata);

				logger.info('Session imported successfully', {
					sessionId: targetSessionId,
					sourcePath: zipPath
				});

				return session;
			} finally {
				// Clean up temp directory
				await fs.rm(tempDir, { force: true, recursive: true });
			}
		} catch (error) {
			logger.error('Failed to import session', error as Error, { zipPath });
			throw new SessionError(`Failed to import session: ${(error as Error).message}`, {
				error: (error as Error).message,
				zipPath
			});
		}
	}

	/**
	 * Calculate SHA-256 checksum of content
	 */
	private calculateChecksum(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex');
	}

	/**
	 * Get export statistics
	 */
	async getExportStats(zipPath: string): Promise<{
		artifactCount: number;
		commandCount: number;
		exportedAt: string;
		sessionId: string;
		size: number;
	}> {
		try {
			const stats = await fs.stat(zipPath);

			// Create temporary extraction directory
			const tempDir = path.join(this.sessionStore.getSessionsDir(), '.temp-stats-' + Date.now());
			await fs.mkdir(tempDir, { recursive: true });

			try {
				// Extract using adapter
				await this.archiveAdapter.extractArchive(zipPath, tempDir);

				// Read metadata
				const metadataPath = path.join(tempDir, 'metadata.json');
				const metadataContent = await fs.readFile(metadataPath, 'utf-8');
				const metadata = JSON.parse(metadataContent) as ExportMetadata;

				// Read session
				const sessionPath = path.join(tempDir, 'session.json');
				const sessionContent = await fs.readFile(sessionPath, 'utf-8');
				const session = JSON.parse(sessionContent) as Session;

				// Count artifacts
				let artifactCount = 0;
				const artifactsDir = path.join(tempDir, 'artifacts');
				try {
					const files = await fs.readdir(artifactsDir);
					artifactCount = files.length;
				} catch {
					// No artifacts
				}

				return {
					artifactCount,
					commandCount: session.commands.length,
					exportedAt: metadata.exportedAt,
					sessionId: metadata.sessionId,
					size: stats.size
				};
			} finally {
				await fs.rm(tempDir, { force: true, recursive: true });
			}
		} catch (error) {
			throw new SessionError(`Failed to get export stats: ${(error as Error).message}`, {
				error: (error as Error).message,
				zipPath
			});
		}
	}
}
