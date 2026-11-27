import path from 'node:path';
import type { FileWrite, PlannedCommand, WizardContext } from '../context.ts';
import { gitignoreIgnores } from '../env-file.ts';
import { layoutWithWidget, LUZIA_BUILD, packageJsonWithLuziaBuild } from '../nextjs-layout.ts';
import { addPackagesCommand } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { reactWidget, REACT_WIDGET_IMPORT, type WidgetProps } from '../widget-snippet.ts';
import { ARTIFACT_PATH } from './build.ts';

export const NEXTJS_ENDPOINT = '/api/luzia';

/**
 * Next.js integration: install the luzIA packages, add the server route, add
 * the widget to the root layout and run `luzia build` before `dev` and `build`.
 * Each change is shown and confirmed on its own.
 */
export const nextjsStep: WizardStep = {
  id: 'nextjs',
  title: 'Add luzIA to your Next.js app',
  applies: (context) => context.state.project.kind === 'nextjs',
  async run(context) {
    context.state.endpoint = NEXTJS_ENDPOINT;
    const files: FileWrite[] = [routeFile(context), ...(await artifactIgnore(context))];
    const commands = installCommands(context);

    context.say(`The server route answers the widget at ${NEXTJS_ENDPOINT}, using the models in .env.local.`);
    await context.apply({ files, commands }, 'Apply these changes?');

    await addWidgetToLayout(context);
    await prefixScripts(context);
  },
};

/** The compiled Knowledge Base is rebuilt by `luzia build`, so it is kept out of git. */
async function artifactIgnore(context: WizardContext): Promise<FileWrite[]> {
  const artifactDir = ARTIFACT_PATH.split('/')[0]!;
  const gitignore = await context.readFile('.gitignore');
  if (gitignore !== null && gitignoreIgnores(gitignore, artifactDir)) return [];
  const before = gitignore ? `${gitignore.replace(/\n?$/, '\n')}\n` : '';
  return [{ path: '.gitignore', content: `${before}# Compiled Knowledge Base (rebuilt by luzia build)\n${artifactDir}/\n` }];
}

const LAYOUT_FILES = ['layout.tsx', 'layout.jsx', 'layout.js', 'layout.ts'];

/** Adds the widget to the root layout after confirmation, or prints the snippet when the layout can't be changed safely. */
async function addWidgetToLayout(context: WizardContext): Promise<void> {
  const appDir = context.state.project.appDir!;
  const props: WidgetProps = { endpoint: NEXTJS_ENDPOINT, contact: '', ...context.state.widget };
  let layoutPath = `${appDir}/${LAYOUT_FILES[0]}`;
  let layout: string | null = null;
  for (const file of LAYOUT_FILES) {
    layout = await context.readFile(`${appDir}/${file}`);
    if (layout !== null) {
      layoutPath = `${appDir}/${file}`;
      break;
    }
  }

  const updated = layout === null ? null : layoutWithWidget(layout, props);
  if (updated === null) {
    context.say(
      layout === null
        ? `There is no root layout in ${appDir}/. Add the widget to your root layout yourself, inside <body>:`
        : `luzIA can’t change ${layoutPath} safely. Add the widget yourself, inside <body>:`,
    );
    context.say('');
    for (const line of [REACT_WIDGET_IMPORT, '', ...reactWidget(props)]) context.say(line ? `  ${line}` : '');
    context.say('');
    context.changes.todo.push(`Add the LuziaWidget shown above to ${layoutPath}`);
    return;
  }

  if (!(await context.apply({ files: [{ path: layoutPath, content: updated }] }, `Add the widget to ${layoutPath}?`))) {
    if (updated !== layout) context.changes.todo.push(`Add the LuziaWidget to ${layoutPath} (run luzia init again to see the change)`);
  }
}

/** Prefixes the `dev` and `build` scripts with `luzia build` after confirmation, so the compiled Knowledge Base is fresh. */
async function prefixScripts(context: WizardContext): Promise<void> {
  const source = await context.readFile('package.json');
  const updated = source === null ? null : packageJsonWithLuziaBuild(source);
  if (!updated || updated.changed.length === 0) return;

  context.say(`Running ${LUZIA_BUILD} first keeps the compiled Knowledge Base in step with knowledge-base/.`);
  const question = `Run ${LUZIA_BUILD} before the dev and build scripts?`;
  if (!(await context.apply({ files: [{ path: 'package.json', content: updated.content }] }, question))) {
    context.changes.todo.push(`Start your ${updated.changed.join(' and ')} scripts with ${LUZIA_BUILD} &&`);
  }
}

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
