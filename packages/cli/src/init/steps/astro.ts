import path from 'node:path';
import { astroLayoutWithWidget, ASTRO_WIDGET_SCRIPT, findAstroLayouts } from '../astro-layout.ts';
import type { FileWrite, PlannedCommand, WizardContext } from '../context.ts';
import { gitignoreWith } from '../gitignore.ts';
import { packageJsonWithLuziaBuild } from '../nextjs-layout.ts';
import { ARTIFACT_IGNORE, ARTIFACT_PATH, ENDPOINT_PATH, LUZIA_BUILD } from '../paths.ts';
import { execArgs, luziaInstallCommands, type ProjectInfo } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { astroWidget, type WidgetProps } from '../widget-snippet.ts';

/** The adapters `astro add` can set up, offered when the site has none. */
const ADAPTERS = [
  { value: 'vercel', label: 'Vercel', hint: 'recommended if you deploy on Vercel' },
  { value: 'netlify', label: 'Netlify' },
  { value: 'node', label: 'Node', hint: 'your own server' },
  { value: 'cloudflare', label: 'Cloudflare' },
] as const;

/**
 * Astro integration: an on-demand endpoint for the chat (which needs an
 * adapter), the widget in the site's layout, and `luzia build` before `dev`
 * and `build`. The site's own pages, `public/` and build output are never
 * changed. Each change is shown and confirmed on its own.
 */
export const astroStep: WizardStep = {
  id: 'astro',
  title: 'Add luzIA to your Astro site',
  applies: (context) => context.state.project.kind === 'astro',
  async run(context) {
    context.state.endpoint = ENDPOINT_PATH;
    const adapter = await chooseAdapter(context);
    const files: FileWrite[] = [endpointFile(context.state.project), ...(await gitignoreWith(context, [ARTIFACT_IGNORE]))];
    const commands: PlannedCommand[] = [
      ...luziaInstallCommands(context.state.project.packageManager, ['luzia-core', 'luzia-widget']),
      ...(adapter ? [addAdapterCommand(context, adapter)] : []),
    ];

    context.say(`The endpoint answers the widget at ${ENDPOINT_PATH}, rendered on demand, using the models in .env.local.`);
    await context.apply({ files, commands }, 'Apply these changes?');

    await addWidgetToLayout(context);
    await prefixScripts(context);
  },
};

/** Only the widget part of the integration: puts the configured widget in the layout (used by the re-run menu). */
export const astroWidgetStep: WizardStep = {
  id: 'astro-widget',
  applies: (context) => context.state.project.kind === 'astro',
  async run(context) {
    context.state.endpoint = ENDPOINT_PATH;
    await addWidgetToLayout(context);
  },
};

/** Where the endpoint lives in an Astro site, e.g. `src/pages/api/luzia.ts`. */
export function astroEndpointPath(project: ProjectInfo, extension: 'ts' | 'js' = project.typescript ? 'ts' : 'js'): string {
  return `src/pages${ENDPOINT_PATH}.${extension}`;
}

/** On-demand endpoints need an adapter: asks for one when the site has none, `null` when it has one or the Owner skips it. */
async function chooseAdapter(context: WizardContext): Promise<string | null> {
  if (context.state.project.astro?.adapter) return null;
  context.say('Astro needs an adapter to answer chat requests on demand (your pages stay static).');
  const choice = await context.prompter.select<string>({
    message: 'Which Astro adapter should luzIA add?',
    initialValue: 'vercel',
    options: [...ADAPTERS, { value: 'skip', label: 'Skip', hint: 'I’ll add one myself' }],
  });
  if (choice !== 'skip') return choice;
  const command = execArgs(context.state.project.packageManager, 'astro', ['add', '<adapter>']);
  context.changes.todo.push(`Add an Astro adapter so the chat endpoint can run: ${[command.command, ...command.args].join(' ')}`);
  return null;
}

