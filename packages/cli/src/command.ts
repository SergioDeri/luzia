/** What a command can use to talk to the outside world. Injected so commands are testable. */
export interface CliIo {
  /** Directory relative paths are resolved against. */
  cwd: string;
  stdout(line: string): void;
  stderr(line: string): void;
  /** Server-side environment (API keys, model settings). Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export interface CliCommand {
  /** One-line description shown in `luzia help`. */
  summary: string;
  /** Usage line shown in `luzia help`, e.g. `luzia build [--dir <path>]`. */
  usage: string;
  /** Runs the command and resolves to the process exit code. */
  run(args: string[], io: CliIo): Promise<number>;
}
