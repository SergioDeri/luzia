import type { ChatModelInstance, EmbeddingModelInstance } from 'luzia-core';
import type { CommandRunner } from './init/command-runner.ts';
import type { Prompter } from './init/prompter.ts';

/** What a command can use to talk to the outside world. Injected so commands are testable. */
export interface CliIo {
  /** Directory relative paths are resolved against. */
  cwd: string;
  stdout(line: string): void;
  stderr(line: string): void;
  /** Server-side environment (API keys, model settings). Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /**
   * Asks the Owner questions (`luzia init`). Only present when running in an
   * interactive terminal; commands that need it fail fast without it.
   */
  prompter?: Prompter;
  /** Runs external commands (package install, Vercel CLI). Defaults to running real processes. */
  runner?: CommandRunner;
  /**
   * The chat model `luzia init` drafts with. Defaults to the model the Owner
   * chooses in the wizard, with the key they enter.
   */
  chatModel?: ChatModelInstance;
  /**
   * The embeddings model `luzia build` (and `luzia init`'s build) embeds with.
   * Defaults to LUZIA_EMBEDDING_PROVIDER / LUZIA_EMBEDDING_MODEL with the provider's key.
   */
  embeddingModel?: EmbeddingModelInstance;
}

export interface CliCommand {
  /** One-line description shown in `luzia help`. */
  summary: string;
  /** Usage line shown in `luzia help`, e.g. `luzia build [--dir <path>]`. */
  usage: string;
  /** Runs the command and resolves to the process exit code. */
  run(args: string[], io: CliIo): Promise<number>;
}
