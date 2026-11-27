import { describe, expect, it } from 'vitest';
import {
  astroAnswers,
  emptyProject,
  fullRunAnswers,
  ownerProject,
  projectFileExists,
  readProjectFile,
  rerunAnswers,
  runInit,
  standaloneAnswers,
  widgetAnswers,
} from './support/init-harness.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('luzia init: Astro', () => {
  it('adds an on-demand endpoint, the widget in the layout, the adapter and the build step, without touching the site', async () => {
    const cwd = await ownerProject('astro-app');
    const indexBefore = await readProjectFile(cwd, 'src/pages/index.astro');

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: astroAnswers() }) });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Detected an Astro site/);

    // The endpoint answers chat and CORS preflight on demand, reading secrets at runtime.
    const endpoint = await readProjectFile(cwd, 'src/pages/api/luzia.ts');
    expect(endpoint).toContain('export const prerender = false;');
    expect(endpoint).toContain("from 'astro:env/server'");
    expect(endpoint).toContain('getSecret');
    expect(endpoint).toContain("from 'luzia-core'");
    expect(endpoint).toContain("'../../../.luzia/knowledge-base.json'");
    expect(endpoint).toMatch(/export const POST: APIRoute/);
    expect(endpoint).toMatch(/export const OPTIONS: APIRoute/);
    expect(endpoint).toMatch(/export const GET: APIRoute/);

    // The widget goes at the end of the layout's body, with the script that registers it.
    const layout = await readProjectFile(cwd, 'src/layouts/Layout.astro');
    expect(layout).toMatch(/<slot \/>\s*<luzia-widget[\s\S]*endpoint="\/api\/luzia"[\s\S]*contact="jamie\.rivera@example\.com"[\s\S]*<\/luzia-widget>\s*<script>\s*import 'luzia-widget\/script';\s*<\/script>\s*<\/body>/);
    expect(run.stdout).toMatch(/Update src\/layouts\/Layout\.astro:[\s\S]*\+\s+<luzia-widget/);
    // Lists and text with quotes are Astro expressions: Astro escapes plain attribute values itself.
    expect(layout).toContain('suggested-questions={JSON.stringify(["What role is Jamie looking for?",');
    expect(layout).not.toContain('&quot;');

    // Packages, the adapter and the build step.
    expect(run.commands).toEqual(['pnpm add luzia-core luzia-widget', 'pnpm add -D luzia-cli', 'pnpm astro add vercel --yes']);
    const scripts = JSON.parse(await readProjectFile(cwd, 'package.json')).scripts;
    expect(scripts.dev).toBe('luzia build && astro dev');
    expect(scripts.build).toBe('luzia build && astro build');
    expect(await readProjectFile(cwd, '.gitignore')).toMatch(/^\.luzia\/$/m);

    // The site itself is left alone: no pages, no output directory, no standalone server.
    expect(await readProjectFile(cwd, 'src/pages/index.astro')).toBe(indexBefore);
    for (const file of ['public/index.html', 'vercel.json', 'api/luzia.ts']) {
      expect(await projectFileExists(cwd, file)).toBe(false);
    }
  });

  it('does not ask for an adapter when the project already has one', async () => {
    const cwd = await ownerProject('astro-app', {
      'package.json': JSON.stringify({
        name: 'astro-portfolio',
        type: 'module',
        scripts: { dev: 'astro dev', build: 'astro build' },
        dependencies: { astro: '^5.14.0', '@astrojs/node': '^9.0.0' },
      }),
    });

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: astroAnswers({ adapter: null }) }) });

    expect(run.code).toBe(0);
    expect(run.commands).not.toContain('pnpm astro add vercel --yes');
    expect(run.commands.some((command) => command.includes('astro add'))).toBe(false);
  });

  it('lists the adapter as still to do when the Owner skips it', async () => {
    const cwd = await ownerProject('astro-app');

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: astroAnswers({ adapter: 'skip' }) }) });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Still to do:[\s\S]*adapter[\s\S]*astro add/);
  });

  it('copies a local avatar into public/, which Astro serves from the site root', async () => {
    const cwd = await ownerProject('astro-app', { 'photos/me.png': PNG });

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        widget: widgetAnswers({ avatar: 'photos/me.png', copyAvatar: true }),
        integration: astroAnswers(),
      }),
    });

    expect(run.code).toBe(0);
    expect(await projectFileExists(cwd, 'public/luzia-avatar.png')).toBe(true);
    expect(await readProjectFile(cwd, 'src/layouts/Layout.astro')).toContain('avatar="/luzia-avatar.png"');
  });

  it('finds the existing endpoint and widget when run again', async () => {
    const cwd = await ownerProject('astro-app');
    await runInit(cwd, { answers: fullRunAnswers({ integration: astroAnswers() }) });

    const again = await runInit(cwd, { answers: rerunAnswers() });

    expect(again.code).toBe(0);
    expect(again.stdout).toMatch(/Route: src\/pages\/api\/luzia\.ts/);
    expect(again.stdout).toMatch(/Widget: in src\/layouts\/Layout\.astro/);

    // Keeping every widget option leaves the layout as it is: the options were read back.
    const layout = await readProjectFile(cwd, 'src/layouts/Layout.astro');
    const keep = await runInit(cwd, { answers: rerunAnswers(['widget', widgetAnswers()]) });
    expect(keep.code).toBe(0);
    expect(await readProjectFile(cwd, 'src/layouts/Layout.astro')).toBe(layout);
  });
});

describe('luzia init: a project that already builds its own site', () => {
  it('never sets an output directory or adds a placeholder page', async () => {
    const cwd = await emptyProject({
      'package.json': JSON.stringify({ name: 'site', type: 'module', scripts: { build: 'vite build' }, devDependencies: { vite: '^7.0.0' } }),
      'src/main.js': 'console.log("site");\n',
    });

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: standaloneAnswers() }) });

    expect(run.code).toBe(0);
    const vercel = JSON.parse(await readProjectFile(cwd, 'vercel.json'));
    expect(vercel.outputDirectory).toBeUndefined();
    expect(vercel.functions['api/luzia.ts']).toBeDefined();
    expect(await projectFileExists(cwd, 'public/index.html')).toBe(false);
  });
});
