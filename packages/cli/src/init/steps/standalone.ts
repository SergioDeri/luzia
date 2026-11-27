import path from 'node:path';
import type { FileWrite, PlannedCommand, WizardContext } from '../context.ts';
import { gitignoreWith } from '../gitignore.ts';
import { LUZIA_BUILD } from '../nextjs-layout.ts';
import { addPackagesCommand } from '../project.ts';
import type { WizardStep } from '../step.ts';
import { htmlWidgetSnippet, type WidgetProps } from '../widget-snippet.ts';
import { ARTIFACT_PATH } from './build.ts';
import { ARTIFACT_IGNORE } from './nextjs.ts';

/** The function file and the path it answers at once deployed on Vercel. */
export const STANDALONE_FUNCTION = 'api/luzia.ts';
export const STANDALONE_ENDPOINT_PATH = '/api/luzia';
/** Used in the snippet until the Owner knows where the server is deployed. */
export const SERVER_PLACEHOLDER = 'https://YOUR-LUZIA-SERVER.vercel.app';

/**
 * Standalone integration, for anything that isn't a Next.js app (an empty
 * folder, a static site): this folder becomes a luzIA server deployed on its
 * own as a Vercel Function, like the standalone example. The portfolio's
 * domains become the allowed origins, and the `<script>` + `<luzia-widget>`
 * snippet for the portfolio's HTML is printed with the widget options.
 */
export const standaloneStep: WizardStep = {
  id: 'standalone',
  title: 'Set up the standalone luzIA server',
  applies: (context) => context.state.project.kind === 'standalone',
  async run(context) {
    context.say(
      'Your portfolio calls the luzIA server from another domain, so the server only answers the origins you allow.',
    );
    const origins = await askOrigins(context);
    const endpoint = await askEndpoint(context);
    context.state.endpoint = endpoint;

    const files: FileWrite[] = [
      await packageJsonFile(context),
      functionFile(origins),
      ...(await vercelFiles(context)),
      ...(await gitignoreWith(context, [
        { entry: 'node_modules/', comment: 'Installed packages' },
        ARTIFACT_IGNORE,
      ])),
    ];
    context.say(
      `The server answers the widget at ${STANDALONE_ENDPOINT_PATH} once deployed, using the models set in your hosting provider.`,
    );
    const applied = await context.apply(
      { files, commands: installCommands(context) },
      'Set up the luzIA server in this folder?',
    );
    if (!applied) context.changes.todo.push('Set up the luzIA server (run luzia init again to see the files)');

    printSnippet(context, endpoint);
    context.changes.next.push(
      'Deploy this folder as its own Vercel project (framework preset: Other) and add the production variables there.',
    );
  },
};

/**
 * Only the allowed origins of an existing standalone server (used by the
 * re-run menu): asks for them with the current ones as the default, then
 * changes just the `allowedOrigins` list in the function file, after a diff.
 */
export const standaloneOriginsStep: WizardStep = {
  id: 'standalone-origins',
  async run(context) {
    const source = await context.readFile(STANDALONE_FUNCTION);
    const current = source === null ? null : readAllowedOrigins(source);
    if (source === null || current === null) {
      context.say(`luzIA can’t find the allowedOrigins list in ${STANDALONE_FUNCTION}. Change it there yourself.`);
      context.changes.todo.push(`Set your portfolio’s origins in allowedOrigins in ${STANDALONE_FUNCTION}`);
      return;
    }
    const origins = await askOrigins(context, current);
    const content = source.replace(ALLOWED_ORIGINS, (_, start: string, _list: string, end: string) => `${start}${originList(origins)}${end}`);
    if (!(await context.apply({ files: [{ path: STANDALONE_FUNCTION, content }] }, `Update the allowed origins in ${STANDALONE_FUNCTION}?`))) {
      if (content !== source) context.changes.todo.push(`Set allowedOrigins in ${STANDALONE_FUNCTION} to ${origins.join(', ')}`);
    }
  },
};

/**
 * Only the widget part of the standalone integration (used by the re-run
 * menu): prints the snippet again with the widget options just chosen, at the
 * endpoint read back from the portfolio's page, or the one the Owner enters.
 */
export const standaloneWidgetStep: WizardStep = {
  id: 'standalone-widget',
  applies: (context) => context.state.project.kind === 'standalone',
  async run(context) {
    const endpoint = context.state.endpoint ?? (await askEndpoint(context));
    context.state.endpoint = endpoint;
    printSnippet(context, endpoint, 'Replace the <luzia-widget> in your portfolio’s HTML with the one shown above');
  },
};

