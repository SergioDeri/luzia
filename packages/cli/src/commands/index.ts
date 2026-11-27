import type { CliCommand } from '../command.ts';
import { buildCommand } from './build.ts';
import { createEvalCommand } from './eval.ts';
import { initCommand } from './init.ts';

/** Every `luzia <name>` subcommand. Add new commands here. */
export const commands: Record<string, CliCommand> = {
  init: initCommand,
  build: buildCommand,
  eval: createEvalCommand(),
};
