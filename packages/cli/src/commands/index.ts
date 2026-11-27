import type { CliCommand } from '../command.ts';
import { buildCommand } from './build.ts';
import { createEvalCommand } from './eval.ts';

/** Every `luzia <name>` subcommand. Add new commands here. */
export const commands: Record<string, CliCommand> = {
  build: buildCommand,
  eval: createEvalCommand(),
};
