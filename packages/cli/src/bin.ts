#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createProcessRunner } from './init/command-runner.ts';
import { createTerminalPrompter } from './init/terminal-prompter.ts';
import { runCli } from './run-cli.ts';

// Local runs pick up the same .env.local / .env files as the app (earlier files
// win, and real environment variables always win), so `luzia build` and
// `luzia eval` see the Owner's model settings and API keys without exporting them.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// Questions can only be asked in an interactive terminal; without one,
// `luzia init` fails fast instead of waiting for answers that never come.
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  runner: createProcessRunner(),
  ...(interactive ? { prompter: createTerminalPrompter() } : {}),
});
