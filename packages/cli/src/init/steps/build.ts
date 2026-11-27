import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildCommand, DEFAULT_ARTIFACT_PATH } from '../../commands/build.ts';
import { execCommand } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { CORE_PATH } from './core.ts';

export const ARTIFACT_PATH = DEFAULT_ARTIFACT_PATH;

/** Runs `luzia build` with the Owner's new settings and shows its report. */
export const buildStep: WizardStep = {
  id: 'build',
  title: 'Build the Knowledge Base',
  async run(context) {
    const rerun = `${execCommand(context.state.project.packageManager, 'luzia')} build`;
    if (!existsSync(path.join(context.cwd, CORE_PATH))) {
      context.warn(`Skipped luzia build: there is no ${CORE_PATH} yet.`);
      context.changes.todo.push(`Run ${rerun} once your Core is in ${CORE_PATH}`);
      return;
    }
    context.say('Running luzia build…');
    const code = await buildCommand.run([], {
      cwd: context.cwd,
      env: context.projectEnv(),
      ...(context.io.embeddingModel ? { embeddingModel: context.io.embeddingModel } : {}),
      stdout: (line) => context.say(`  ${line}`),
      stderr: (line) => context.warn(`  ${line}`),
    }).catch((error: unknown) => {
      context.warn(`luzia build failed: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    });
    if (code === 0) context.changes.commands.push('luzia build');
    else {
      context.changes.failed = true;
      context.changes.todo.push(`Fix the problem above, then run ${rerun}`);
    }
  },
};
