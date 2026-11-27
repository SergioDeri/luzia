#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { runCli } from './run-cli.ts';

// Local runs pick up the same .env.local / .env files as the app (earlier files
// win, and real environment variables always win), so `luzia build` and
// `luzia eval` see the Owner's model settings and API keys without exporting them.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});
