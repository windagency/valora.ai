import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { StageOutput } from 'types/command.types';

import { getRuntimeDataDir } from 'utils/paths';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface StageCheckpoint {
	completedAt: string;
	output: StageOutput;
	stageIndex: number;
	stageName: string;
}

interface CheckpointFile {
	checkpoints: StageCheckpoint[];
	commandName: string;
	createdAt: string;
	sessionId: string;
}

export class CheckpointManager {
	private readonly dataDir: string;
	private readonly ttlMs: number;

	constructor(dataDir?: string, ttlMs: number = DEFAULT_TTL_MS) {
		this.dataDir = dataDir ?? join(getRuntimeDataDir(), 'checkpoints');
		this.ttlMs = ttlMs;
	}

	clear(sessionId: string, commandName: string): void {
		const filePath = this.filePath(sessionId, commandName);
		if (existsSync(filePath)) {
			rmSync(filePath);
		}
	}

	read(sessionId: string, commandName: string): StageCheckpoint[] {
		const filePath = this.filePath(sessionId, commandName);
		if (!existsSync(filePath)) return [];

		try {
			const raw = readFileSync(filePath, 'utf-8') as string;
			const file = JSON.parse(raw) as CheckpointFile;
			if (this.isExpired(file.createdAt)) {
				rmSync(filePath);
				return [];
			}
			return file.checkpoints;
		} catch {
			return [];
		}
	}

	write(sessionId: string, commandName: string, checkpoint: StageCheckpoint): void {
		mkdirSync(this.dataDir, { recursive: true });
		const filePath = this.filePath(sessionId, commandName);
		const existing = this.read(sessionId, commandName);
		const file: CheckpointFile = {
			checkpoints: [...existing, checkpoint],
			commandName,
			createdAt: existsSync(filePath) ? this.readCreatedAt(filePath) : new Date().toISOString(),
			sessionId
		};
		writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
	}

	private filePath(sessionId: string, commandName: string): string {
		return join(this.dataDir, `${sessionId}-${commandName}.json`);
	}

	private isExpired(createdAt: string): boolean {
		return Date.now() - new Date(createdAt).getTime() >= this.ttlMs;
	}

	private readCreatedAt(filePath: string): string {
		try {
			const raw = readFileSync(filePath, 'utf-8') as string;
			const file = JSON.parse(raw) as CheckpointFile;
			return file.createdAt;
		} catch {
			return new Date().toISOString();
		}
	}
}
