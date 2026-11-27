#!/usr/bin/env node
import { runCli } from './run-cli.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});