/** Asks for the portfolio's domains until every one is a valid origin; empty keeps `current` when there are some. */
async function askOrigins(context: WizardContext, current: string[] = []): Promise<string[]> {
  for (;;) {
    const keep = current.length ? ` (leave empty to keep ${current.join(', ')})` : '';
    const answer = await context.prompter.text({
      message: `Your portfolio’s domain(s), comma-separated (e.g. jamie.example.com, www.jamie.example.com)${keep}`,
      ...(current.length ? { defaultValue: current.join(', ') } : {}),
    });
    const result = parseOrigins(answer);
    if ('origins' in result) {
      context.say(`Allowed origins: ${result.origins.join(', ')}`);
      return result.origins;
    }
    context.warn(result.error);
  }
}

/** The domains (or full origins) as origins, or why they are not valid. */
export function parseOrigins(answer: string): { origins: string[] } | { error: string } {
  const values = answer.split(/[\s,]+/).filter(Boolean);
  if (values.length === 0) return { error: 'Enter at least one domain, e.g. jamie.example.com.' };
  const origins: string[] = [];
  for (const value of values) {
    const origin = toOrigin(value);
    if (origin === null) {
      return {
        error:
          `"${value}" is not a valid origin. Enter a domain such as jamie.example.com, or an origin such as ` +
          'https://jamie.example.com (scheme, host and optional port; no path).',
      };
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return { origins };
}

/** `jamie.example.com` → `https://jamie.example.com`; `null` when it isn't a bare origin. */
function toOrigin(value: string): string | null {
  const url = parseUrl(value);
  if (!url || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
  return url.origin;
}

function parseUrl(value: string): URL | null {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(value);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `${local ? 'http' : 'https'}://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname || !(url.hostname.includes('.') || url.hostname === 'localhost')) return null;
  return url;
}

/**
 * The endpoint for the snippet: the deployed server's URL when the Owner knows
 * it, otherwise a placeholder they replace after deploying (left as a to-do).
 */
async function askEndpoint(context: WizardContext): Promise<string> {
  for (;;) {
    const answer = (
      await context.prompter.text({
        message: 'The server’s URL once deployed, e.g. https://luzia-jamie.vercel.app (leave empty if not deployed yet)',
        defaultValue: '',
      })
    ).trim();
    if (!answer) {
      context.changes.todo.push(
        `After deploying, replace ${SERVER_PLACEHOLDER} in the widget’s endpoint with your server’s URL`,
      );
      return `${SERVER_PLACEHOLDER}${STANDALONE_ENDPOINT_PATH}`;
    }
    const url = parseUrl(answer);
    if (url && !url.search && !url.hash) {
      const pathname = url.pathname.replace(/\/$/, '');
      return `${url.origin}${pathname || STANDALONE_ENDPOINT_PATH}`;
    }
    context.warn(`"${answer}" is not a valid URL. Enter one such as https://luzia-jamie.vercel.app, or leave it empty.`);
  }
}

const ALLOWED_ORIGINS = /(allowedOrigins:\s*\[)([^\]]*)(\])/;

/** The origins in the function file's `allowedOrigins: [...]`, `null` when there is no such list of plain strings. */
export function readAllowedOrigins(source: string): string[] | null {
  const list = ALLOWED_ORIGINS.exec(source)?.[2];
  if (list === undefined) return null;
  const items = list.split(',').map((item) => item.trim()).filter(Boolean);
  const origins = items.map((item) => /^(['"`])([^'"`]*)\1$/.exec(item)?.[2]);
  return origins.every((origin): origin is string => origin !== undefined) ? origins : null;
}

/** A new `package.json`, or the existing one with `"type": "module"` and `luzia build` as (or before) its build. */
async function packageJsonFile(context: WizardContext): Promise<FileWrite> {
  const source = await context.readFile('package.json');
  if (source === null) {
    const name = path.basename(context.cwd).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '') || 'luzia-server';
    const packageJson = { name, private: true, type: 'module', scripts: { build: LUZIA_BUILD } };
    return { path: 'package.json', content: `${JSON.stringify(packageJson, null, 2)}\n` };
  }
  let packageJson: { type?: string; scripts?: Record<string, string> };
  try {
    packageJson = JSON.parse(source);
  } catch {
    throw new Error('package.json is not valid JSON. Fix it, then run luzia init again.');
  }
  const build = packageJson.scripts?.build;
  const scripts = {
    ...packageJson.scripts,
    build: !build ? LUZIA_BUILD : build.trim().startsWith(LUZIA_BUILD) ? build : `${LUZIA_BUILD} && ${build}`,
  };
  const indent = /^\{\r?\n([ \t]+)"/.exec(source)?.[1] ?? '  ';
  const updated = { ...packageJson, type: packageJson.type ?? 'module', scripts };
  return { path: 'package.json', content: `${JSON.stringify(updated, null, indent)}${source.endsWith('\n') ? '\n' : ''}` };
}

function functionFile(origins: string[]): FileWrite {
  const artifactUrl = path.posix.relative(path.posix.dirname(STANDALONE_FUNCTION), ARTIFACT_PATH);
  return {
    path: STANDALONE_FUNCTION,
    content: `import { readFileSync } from 'node:fs';
import { createLuziaHandler, loadCompiledKnowledgeBase } from '@luzia/core';

// Generated from knowledge-base/ by \`luzia build\`, which the \`build\` script
// runs before every deploy (vercel.json ships it with the function).
const compiledKnowledgeBase = JSON.parse(
  readFileSync(new URL('${artifactUrl}', import.meta.url), 'utf8'),
);

// The chat and embeddings models and their API keys are read server-side from
// the environment (.env.local locally, your hosting provider in production).
const handler = createLuziaHandler({
  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),
  // Your portfolio's origins (scheme + host, no path): only they may call this server.
  allowedOrigins: [${originList(origins)}],
});

// A Vercel Function with the Web \`Request\` / \`Response\` signature.
export const POST = handler;
// Answers CORS preflight from the allowed origins.
export const OPTIONS = handler;
`,
  };
}

function originList(origins: string[]): string {
  return origins.map((origin) => `'${origin}'`).join(', ');
}

/** `vercel.json` shipping the compiled Knowledge Base with the function (merged into an existing one), and a root page. */
async function vercelFiles(context: WizardContext): Promise<FileWrite[]> {
  const include = { includeFiles: `${ARTIFACT_PATH.split('/')[0]}/**` };
  const source = await context.readFile('vercel.json');
  if (source !== null) {
    let config: { functions?: Record<string, object> };
    try {
      config = JSON.parse(source);
    } catch {
      throw new Error('vercel.json is not valid JSON. Fix it, then run luzia init again.');
    }
    const functions = { ...config.functions, [STANDALONE_FUNCTION]: { ...config.functions?.[STANDALONE_FUNCTION], ...include } };
    return [{ path: 'vercel.json', content: `${JSON.stringify({ ...config, functions }, null, 2)}\n` }];
  }
  if (context.state.project.staticRoot) {
    // The folder already serves a site from its root: leave how Vercel serves it alone.
    context.say('index.html at the root keeps being served as it is: luzIA only adds its function to this deployment.');
    const config = { $schema: 'https://openapi.vercel.sh/vercel.json', functions: { [STANDALONE_FUNCTION]: include } };
    return [{ path: 'vercel.json', content: `${JSON.stringify(config, null, 2)}\n` }];
  }
  const config = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    outputDirectory: 'public',
    functions: { [STANDALONE_FUNCTION]: include },
  };
  const files: FileWrite[] = [{ path: 'vercel.json', content: `${JSON.stringify(config, null, 2)}\n` }];
  if ((await context.readFile('public/index.html')) === null) files.push({ path: 'public/index.html', content: ROOT_PAGE });
  return files;
}

const ROOT_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>luzIA server</title>
  </head>
  <body>
    <p>This is a luzIA server. The chat endpoint is <code>POST ${STANDALONE_ENDPOINT_PATH}</code>.</p>
  </body>
</html>
`;

function installCommands(context: WizardContext): PlannedCommand[] {
  const manager = context.state.project.packageManager;
  const runtime = addPackagesCommand(manager, ['@luzia/core']);
  const dev = addPackagesCommand(manager, ['@luzia/cli'], { dev: true });
  return [runtime, dev].map((command) => ({
    ...command,
    stream: true,
    fallback: `Install the luzIA packages: ${[command.command, ...command.args].join(' ')}`,
  }));
}

function printSnippet(
  context: WizardContext,
  endpoint: string,
  todo = 'Add the script tag and <luzia-widget> shown above to your portfolio’s HTML',
): void {
  const props: WidgetProps = { endpoint, contact: '', ...context.state.widget };
  context.say('');
  context.say('Add this to your portfolio’s HTML: the script tag in <head>, the widget inside <body>.');
  context.say('');
  for (const line of htmlWidgetSnippet(props)) context.say(line ? `  ${line}` : '');
  context.say('');
  context.changes.todo.push(todo);
}
