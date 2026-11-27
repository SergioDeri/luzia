import path from 'node:path';
import type { FileWrite, PlannedCommand, WizardContext } from '../context.ts';
import { addPackagesCommand } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { ARTIFACT_PATH } from './build.ts';

export const NEXTJS_ENDPOINT = '/api/luzia';

/** Next.js integration: install the luzIA packages and add the server route. */
export const nextjsStep: WizardStep = {
  id: 'nextjs',
  title: 'Add luzIA to your Next.js app',
  applies: (context) => context.state.project.kind === 'nextjs',
  async run(context) {
    context.state.endpoint = NEXTJS_ENDPOINT;
    const files: FileWrite[] = [routeFile(context)];
    const commands = installCommands(context);

    context.say(`The server route answers the widget at ${NEXTJS_ENDPOINT}, using the models in .env.local.`);
    await context.apply({ files, commands }, 'Apply these changes?');
  },
};

function installCommands(context: WizardContext): PlannedCommand[] {
  const manager = context.state.project.packageManager;
  const runtime = addPackagesCommand(manager, ['@luzia/core', '@luzia/react']);
  const dev = addPackagesCommand(manager, ['@luzia/cli'], { dev: true });
  return [runtime, dev].map((command) => ({
    ...command,
    stream: true,
    fallback: `Install the luzIA packages: ${[command.command, ...command.args].join(' ')}`,
  }));
}

function routeFile(context: WizardContext): FileWrite {
  const { appDir, typescript } = context.state.project;
  const routeDir = path.posix.join(appDir!, ...NEXTJS_ENDPOINT.split('/').filter(Boolean));
  const artifactImport = path.posix.relative(routeDir, ARTIFACT_PATH);
  return {
    path: `${routeDir}/route.${typescript ? 'ts' : 'js'}`,
    content: `import { createLuziaHandler, loadCompiledKnowledgeBase } from '@luzia/core';
// Generated from knowledge-base/ by \`luzia build\`.
import compiledKnowledgeBase from '${artifactImport}';

// The chat and embeddings models and their API keys are read server-side from
// the environment (.env.local locally, your hosting provider in production).
const handler = createLuziaHandler({
  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),
});

export const POST = handler;
// Answers CORS preflight for allowed origins.
export const OPTIONS = handler;
`,
  };
}
