import { commands } from './commands/index.ts';
import type { CliIo } from './command.ts';

/**
 * Runs `luzia <command> [...args]` and resolves to the exit code. Errors are
 * reported on stderr rather than thrown.
 */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [name, ...args] = argv;

  if (!name || name === 'help' || name === '--help' || name === '-h') {
    printHelp(io.stdout);
    return 0;
  }

  const command = commands[name];
  if (!command) {
    io.stderr(`Unknown command "${name}".`);
    printHelp(io.stderr);
    return 1;
  }

  try {
    return await command.run(args, io);
  } catch (error) {
    io.stderr(`luzia ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function printHelp(write: (line: string) => void): void {
  write('Usage: luzia <command> [options]');
  write('');
  write('Commands:');
  for (const [name, command] of Object.entries(commands)) {
    write(`  ${name.padEnd(8)} ${command.summary}`);
    write(`  ${''.padEnd(8)} ${command.usage}`);
  }
}
