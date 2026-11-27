import type { CliCommand } from '../command.ts';
import { buildCommand } from './build.ts';

/** Every `luzia <name>` subcommand. Add new commands here. */
export const commands: Record<string, CliCommand> = {
  build: buildCommand,
};
