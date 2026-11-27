import type { KnowledgeBaseChunk } from '../knowledge-base/compiled.ts';

export interface ScoredChunk {
  chunk: KnowledgeBaseChunk;
  /** Similarity to the query; higher is more relevant. */
  score: number;
}

/**
 * Where retrievable chunks are searched. v0.1 ships the in-memory
 * implementation; external stores (e.g. Chroma) can be adapters behind this.
 */
export interface VectorStore {
  /** The `k` chunks most similar to `queryVector`, most similar first. */
  search(queryVector: number[], k: number): Promise<ScoredChunk[]>;
}

/** A {@link VectorStore} over chunks held in memory, ranked by cosine similarity. */
export function createInMemoryVectorStore(chunks: readonly KnowledgeBaseChunk[]): VectorStore {
  const indexed = chunks.map((chunk) => ({ chunk, norm: norm(chunk.vector) }));

  return {
    async search(queryVector, k) {
      if (k <= 0) return [];
      const queryNorm = norm(queryVector);
      return indexed
        .map(({ chunk, norm: chunkNorm }) => ({
          chunk,
          score: queryNorm === 0 || chunkNorm === 0 ? 0 : dot(queryVector, chunk.vector) / (queryNorm * chunkNorm),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += a[i]! * b[i]!;
  return sum;
}

function norm(v: readonly number[]): number {
  return Math.sqrt(dot(v, v));
}
