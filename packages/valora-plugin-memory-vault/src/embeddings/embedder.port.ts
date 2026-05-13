import type {
	PluginEmbeddingRequest as EmbeddingRequest,
	PluginEmbeddingResult as EmbeddingResult
} from '@windagency/valora-plugin-api';

export type { EmbeddingRequest, EmbeddingResult };

export interface EmbedderPort {
	embed(req: EmbeddingRequest): Promise<EmbeddingResult>;
}
