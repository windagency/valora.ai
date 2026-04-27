import type { EmbeddingRequest, EmbeddingResult } from 'types/llm.types';

export type { EmbeddingRequest, EmbeddingResult };

export interface EmbedderPort {
	embed(req: EmbeddingRequest): Promise<EmbeddingResult>;
}
