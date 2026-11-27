import { streamText, type ModelMessage } from 'ai';
import { z } from 'zod';
import { resolveChatModel, type ChatModelConfig, type Env } from './chat-model.ts';
import type { EmbeddingModelConfig } from './embedding-model.ts';
import { errorResponse } from './http.ts';
import type { CompiledKnowledgeBase } from './knowledge-base/compiled.ts';
import { loadCompiledKnowledgeBase } from './knowledge-base/load.ts';
import { assembleSystemPrompt } from './prompt/system-prompt.ts';
import { replyResponse } from './reply-stream.ts';
import { createProtection, type ProtectionConfig } from './protection/index.ts';
import { createRetriever, type RetrievalOptions } from './retrieval/retriever.ts';

export interface LuziaHandlerConfig extends ProtectionConfig {
  /** The compiled Knowledge Base produced by `luzia build` (e.g. its imported JSON). */
  knowledgeBase: CompiledKnowledgeBase;
  /**
   * The chat model. When omitted it is read from the LUZIA_CHAT_PROVIDER and
   * LUZIA_CHAT_MODEL environment variables.
   */
  chat?: ChatModelConfig;
  /**
   * The embeddings model used to search the Knowledge Base. Must match the one
   * `luzia build` used. When omitted it is read from the LUZIA_EMBEDDING_PROVIDER
   * and LUZIA_EMBEDDING_MODEL environment variables. Not needed for a Core-only
   * Knowledge Base.
   */
  embedding?: EmbeddingModelConfig;
  /** Retrieval settings (top-k, vector store). */
  retrieval?: RetrievalOptions;
  /** Where server-side settings and API keys are read from. Defaults to `process.env`. */
  env?: Env;
}

/** A framework-agnostic handler: Web `Request` in, Web `Response` out. */
export type LuziaHandler = (request: Request) => Promise<Response>;

/** Shape of the JSON body the chat endpoint accepts. */
export const chatRequestBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      message: 'The last message must be from the user.',
    }),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;

/**
 * Creates the luzIA server handler. Validates configuration eagerly, so a
 * missing API key or invalid Knowledge Base fails at startup, not on first chat.
 */
export function createLuziaHandler(config: LuziaHandlerConfig): LuziaHandler {
  const env = config.env ?? globalThis.process?.env ?? {};
  const knowledgeBase = loadCompiledKnowledgeBase(config.knowledgeBase);
  const model = resolveChatModel(config.chat, env);
  // Origins, CORS and limits: see ./protection.
  const protection = createProtection(config, env);
  const retrieve = createRetriever({
    knowledgeBase,
    embedding: config.embedding,
    env,
    ...(config.retrieval ? { retrieval: config.retrieval } : {}),
  });

  return protection.wrap(async function luziaHandler(request) {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST to chat with luzIA.', { allow: 'POST' });
    }

    const body = chatRequestBodySchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) {
      return errorResponse(400, 'invalid_request', 'Expected a JSON body like { "messages": [{ "role": "user", "content": "..." }] }.');
    }

    const overLimit = protection.checkLimits(body.data.messages);
    if (overLimit) return overLimit;

    const messages: ModelMessage[] = body.data.messages;
    const retrievedChunks = await retrieve(body.data.messages);

    const result = streamText({
      model,
      // AI SDK "instructions" is the system prompt; the Owner's Instructions are one part of it.
      instructions: assembleSystemPrompt({ knowledgeBase, retrievedChunks }),
      messages,
      maxOutputTokens: protection.limits.maxOutputTokens,
    });

    return replyResponse(result.fullStream);
  });
}
