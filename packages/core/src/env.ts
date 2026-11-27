/** Server-side settings and API keys, as environment variables. */
export type Env = Record<string, string | undefined>;

/** The environment to read settings from: `env` when given, else `process.env` where there is one. */
export function serverEnv(env?: Env): Env {
  return env ?? globalThis.process?.env ?? {};
}
