import { spawn } from 'node:child_process';

/** An external command `luzia init` asks to run, e.g. a package install or `vercel env add`. */
export interface CommandRequest {
  command: string;
  args: string[];
  /** Working directory; the Owner's project. */
  cwd: string;
  /** Written to the command's standard input, e.g. a value for `vercel env add`. Never printed. */
  input?: string;
  /** Show the command's own output in the terminal while it runs (e.g. install progress). */
  stream?: boolean;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs external commands. Injected so the wizard is testable; the binary uses {@link createProcessRunner}. */
export interface CommandRunner {
  /** Resolves with the exit code and output; a command that cannot be started resolves with exit code 127. */
  run(request: CommandRequest): Promise<CommandResult>;
}

/** The real command runner, backed by `child_process`. */
export function createProcessRunner(): CommandRunner {
  return {
    run(request) {
      return new Promise((resolve) => {
        const child = spawn(request.command, request.args, {
          cwd: request.cwd,
          stdio: [request.input === undefined ? 'ignore' : 'pipe', request.stream ? 'inherit' : 'pipe', request.stream ? 'inherit' : 'pipe'],
          // Package managers are .cmd shims on Windows.
          shell: process.platform === 'win32',
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => (stdout += chunk));
        child.stderr?.on('data', (chunk) => (stderr += chunk));
        child.on('error', (error) => resolve({ exitCode: 127, stdout, stderr: stderr + error.message }));
        child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
        if (request.input !== undefined) child.stdin?.end(request.input);
      });
    },
  };
}
