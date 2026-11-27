import { describe, expect, it } from 'vitest';
import {
  emptyProject,
  fullRunAnswers,
  OWNER_KEYS,
  projectFileExists,
  readProjectFile,
  runInit,
  standaloneAnswers,
  unusedChatModel,
  widgetAnswers,
} from './support/init-harness.ts';

describe('luzia init: standalone server', () => {
  it('keeps a static site served from the folder root: no output directory and no placeholder page', async () => {
    const cwd = await emptyProject({ 'index.html': '<!doctype html><title>Jamie</title><h1>Jamie Rivera</h1>\n' });

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ integration: standaloneAnswers() }),
      chatModel: unusedChatModel().model,
    });

    expect(run.code).toBe(0);
    const vercel = JSON.parse(await readProjectFile(cwd, 'vercel.json'));
    expect(vercel.functions['api/luzia.ts'].includeFiles).toBe('.luzia/**');
    expect(vercel.outputDirectory).toBeUndefined();
    expect(await projectFileExists(cwd, 'public/index.html')).toBe(false);
    expect(await readProjectFile(cwd, 'index.html')).toContain('Jamie Rivera');
    expect(run.stdout).toMatch(/index\.html.*keeps being served/i);
  });

  it('stops before changing anything in a Next.js Pages Router app, pointing to the manual setup', async () => {
    const cwd = await emptyProject({
      'package.json': JSON.stringify({ name: 'portfolio', dependencies: { next: '16.0.0', react: '19.0.0' } }),
      'pages/index.tsx': 'export default function Home() { return null; }\n',
    });

    const run = await runInit(cwd, { answers: [], chatModel: unusedChatModel().model });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toMatch(/Pages Router/);
    expect(run.stderr).toMatch(/manual setup/i);
    expect(await projectFileExists(cwd, '.env.local')).toBe(false);
    expect(await projectFileExists(cwd, 'api/luzia.ts')).toBe(false);
    expect(run.commands).toEqual([]);
  });

  it('sets up a standalone server in an empty folder and prints the script-tag snippet', async () => {
    const cwd = await emptyProject();
    const chatModel = unusedChatModel();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        widget: widgetAnswers({ theme: 'dark', mode: 'inline' }),
        integration: standaloneAnswers(),
      }),
      chatModel: chatModel.model,
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/No Next\.js app.*standalone/i);

    // package.json with the build step, and the packages installed with the default manager.
    const packageJson = JSON.parse(await readProjectFile(cwd, 'package.json'));
    expect(packageJson.type).toBe('module');
    expect(packageJson.scripts.build).toBe('luzia build');
    expect(run.commands).toEqual(['npm install luzia-core', 'npm install --save-dev luzia-cli']);

    // The Vercel Function answers chat and CORS preflight from the compiled Knowledge Base.
    const fn = await readProjectFile(cwd, 'api/luzia.ts');
    expect(fn).toContain("from 'luzia-core'");
    expect(fn).toContain("new URL('../.luzia/knowledge-base.json', import.meta.url)");
    expect(fn).toContain("allowedOrigins: ['https://jamie.example.com', 'https://www.jamie.example.com']");
    expect(fn).toMatch(/export const POST = handler/);
    expect(fn).toMatch(/export const OPTIONS = handler/);

    // vercel.json ships the compiled Knowledge Base with the function.
    const vercel = JSON.parse(await readProjectFile(cwd, 'vercel.json'));
    expect(vercel.functions['api/luzia.ts'].includeFiles).toBe('.luzia/**');
    expect(vercel.outputDirectory).toBe('public');
    expect(await projectFileExists(cwd, 'public/index.html')).toBe(true);
    const gitignore = await readProjectFile(cwd, '.gitignore');
    expect(gitignore).toMatch(/^\.env\.local$/m);
    expect(gitignore).toMatch(/^\.luzia\/$/m);
    expect(gitignore).toMatch(/^node_modules\/$/m);

    // The snippet: script bundle plus the widget with every configured option.
    expect(run.stdout).toContain(
      '<script type="module" src="https://cdn.jsdelivr.net/npm/luzia-widget/dist/luzia-widget.js"></script>',
    );
    const snippet = run.stdout.slice(run.stdout.indexOf('<luzia-widget'), run.stdout.indexOf('</luzia-widget>'));
    expect(snippet).toContain('endpoint="https://YOUR-LUZIA-SERVER.vercel.app/api/luzia"');
    expect(snippet).toContain('contact="jamie.rivera@example.com"');
    expect(snippet).toContain('greeting="Hi! I’m luzIA, an AI agent that answers questions about Jamie. What would you like to know?"');
    expect(snippet).toContain('suggested-questions="[&quot;What role is Jamie looking for?&quot;');
    expect(snippet).toContain('theme="dark"');
    expect(snippet).toContain('mode="inline"');

    // The build ran for the standalone server too.
    const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
    expect(artifact.core.text).toContain('Jamie Rivera');

    // The summary: what was created, the placeholder endpoint to replace, and how to deploy.
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    for (const file of ['package.json', 'api/luzia.ts', 'vercel.json', 'knowledge-base/core.md']) {
      expect(summary).toContain(file);
    }
    expect(summary).toContain('YOUR-LUZIA-SERVER');
    expect(summary).toMatch(/Deploy/);
    expect(summary).not.toContain('npm run dev');
    // Production variables are listed (not linked to Vercel).
    expect(run.stdout).toMatch(/LUZIA_CHAT_PROVIDER \(from \.env\.local\)/);

    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
    for (const file of ['package.json', 'api/luzia.ts', 'vercel.json', 'public/index.html', '.gitignore']) {
      expect(await readProjectFile(cwd, file)).not.toMatch(/co-authored|generated with|claude/i);
    }
    expect(chatModel.calls).toBe(0);
  });

  it('rejects an invalid origin with a clear message and asks again', async () => {
    const cwd = await emptyProject();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        integration: standaloneAnswers({
          domains: ['', 'jamie.example.com/portfolio', 'ftp://jamie.example.com', 'https://jamie.example.com, http://localhost:8080'],
        }),
      }),
    });

    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/Enter at least one domain/);
    expect(run.stderr).toMatch(/"jamie\.example\.com\/portfolio" is not a valid origin.*no path/);
    expect(run.stderr).toMatch(/"ftp:\/\/jamie\.example\.com" is not a valid origin/);
    expect(run.asked.filter((question) => /domain/i.test(question.message))).toHaveLength(4);
    expect(await readProjectFile(cwd, 'api/luzia.ts')).toContain(
      "allowedOrigins: ['https://jamie.example.com', 'http://localhost:8080']",
    );
  });

  it('points the snippet at the deployed server URL when the Owner knows it', async () => {
    const cwd = await emptyProject();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ integration: standaloneAnswers({ serverUrl: 'luzia-jamie.vercel.app' }) }),
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toContain('endpoint="https://luzia-jamie.vercel.app/api/luzia"');
    expect(run.stdout).not.toContain('YOUR-LUZIA-SERVER');
  });

  it('adds the server to an existing non-Next.js project with its package manager, keeping its build', async () => {
    const cwd = await emptyProject({
      'package.json': JSON.stringify({ name: 'jamie-site', scripts: { build: 'eleventy' } }, null, 2) + '\n',
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
      'vercel.json': JSON.stringify({ cleanUrls: true }),
      '.gitignore': 'node_modules\n',
    });

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: standaloneAnswers() }) });

    expect(run.code).toBe(0);
    expect(run.commands).toEqual(['pnpm add luzia-core', 'pnpm add -D luzia-cli']);
    const packageJson = JSON.parse(await readProjectFile(cwd, 'package.json'));
    expect(packageJson).toMatchObject({ name: 'jamie-site', type: 'module', scripts: { build: 'luzia build && eleventy' } });
    expect(run.stdout).toMatch(/Update package\.json:[\s\S]*\+\s+"build": "luzia build && eleventy"/);
    const vercel = JSON.parse(await readProjectFile(cwd, 'vercel.json'));
    expect(vercel).toEqual({ cleanUrls: true, functions: { 'api/luzia.ts': { includeFiles: '.luzia/**' } } });
    expect(await projectFileExists(cwd, 'public/index.html')).toBe(false);
    const gitignore = await readProjectFile(cwd, '.gitignore');
    expect(gitignore.match(/node_modules/g)).toHaveLength(1);
    expect(gitignore).toMatch(/^\.luzia\/$/m);
  });

  it('leaves the folder untouched when the Owner declines, and still prints the snippet', async () => {
    const cwd = await emptyProject();

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: standaloneAnswers({ apply: false }) }) });

    expect(await projectFileExists(cwd, 'api/luzia.ts')).toBe(false);
    expect(await projectFileExists(cwd, 'vercel.json')).toBe(false);
    expect(run.commands).toEqual([]);
    expect(run.stdout).toContain('<luzia-widget');
    expect(run.stdout.slice(run.stdout.lastIndexOf('Summary'))).toMatch(/Set up the luzIA server/);
  });
});
