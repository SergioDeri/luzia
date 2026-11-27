import type { CliCommand } from '../command.ts';
import { createProcessRunner } from '../init/command-runner.ts';
import { runInitWizard } from '../init/wizard.ts';

export const initCommand: CliCommand = {
  summary: 'Set up luzIA in this project: models and keys, Core, server route and Knowledge Base build.',
  usage: 'luzia init   (interactive; run it in your portfolio project)',
  async run(_args, io) {
    if (!io.prompter) {
      io.stderr('luzia init needs an interactive terminal: run it yourself in your project folder, not from a script or CI job.');
      return 1;
    }
    return runInitWizard({ ...io, prompter: io.prompter, runner: io.runner ?? createProcessRunner() });
  },
};
