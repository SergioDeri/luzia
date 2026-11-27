import { embed } from 'ai';
import type { Env } from '../env.ts';
import {
  EMBEDDING_MODEL_ENV,
  EMBEDDING_PROVIDER_ENV,
  resolveEmbeddingModel,
  type EmbeddingModelConfig,
} from '../embedding-model.ts';
import { LuziaConfigError } from '../errors.ts';
import type { CompiledKnowledgeBase, KnowledgeBaseChunk } from '../knowledge-base/compiled.ts';
import { createInMemoryVectorStore, type VectorStore } from './vector-store.ts';

export const DEFAULT_TOP_K = 4;

export interface RetrievalOptions {
  /** How many chunks are added to the prompt per request. Defaults to {@link DEFAULT_TOP_K}. */
  topK?: number;
  /** Where chunks are searched. Defaults to an in-memory store over the compiled Knowledge Base. */
  vectorStore?: VectorStore;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Finds the chunks relevant to the Visitor's latest message. */
export type Retriever = (messages: readonly ConversationMessage[]) => Promise<KnowledgeBaseChunk[]>;

/**
 * Creates the retriever for a compiled Knowledge Base. A Knowledge Base
 * without chunks (Core only) needs no embeddings model and retrieves nothing.
 * Otherwise the configured embeddings model must be the one the chunks were
 * built with, or this throws a {@link LuziaConfigError}.
 */
export function createRetriever(options: {
  knowledgeBase: CompiledKnowledgeBase;
  embedding: EmbeddingModelConfig | undefined;
  env: Env;
  retrieval?: RetrievalOptions;
}): Retriever {
  const { knowledgeBase } = options;
  if (knowledgeBase.chunks.length === 0) return async () => [];

  const built = knowledgeBase.embeddingModel;
  const embedding = resolveEmbeddingModel(options.embedding, options.env);
  if (!embedding) {
    throw new LuziaConfigError(
      `The compiled Knowledge Base was embedded with "${built}", but no embeddings model is configured on the server. ` +
        `Set ${EMBEDDING_PROVIDER_ENV} and ${EMBEDDING_MODEL_ENV} (and the provider's API key) to the same model used ` +
        'by `luzia build`, or pass `embedding` to createLuziaHandler.',
    );
  }
  if (embedding.id !== built) {
    throw new LuziaConfigError(
      `Embeddings model mismatch: the compiled Knowledge Base was embedded with "${built}", but the server is ` +
        `configured with "${embedding.id}". Configure the same model for \`luzia build\` and the server, then rebuild.`,
    );
  }

  const topK = options.retrieval?.topK ?? DEFAULT_TOP_K;
  const vectorStore = options.retrieval?.vectorStore ?? createInMemoryVectorStore(knowledgeBase.chunks);

  return async (messages) => {
    const { embedding: queryVector } = await embed({ model: embedding.model, value: retrievalQuery(messages) });
    const results = await vectorStore.search(queryVector, topK);
    return results.map((result) => result.chunk);
  };
}

/**
 * The text embedded for retrieval: the Visitor's latest message, preceded by
 * their previous one as light context so short follow-ups ("and in Go?") still
 * find the right chunks.
 */
function retrievalQuery(messages: readonly ConversationMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.content)
    .join('\n');
}
