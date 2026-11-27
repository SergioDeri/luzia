import path from 'node:path';
import type { FileWrite, PlannedCommand, WizardContext } from '../context.ts';
import { gitignoreWith } from '../gitignore.ts';
import { layoutWithWidget, packageJsonWithLuziaBuild } from '../nextjs-layout.ts';
import { ARTIFACT_IGNORE, ARTIFACT_PATH, ENDPOINT_PATH, LUZIA_BUILD } from '../paths.ts';
import { luziaInstallCommands, type ProjectInfo } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { reactWidget, REACT_WIDGET_IMPORT, type WidgetProps } from '../widget-snippet.ts';


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
    context.state.endpoint = ENDPOINT_PATH;
    const files: FileWrite[] = [routeFile(context), ...(await gitignoreWith(context, [ARTIFACT_IGNORE]))];
    const commands = installCommands(context);

    context.say(`The server route answers the widget at ${ENDPOINT_PATH}, using the models in .env.local.`);
    await context.apply({ files, commands }, 'Apply these changes?');

    await addWidgetToLayout(context);
    await prefixScripts(context);
  },
};


/** Only the widget part of the integration: puts the configured widget in the root layout (used by the re-run menu). */
export const nextjsWidgetStep: WizardStep = {
  id: 'nextjs-widget',
  applies: (context) => context.state.project.kind === 'nextjs',
  async run(context) {
    context.state.endpoint = ENDPOINT_PATH;
    await addWidgetToLayout(context);
  },
};

const LAYOUT_FILES = ['layout.tsx', 'layout.jsx', 'layout.js', 'layout.ts'];

/** The root layout: its path (the first candidate when there is none) and content, `null` when missing. */
export async function findLayout(context: WizardContext): Promise<{ path: string; content: string | null }> {
  const appDir = context.state.project.appDir!;
  for (const file of LAYOUT_FILES) {
    const content = await context.readFile(`${appDir}/${file}`);
    if (content !== null) return { path: `${appDir}/${file}`, content };
  }
  return { path: `${appDir}/${LAYOUT_FILES[0]}`, content: null };
}

/** Adds the widget to the root layout after confirmation, or prints the snippet when the layout can't be changed safely. */
async function addWidgetToLayout(context: WizardContext): Promise<void> {
  const appDir = context.state.project.appDir!;
  const props: WidgetProps = { endpoint: ENDPOINT_PATH, contact: '', ...context.state.widget };
  const { path: layoutPath, content: layout } = await findLayout(context);

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
  return luziaInstallCommands(context.state.project.packageManager, ['luzia-core', 'luzia-react']);
}

/** Where the server route lives in this project, e.g. `app/api/luzia/route.ts`. */
export function routePath(project: ProjectInfo, extension: 'ts' | 'js' = project.typescript ? 'ts' : 'js'): string {
  return `${routeDir(project)}/route.${extension}`;
}

function routeDir(project: ProjectInfo): string {
  return path.posix.join(project.appDir!, ...ENDPOINT_PATH.split('/').filter(Boolean));
}

function routeFile(context: WizardContext): FileWrite {
  const artifactImport = path.posix.relative(routeDir(context.state.project), ARTIFACT_PATH);
  return {
    path: routePath(context.state.project),
    content: `import { createLuziaHandler, loadCompiledKnowledgeBase } from 'luzia-core';
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
// Tells the widget who luzIA talks about (the name in your Core), for its greeting.
export const GET = handler;
`,
  };
}
