import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import type { Env } from './env.ts';
import { LuziaConfigError } from './errors.ts';
import { providerModelFromEnv, resolveProviderModel, type ProviderModelConfig } from './providers.ts';

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
export type EmbeddingModelConfig = ProviderModelConfig<EmbeddingProvider, EmbeddingModelInstance>;

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

  const model = resolveProviderModel<EmbeddingModelInstance>(
    {
      configKey: 'embedding',
      label: 'embeddings',
      instanceDescription: 'an AI SDK embedding model',
      providers: EMBEDDING_PROVIDERS,
      unknownProviderHint: '(Anthropic has no embeddings API)',
    },
    embedding,
    env,
  );
  return { model, id: embeddingModelId(model) };
}

/** Identifies an embeddings model as `<provider>:<model id>`, e.g. `openai.embedding:text-embedding-3-small`. */
function embeddingModelId(model: EmbeddingModelInstance): string {
  return `${model.provider}:${model.modelId}`;
}

function embeddingModelConfigFromEnv(env: Env): { provider: string; model: string } | null {
  if (!env[EMBEDDING_PROVIDER_ENV] && !env[EMBEDDING_MODEL_ENV]) return null;
  const fromEnv = providerModelFromEnv(env, EMBEDDING_PROVIDER_ENV, EMBEDDING_MODEL_ENV);
  if (!fromEnv) {
    throw new LuziaConfigError(
      `Set both ${EMBEDDING_PROVIDER_ENV} (${Object.keys(EMBEDDING_PROVIDERS).join(' | ')}) and ${EMBEDDING_MODEL_ENV} ` +
        'to configure the embeddings model.',
    );
  }
  return fromEnv;
}
