import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import type { Env } from './chat-model.ts';
import { LuziaConfigError } from './errors.ts';

/** A ready-made AI SDK embedding model (any provider). */
export type EmbeddingModelInstance = Exclude<EmbeddingModel, string>;

/**
 * Built-in embeddings providers. Anthropic has no embeddings API, so an Owner
 * chatting with Claude picks one of these (with its own key) for retrieval.
 */
export const EMBEDDING_PROVIDERS = {
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    create: (apiKey: string, model: string) => createOpenAI({ apiKey }).embeddingModel(model),
  },
  google: {
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    create: (apiKey: string, model: string) => createGoogle({ apiKey }).embeddingModel(model),
  },
} as const;

export type EmbeddingProvider = keyof typeof EMBEDDING_PROVIDERS;

/**
 * How the embeddings model is chosen, independently of the chat model. Either
 * a built-in provider by name (API key read server-side from the provider's
 * environment variable unless given), or any AI SDK embedding model instance.
 */
export type EmbeddingModelConfig =
  | { provider: EmbeddingProvider; model: string; apiKey?: string }
  | { model: EmbeddingModelInstance };

/** Environment variables used when `embedding` is not configured explicitly. */
export const EMBEDDING_PROVIDER_ENV = 'LUZIA_EMBEDDING_PROVIDER';
export const EMBEDDING_MODEL_ENV = 'LUZIA_EMBEDDING_MODEL';

/** A resolved embeddings model and the id recorded in the compiled Knowledge Base. */
export interface ResolvedEmbeddingModel {
  model: EmbeddingModelInstance;
  id: string;
}

/**
 * Resolves the embeddings model from explicit config or, failing that, from
 * the environment. Returns `null` when neither configures one.
 */
export function resolveEmbeddingModel(
  config: EmbeddingModelConfig | undefined,
  env: Env,
): ResolvedEmbeddingModel | null {
  const embedding = config ?? embeddingModelConfigFromEnv(env);
  if (!embedding) return null;

  if (typeof embedding.model !== 'string') {
    return { model: embedding.model, id: embeddingModelId(embedding.model) };
  }
  if (!('provider' in embedding)) {
    throw new LuziaConfigError('embedding.model must be an AI SDK embedding model when no provider is given.');
  }

  const provider = EMBEDDING_PROVIDERS[embedding.provider];
  if (!provider) {
    throw new LuziaConfigError(
      `Unknown embeddings provider "${embedding.provider}". Use one of: ${Object.keys(EMBEDDING_PROVIDERS).join(', ')} ` +
        '(Anthropic has no embeddings API).',
    );
  }
  const apiKey = embedding.apiKey ?? env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new LuziaConfigError(
      `Missing API key for embeddings provider "${embedding.provider}". Set the ${provider.apiKeyEnv} environment variable.`,
    );
  }
  const model = provider.create(apiKey, embedding.model);
  return { model, id: embeddingModelId(model) };
}

/** Identifies an embeddings model as `<provider>:<model id>`, e.g. `openai.embedding:text-embedding-3-small`. */
function embeddingModelId(model: EmbeddingModelInstance): string {
  return `${model.provider}:${model.modelId}`;
}

function embeddingModelConfigFromEnv(env: Env): EmbeddingModelConfig | null {
  const provider = env[EMBEDDING_PROVIDER_ENV];
  const model = env[EMBEDDING_MODEL_ENV];
  if (!provider && !model) return null;
  if (!provider || !model) {
    throw new LuziaConfigError(
      `Set both ${EMBEDDING_PROVIDER_ENV} (${Object.keys(EMBEDDING_PROVIDERS).join(' | ')}) and ${EMBEDDING_MODEL_ENV} ` +
        'to configure the embeddings model.',
    );
  }
  return { provider: provider as EmbeddingProvider, model };
}
