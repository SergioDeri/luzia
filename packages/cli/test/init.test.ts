import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/index.ts';
import {
  answer,
  CANCEL,
  coreAnswers,
  fakeRunner,
  fullRunAnswers,
  integrationAnswers,
  modelAnswers,
  OWNER_KEYS,
  ownerProject,
  projectFileExists,
  readProjectFile,
  runInit,
  unusedChatModel,
} from './support/init-harness.ts';

describe('luzia init', () => {
  it('fails fast with a clear message when there is no interactive terminal', async () => {
    const cwd = await ownerProject('nextjs-app');
    const err: string[] = [];

    const code = await runCli(['init'], { cwd, env: {}, stdout: () => {}, stderr: (line) => err.push(line) });

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/needs an interactive terminal/);
    expect(await projectFileExists(cwd, '.env.local')).toBe(false);
  });

  it('sets up a working Agent in a Next.js project, with a Core from questions and no model call', async () => {
    const cwd = await ownerProject('nextjs-app');
    const chatModel = unusedChatModel();

    const run = await runInit(cwd, { answers: fullRunAnswers(), chatModel: chatModel.model });

    expect(run.code).toBe(0);
    // Where things live, and the public-repo warning, come first.
    expect(run.stdout).toMatch(/Knowledge Base.*files in this project/);
    expect(run.stdout).toMatch(/keys.*only in \.env\.local/);
    expect(run.stdout).toMatch(/public/i);
    expect(run.stdout).toMatch(/Next\.js.*pnpm/);

    // Packages installed with the project's package manager.
    expect(run.commands).toEqual(['pnpm add @luzia/core @luzia/react', 'pnpm add -D @luzia/cli']);

    // Models and keys only in .env.local, which is git-ignored.
    const env = await readProjectFile(cwd, '.env.local');
    expect(env).toContain('LUZIA_CHAT_PROVIDER=anthropic');
    expect(env).toContain('LUZIA_CHAT_MODEL=claude-sonnet-5-5');
    expect(env).toContain('LUZIA_EMBEDDING_PROVIDER=openai');
    expect(env).toContain('LUZIA_EMBEDDING_MODEL=text-embedding-3-small');
    expect(env).toContain(`ANTHROPIC_API_KEY=${OWNER_KEYS.anthropic}`);
    expect(env).toContain(`OPENAI_API_KEY=${OWNER_KEYS.openai}`);
    expect(await readProjectFile(cwd, '.gitignore')).toMatch(/^\.env\.local$/m);

    // The Core, from the Owner's answers, with no model call.
    const core = await readProjectFile(cwd, 'knowledge-base/core.md');
    expect(core).toMatch(/^# Jamie Rivera/);
    expect(core).toContain('Full-stack developer with six years of experience building web products.');
    expect(core).toContain('Led the checkout rebuild at Shopwise');
    expect(core).toContain('jamie.rivera@example.com');
    expect(core).toContain('https://github.com/jamie-example');
    expect(core).toContain('A senior full-stack role');
    expect(core).toContain('From next month');
    expect(core).toMatch(/remote/i);
    expect(chatModel.calls).toBe(0);

    // The server route answers chat and CORS preflight from the compiled Knowledge Base.
    const route = await readProjectFile(cwd, 'app/api/luzia/route.ts');
    expect(route).toContain("from '@luzia/core'");
    expect(route).toContain("import compiledKnowledgeBase from '../../../.luzia/knowledge-base.json'");
    expect(route).toMatch(/export const POST = handler/);
    expect(route).toMatch(/export const OPTIONS = handler/);

    // `luzia build` ran and its report was shown.
    const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
    expect(artifact.core.text).toContain('Jamie Rivera');
    expect(run.stdout).toContain('Compiled Knowledge Base');

    // A summary of what changed and what to do next.
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    for (const file of ['.env.local', '.gitignore', 'knowledge-base/core.md', 'app/api/luzia/route.ts']) {
      expect(summary).toContain(file);
    }
    expect(summary).toContain('pnpm dev');
    expect(summary).toContain('luzia eval');

    // No AI attribution and no secrets anywhere the Owner can see.
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
    expect(run.output).not.toContain(OWNER_KEYS.openai);
    for (const file of ['knowledge-base/core.md', 'app/api/luzia/route.ts', '.gitignore']) {
      expect(await readProjectFile(cwd, file)).not.toMatch(/co-authored|generated with/i);
    }
  });

  it('merges luzIA variables into an existing .env.local, keeps the others, and shows the change without secrets', async () => {
    const cwd = await ownerProject('nextjs-app', {
      '.env.local': 'DATABASE_URL=postgres://localhost/portfolio\nLUZIA_CHAT_MODEL=old-model\n',
      '.gitignore': 'node_modules/\n.env*.local\n.luzia/\n',
    });

    const run = await runInit(cwd, { answers: fullRunAnswers() });

    expect(run.code).toBe(0);
    const env = await readProjectFile(cwd, '.env.local');
    expect(env).toContain('DATABASE_URL=postgres://localhost/portfolio');
    expect(env).toContain('LUZIA_CHAT_MODEL=claude-sonnet-5-5');
    expect(env).not.toContain('old-model');
    expect(env.match(/LUZIA_CHAT_MODEL=/g)).toHaveLength(1);
    expect(env).toContain(`ANTHROPIC_API_KEY=${OWNER_KEYS.anthropic}`);
    // The diff of .env.local was shown before writing, with keys masked.
    expect(run.stdout).toMatch(/Update \.env\.local:[\s\S]*- LUZIA_CHAT_MODEL=old-model[\s\S]*\+ LUZIA_CHAT_MODEL=claude-sonnet-5-5/);
    expect(run.stdout).toContain('+ ANTHROPIC_API_KEY=<hidden>');
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
    // Already ignored by .env*.local, so .gitignore is left alone.
    expect(await readProjectFile(cwd, '.gitignore')).toBe('node_modules/\n.env*.local\n.luzia/\n');
  });

  it('offers the providers core supports, asks a shared key once, and accepts any model id', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        models: modelAnswers({
          chatProvider: 'openai',
          customChatModel: 'gpt-custom-preview',
          embeddingProvider: 'openai',
          keys: [answer.secret('OPENAI_API_KEY', OWNER_KEYS.openai)],
        }),
      }),
    });

    expect(run.code).toBe(0);
    const offered = (question: RegExp) => run.asked.find((asked) => question.test(asked.message))?.options;
    expect(offered(/chat provider/i)).toEqual(['anthropic', 'openai', 'google', 'groq']);
    expect(offered(/embeddings provider/i)).toEqual(['openai', 'google']);
    expect(offered(/chat model/i)).toContain('gpt-5.5');
    expect(run.stdout).toMatch(/Anthropic and Groq don’t offer embeddings/);
    expect(run.asked.filter((asked) => asked.kind === 'secret')).toHaveLength(1);

    const env = await readProjectFile(cwd, '.env.local');
    expect(env).toContain('LUZIA_CHAT_MODEL=gpt-custom-preview');
    expect(env.match(/OPENAI_API_KEY=/g)).toHaveLength(1);
    expect(env).not.toContain('ANTHROPIC_API_KEY');
  });

  it('uses the package manager from the lockfile and fits the project layout (src/app, JavaScript)', async () => {
    const cwd = await ownerProject(
      'nextjs-app',
      { 'package-lock.json': '{}', 'src/app/layout.jsx': 'export default function RootLayout() {}\n' },
      { remove: ['pnpm-lock.yaml', 'app', 'tsconfig.json'] },
    );

    // This layout has no <body>, so the widget snippet is printed instead of asked about.
    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: integrationAnswers({ layout: null }) }) });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Next\.js.*src\/app.*npm/);
    expect(run.commands).toEqual(['npm install @luzia/core @luzia/react', 'npm install --save-dev @luzia/cli']);
    const route = await readProjectFile(cwd, 'src/app/api/luzia/route.js');
    expect(route).toContain("import compiledKnowledgeBase from '../../../../.luzia/knowledge-base.json'");
    expect(run.stdout).toContain('npm run dev');
    expect(run.stdout).toContain('npx luzia eval');
  });

  it('shows the diff of an existing file and leaves it untouched when the Owner declines', async () => {
    const customRoute = "export async function POST() {\n  return new Response('my own route');\n}\n";
    const cwd = await ownerProject('nextjs-app', { 'app/api/luzia/route.ts': customRoute });

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: integrationAnswers({ apply: false }) }) });

    expect(run.stdout).toMatch(/Update app\/api\/luzia\/route\.ts:[\s\S]*-\s+return new Response\('my own route'\);[\s\S]*\+ export const POST = handler;/);
    expect(await readProjectFile(cwd, 'app/api/luzia/route.ts')).toBe(customRoute);
    expect(run.commands).toEqual([]);
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).not.toContain('app/api/luzia/route.ts');
  });

  it('leaves later steps’ files untouched when the Owner cancels, and lists what was already written', async () => {
    const cwd = await ownerProject('nextjs-app');
    const core = coreAnswers();
    core[core.length - 1] = answer.cancel('confirm', /Save the Core/);

    const run = await runInit(cwd, { answers: fullRunAnswers({ core, instructions: [], widget: [], integration: [] }) });

    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/Setup cancelled/);
    expect(run.stdout).toMatch(/Created: \.env\.local/);
    expect(await projectFileExists(cwd, '.env.local')).toBe(true);
    expect(await projectFileExists(cwd, 'knowledge-base/core.md')).toBe(false);
    expect(await projectFileExists(cwd, 'knowledge-base/instructions.md')).toBe(false);
    expect(await projectFileExists(cwd, 'app/api/luzia/route.ts')).toBe(false);
    expect(await projectFileExists(cwd, '.luzia/knowledge-base.json')).toBe(false);
    expect(run.commands).toEqual([]);
  });

  it('tells the Owner how to install the packages themselves when the install fails', async () => {
    const cwd = await ownerProject('nextjs-app');
    const runner = fakeRunner((request) =>
      request.args.includes('@luzia/cli') ? { exitCode: 1, stderr: 'ERR_PNPM_FETCH_404 @luzia/cli' } : {},
    );

    const run = await runInit(cwd, { answers: fullRunAnswers(), runner });

    expect(run.stderr).toMatch(/pnpm add -D @luzia\/cli failed[\s\S]*ERR_PNPM_FETCH_404/);
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).toMatch(/Still to do:[\s\S]*pnpm add -D @luzia\/cli/);
  });

  it('fails fast from the binary when the terminal is not interactive', async () => {
    const cwd = await ownerProject('nextjs-app');
    const bin = new URL('../src/bin.ts', import.meta.url).pathname;

    const result = await promisify(execFile)(process.execPath, [bin, 'init'], { cwd }).then(
      () => ({ code: 0, stderr: '' }),
      (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr }),
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/needs an interactive terminal/);
  });
});
