/**
 * The compiled Knowledge Base: the single JSON artifact `luzia build` emits and
 * the handler loads. It is plain data so it can be imported as JSON in any
 * serverless runtime.
 */
export const COMPILED_KNOWLEDGE_BASE_FORMAT = 1;

export interface KnowledgeBaseDocument {
  /** Path of the source file, relative to the Knowledge Base folder. */
  source: string;
  text: string;
}

/**
 * A retrievable piece of the Knowledge Base (everything except Core and
 * Instructions). Populated by the chunking/embedding step of the build.
 */
export interface KnowledgeBaseChunk {
  source: string;
  /** Heading path the chunk lives under, outermost first. */
  headings: string[];
  text: string;
  vector: number[];
}

export interface CompiledKnowledgeBase {
  format: typeof COMPILED_KNOWLEDGE_BASE_FORMAT;
  /** Always given to the Agent in full. */
  core: KnowledgeBaseDocument;
  /** Owner's behavioural guidance. Not facts, and never part of retrieval. */
  instructions: KnowledgeBaseDocument | null;
  /** Retrievable content. Empty until retrieval is configured. */
  chunks: KnowledgeBaseChunk[];
  /** Id of the embeddings model the chunk vectors were made with, if any. */
  embeddingModel: string | null;
}