function addAdapterCommand(context: WizardContext, adapter: string): PlannedCommand {
  const command = execArgs(context.state.project.packageManager, 'astro', ['add', adapter, '--yes']);
  return { ...command, stream: true, fallback: `Add the ${adapter} adapter: ${[command.command, ...command.args].join(' ')}` };
}

/** Adds the widget to the layout after confirmation, or prints the snippet when no layout can be changed safely. */
async function addWidgetToLayout(context: WizardContext): Promise<void> {
  const props: WidgetProps = { endpoint: ENDPOINT_PATH, contact: '', ...context.state.widget };
  const layouts = await findAstroLayouts(context);
  let layout = layouts[0];
  if (layouts.length > 1) {
    const chosen = await context.prompter.select<string>({
      message: 'Which layout wraps every page of your site?',
      initialValue: layouts[0]!.path,
      options: layouts.map((item) => ({ value: item.path, label: item.path })),
    });
    layout = layouts.find((item) => item.path === chosen);
  }

  const updated = layout ? astroLayoutWithWidget(layout.content, props) : null;
  if (!layout || updated === null) {
    context.say(
      layout
        ? `luzIA can’t change ${layout.path} safely. Add the widget yourself, at the end of <body> in the layout every page uses:`
        : 'No layout with a <body> was found. Add the widget yourself, at the end of <body> in the layout every page uses:',
    );
    context.say('');
    for (const line of [...astroWidget(props), ...ASTRO_WIDGET_SCRIPT]) context.say(`  ${line}`);
    context.say('');
    context.changes.todo.push(`Add the <luzia-widget> and its <script> shown above to your Astro layout`);
    return;
  }

  if (!(await context.apply({ files: [{ path: layout.path, content: updated }] }, `Add the widget to ${layout.path}?`))) {
    if (updated !== layout.content) context.changes.todo.push(`Add the <luzia-widget> to ${layout.path} (run luzia init again to see the change)`);
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

/**
 * The endpoint: rendered on demand, reading the models and API keys when a
 * request comes in. With astro:env (Astro 5+) secrets are read from the
 * server environment or .env files at runtime and never bundled.
 */
function endpointFile(project: ProjectInfo): FileWrite {
  const file = astroEndpointPath(project);
  const artifactImport = path.posix.relative(path.posix.dirname(file), ARTIFACT_PATH);
  const typescript = file.endsWith('.ts');
  const secrets = (project.astro?.major ?? 5) >= 5;
  const lines = [
    ...(typescript ? ["import type { APIRoute } from 'astro';"] : []),
    ...(secrets ? ["import { getSecret } from 'astro:env/server';"] : []),
    "import { createLuziaHandler, loadCompiledKnowledgeBase } from 'luzia-core';",
    '// Generated from knowledge-base/ by `luzia build`.',
    `import compiledKnowledgeBase from '${artifactImport}';`,
    '',
    '// Rendered on demand: the chat needs a server (your pages stay static).',
    'export const prerender = false;',
    '',
    '// The chat and embeddings models and their API keys are read server-side',
    '// (.env.local locally, your hosting provider in production).',
    'const handler = createLuziaHandler({',
    '  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),',
    secrets
      ? `  env: new Proxy({}, { get: (_, name) => (typeof name === 'string' ? getSecret(name) : undefined) }),`
      : '  env: import.meta.env,',
    '});',
    '',
    typescript ? 'export const POST: APIRoute = ({ request }) => handler(request);' : 'export const POST = ({ request }) => handler(request);',
    '// Answers CORS preflight for allowed origins.',
    typescript ? 'export const OPTIONS: APIRoute = ({ request }) => handler(request);' : 'export const OPTIONS = ({ request }) => handler(request);',
    '// Tells the widget who luzIA talks about (the name in your Core), for its greeting.',
    typescript ? 'export const GET: APIRoute = ({ request }) => handler(request);' : 'export const GET = ({ request }) => handler(request);',
    '',
  ];
  return { path: file, content: lines.join('\n') };
}
