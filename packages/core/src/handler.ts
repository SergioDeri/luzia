import { streamText, type ModelMessage } from 'ai';
import { z } from 'zod';
import { resolveChatModel, type ChatModelConfig, type Env } from './chat-model.ts';
import { errorResponse } from './http.ts';
import type { CompiledKnowledgeBase, KnowledgeBaseChunk } from './knowledge-base/compiled.ts';
import { loadCompiledKnowledgeBase } from './knowledge-base/load.ts';
import { assembleSystemPrompt } from './prompt/system-prompt.ts';

export interface LuziaHandlerConfig {
  /** The compiled Knowledge Base produced by `luzia build` (e.g. its imported JSON). */
  knowledgeBase: CompiledKnowledgeBase;
  /**
   * The chat model. When omitted it is read from the LUZIA_CHAT_PROVIDER and
   * LUZIA_CHAT_MODEL environment variables.
   */
  chat?: ChatModelConfig;
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

  return async function luziaHandler(request) {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST to chat with luzIA.', { allow: 'POST' });
    }

    const body = chatRequestBodySchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) {
      return errorResponse(400, 'invalid_request', 'Expected a JSON body like { "messages": [{ "role": "user", "content": "..." }] }.');
    }

    const messages: ModelMessage[] = body.data.messages;
    const retrievedChunks: KnowledgeBaseChunk[] = [];

    const result = streamText({
      model,
      // AI SDK "instructions" is the system prompt; the Owner's Instructions are one part of it.
      instructions: assembleSystemPrompt({ knowledgeBase, retrievedChunks }),
      messages,
    });

    return result.toTextStreamResponse();
  };
}
