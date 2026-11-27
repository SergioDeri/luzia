import type { Env } from './env.ts';
import { LuziaConfigError } from './errors.ts';

/** A built-in provider: where its API key is read from and how a model is made from a key and a model id. */
export interface BuiltInProvider<Model> {
  apiKeyEnv: string;
  create: (apiKey: string, model: string) => Model;
}

/** Either a built-in provider by name (with an optional API key), or a ready-made model instance. */
export type ProviderModelConfig<Provider extends string, Instance> =
  | { provider: Provider; model: string; apiKey?: string }
  | { model: Instance };

export interface ProviderKind<Model> {
  /** The handler config key, e.g. `chat`, used in error messages. */
  configKey: string;
  /** What the model is, e.g. `chat` or `embeddings`, used in error messages. */
  label: string;
  /** What an instance must be, e.g. `an AI SDK language model`. */
  instanceDescription: string;
  providers: Readonly<Record<string, BuiltInProvider<Model>>>;
  /** Appended to the unknown-provider error. */
  unknownProviderHint?: string;
}

/**
 * Resolves a model config against a table of built-in providers: an instance
 * is used as is; a provider name is looked up and its API key taken from the
 * config or the provider's environment variable. Throws a
 * {@link LuziaConfigError} for an unknown provider or a missing key.
 */
export function resolveProviderModel<Model>(
  kind: ProviderKind<Model>,
  config: { provider?: string; model: string | Model; apiKey?: string },
  env: Env,
): Model {
  if (typeof config.model !== 'string') return config.model;
  if (config.provider === undefined) {
    throw new LuziaConfigError(`${kind.configKey}.model must be ${kind.instanceDescription} when no provider is given.`);
  }

  const provider = Object.hasOwn(kind.providers, config.provider) ? kind.providers[config.provider] : undefined;
  if (!provider) {
    throw new LuziaConfigError(
      `Unknown ${kind.label} provider "${config.provider}". Use one of: ${Object.keys(kind.providers).join(', ')}` +
        `${kind.unknownProviderHint ? ` ${kind.unknownProviderHint}` : ''}.`,
    );
  }
  const apiKey = config.apiKey ?? env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new LuziaConfigError(
      `Missing API key for ${kind.label} provider "${config.provider}". Set the ${provider.apiKeyEnv} environment variable where luzIA runs.`,
    );
  }
  return provider.create(apiKey, config.model);
}

/** The provider and model named by a pair of environment variables, `null` if either is unset. */
export function providerModelFromEnv(
  env: Env,
  providerEnv: string,
  modelEnv: string,
): { provider: string; model: string } | null {
  const provider = env[providerEnv];
  const model = env[modelEnv];
  return provider && model ? { provider, model } : null;
}
