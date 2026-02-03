/**
 * Archive Adapter Interface
 *
 * Abstracts archive operations (ZIP creation/extraction) to:
 * - Enable easier testing with mock implementations
 * - Allow library replacement without changing business logic
 * - Isolate third-party library breaking changes
 *
 */

/**
 * Entry to add to an archive
 */
export interface ArchiveEntry {
	/** Content as string or Buffer */
	content: Buffer | string;
	/** Name/path within the archive */
	name: string;
}

/**
 * Result of archive creation
 */
export interface ArchiveResult {
	/** Path to the created archive */
	outputPath: string;
	/** Size of the archive in bytes */
	size: number;
}

/**
 * Options for archive creation
 */
export interface CreateArchiveOptions {
	/** Compression level (0-9, where 9 is maximum compression) */
	compressionLevel?: number;
}

/**
 * Archive adapter interface for ZIP operations
 *
 * Wraps archive libraries (archiver, unzipper) to isolate the application
 * from direct third-party library dependencies.
 */
export interface ArchiveAdapter {
	/**
	 * Create a ZIP archive from entries
	 *
	 * @param outputPath - Path where the archive will be written
	 * @param entries - Array of entries to add to the archive
	 * @param options - Optional archive creation options
	 * @returns Archive result with path and size
	 */
	createArchive(outputPath: string, entries: ArchiveEntry[], options?: CreateArchiveOptions): Promise<ArchiveResult>;

	/**
	 * Extract a ZIP archive to a directory
	 *
	 * @param archivePath - Path to the archive file
	 * @param targetDir - Directory where contents will be extracted
	 */
	extractArchive(archivePath: string, targetDir: string): Promise<void>;
}
