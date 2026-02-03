/**
 * ZIP Archive Adapter Implementation
 *
 * Wraps 'archiver' and 'unzipper' libraries to provide a clean interface
 * for archive operations, isolating the application from direct dependencies.
 *
 */

import archiver from 'archiver';
import * as fs from 'fs';
import unzipper from 'unzipper';

import type { ArchiveAdapter, ArchiveEntry, ArchiveResult, CreateArchiveOptions } from './archive-adapter.interface';

/**
 * Default compression level for ZIP archives
 */
const DEFAULT_COMPRESSION_LEVEL = 9;

/**
 * ZIP archive adapter using archiver/unzipper libraries
 */
export class ZipArchiveAdapter implements ArchiveAdapter {
	/**
	 * Create a ZIP archive from entries
	 */
	async createArchive(
		outputPath: string,
		entries: ArchiveEntry[],
		options: CreateArchiveOptions = {}
	): Promise<ArchiveResult> {
		const compressionLevel = options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL;

		return new Promise((resolve, reject) => {
			const output = fs.createWriteStream(outputPath);
			const archive = archiver('zip', { zlib: { level: compressionLevel } });

			// Handle archive errors
			archive.on('error', (err: Error) => {
				reject(err);
			});

			// Handle stream close - archive is complete
			output.on('close', () => {
				resolve({
					outputPath,
					size: archive.pointer()
				});
			});

			// Handle output stream errors
			output.on('error', (err: Error) => {
				reject(err);
			});

			// Pipe archive to output file
			archive.pipe(output);

			// Add all entries to the archive
			for (const entry of entries) {
				archive.append(entry.content, { name: entry.name });
			}

			// Finalize the archive
			void archive.finalize();
		});
	}

	/**
	 * Extract a ZIP archive to a directory
	 */
	async extractArchive(archivePath: string, targetDir: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const readStream = fs.createReadStream(archivePath);

			readStream
				.pipe(unzipper.Extract({ path: targetDir }))
				.on('close', () => resolve())
				.on('error', reject);

			readStream.on('error', reject);
		});
	}
}

/**
 * Create a new ZIP archive adapter instance
 */
export function createArchiveAdapter(): ArchiveAdapter {
	return new ZipArchiveAdapter();
}
