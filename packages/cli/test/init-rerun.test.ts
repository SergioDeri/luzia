import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answer,
  coreAnswers,
  EXISTING_KEYS,
  existingSetupProject,
  fakeEmbeddingModel,
  fakeRunner,
  instructionsAnswers,
  modelAnswers,
  productionAnswers,
  widgetAnswers,
  readProjectFile,
  runInit,
  rerunAnswers,
  unusedChatModel,
} from './support/init-harness.ts';

/** Every file of the project and its content, to check what a run left untouched. */
async function snapshot(cwd: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(cwd, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.relative(cwd, path.join(entry.parentPath, entry.name));
    files[file] = await readFile(path.join(cwd, file), 'utf8');
  }
  return files;
}

/** The files whose content differs between two snapshots (added or removed included). */
function changedFiles(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((file) => before[file] !== after[file]).sort();
}

describe('luzia init: re-run on an existing setup', () => {
  it('summarises what is configured, offers the menu, and changes nothing when the Owner is done', async () => {
    const cwd = await existingSetupProject();
    const before = await snapshot(cwd);
    const chatModel = unusedChatModel();

    const run = await runInit(cwd, { answers: rerunAnswers(), chatModel: chatModel.model });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/already set up/i);
    expect(run.stdout).toMatch(/Core.*knowledge-base\/core\.md.*Jamie Rivera.*hello@jamie\.dev/);
    expect(run.stdout).toMatch(/Instructions.*knowledge-base\/instructions\.md/);
    expect(run.stdout).toMatch(/Other Knowledge Base files.*knowledge-base\/projects\.md/);
    expect(run.stdout).toMatch(/Chat model.*Anthropic.*claude-haiku-5-5/);
    expect(run.stdout).toMatch(/Embeddings model.*OpenAI.*text-embedding-3-small/);
    expect(run.stdout).toMatch(/API keys.*ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
    expect(run.stdout).toMatch(/Route.*app\/api\/luzia\/route\.ts/);
    expect(run.stdout).toMatch(/Widget.*app\/layout\.tsx/);
    const menu = run.asked.find((asked) => /What do you want to change/.test(asked.message));
    expect(menu?.options).toEqual(['models', 'core', 'instructions', 'widget', 'production', 'done']);

    expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
    expect(run.commands).toEqual([]);
    expect(chatModel.calls).toBe(0);
    expect(run.output).not.toContain(EXISTING_KEYS.anthropic);
    expect(run.output).not.toContain(EXISTING_KEYS.openai);
  });

  describe('models and keys', () => {
    it('changes the embeddings model, keeps a key left empty, and rebuilds the Knowledge Base', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);
      const embeddings = fakeEmbeddingModel();
      const googleKey = 'google-secret-3333333333';

      const run = await runInit(cwd, {
        answers: rerunAnswers([
          'models',
          modelAnswers({
            chatModel: 'claude-haiku-5-5',
            embeddingProvider: 'google',
            embeddingModel: 'gemini-embedding-001',
            keys: [answer.secret('ANTHROPIC_API_KEY', ''), answer.secret('GOOGLE_GENERATIVE_AI_API_KEY', googleKey)],
          }),
        ]),
        embeddingModel: embeddings.model,
      });

      expect(run.code).toBe(0);
      // The current models are the defaults, and a saved key can be kept.
      const initial = (question: RegExp) => run.asked.find((asked) => question.test(asked.message))?.initialValue;
      expect(initial(/chat provider/)).toBe('anthropic');
      expect(initial(/chat model/)).toBe('claude-haiku-5-5');
      expect(initial(/embeddings provider/)).toBe('openai');
      expect(run.asked.find((asked) => /ANTHROPIC_API_KEY/.test(asked.message))?.message).toMatch(/keep/i);

      const env = await readProjectFile(cwd, '.env.local');
      expect(env).toContain('DATABASE_URL=postgres://localhost/portfolio');
      expect(env).toContain('LUZIA_EMBEDDING_PROVIDER=google');
      expect(env).toContain('LUZIA_EMBEDDING_MODEL=gemini-embedding-001');
      expect(env).toContain(`ANTHROPIC_API_KEY=${EXISTING_KEYS.anthropic}`);
      expect(env).toContain(`GOOGLE_GENERATIVE_AI_API_KEY=${googleKey}`);
      // The change was shown as a diff and confirmed, without secrets.
      expect(run.stdout).toMatch(/Update \.env\.local:[\s\S]*- LUZIA_EMBEDDING_PROVIDER=openai[\s\S]*\+ LUZIA_EMBEDDING_PROVIDER=google/);
      expect(run.output).not.toContain(googleKey);
      expect(run.output).not.toContain(EXISTING_KEYS.anthropic);

      // The Knowledge Base was rebuilt with the new embeddings model.
      expect(run.stdout).toMatch(/embeddings model changed/i);
      expect(embeddings.embeddedValues.length).toBeGreaterThan(0);
      const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
      expect(artifact.embeddingModel).toBe('fake:fake-embedding');
      expect(artifact.core.text).toContain('hello@jamie.dev');

      expect(changedFiles(before, await snapshot(cwd))).toEqual(['.env.local', '.luzia/knowledge-base.json']);
      expect(run.commands).toEqual([]);
    });

    it('does not rebuild when only the chat model changes', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);
      const embeddings = fakeEmbeddingModel();

      const run = await runInit(cwd, {
        answers: rerunAnswers([
          'models',
          modelAnswers({ chatModel: 'claude-opus-5-5', keys: [answer.secret('ANTHROPIC_API_KEY', ''), answer.secret('OPENAI_API_KEY', '')] }),
        ]),
        embeddingModel: embeddings.model,
      });

      expect(run.code).toBe(0);
      expect(await readProjectFile(cwd, '.env.local')).toContain('LUZIA_CHAT_MODEL=claude-opus-5-5');
      expect(embeddings.embeddedValues).toEqual([]);
      expect(changedFiles(before, await snapshot(cwd))).toEqual(['.env.local']);
    });

    it('leaves .env.local untouched when the Owner declines the change', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);

      const answers = modelAnswers({
        embeddingModel: 'text-embedding-3-large',
        keys: [answer.secret('ANTHROPIC_API_KEY', ''), answer.secret('OPENAI_API_KEY', '')],
      });
      answers[answers.length - 1] = answer.confirm(/\.env\.local/, false);
      const run = await runInit(cwd, { answers: rerunAnswers(['models', answers]) });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Update \.env\.local:/);
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
      expect(run.stdout).not.toContain('Compiled Knowledge Base');
    });
  });

  describe('Core', () => {
    it('shows the diff of the new Core, saves it after confirmation and rebuilds the Knowledge Base', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, {
        answers: rerunAnswers(['core', [...coreAnswers(), answer.confirm(/Replace your current Core/, true)]]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Update knowledge-base\/core\.md:[\s\S]*- - Email: hello@jamie\.dev \(preferred\)[\s\S]*\+ - Email: jamie\.rivera@example\.com \(preferred\)/);
      expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toContain('jamie.rivera@example.com');
      const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
      expect(artifact.core.text).toContain('jamie.rivera@example.com');
      expect(changedFiles(before, await snapshot(cwd))).toEqual(['.luzia/knowledge-base.json', 'knowledge-base/core.md']);
    });

    it('keeps the current Core when the Owner declines to replace it', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, {
        answers: rerunAnswers(['core', [...coreAnswers(), answer.confirm(/Replace your current Core/, false)]]),
      });

      expect(run.code).toBe(0);
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
      expect(run.stdout).not.toContain('Compiled Knowledge Base');
    });
  });

  describe('Instructions', () => {
    it('shows the diff of the new Instructions, saves them after confirmation and rebuilds', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, { answers: rerunAnswers(['instructions', instructionsAnswers({ salary: 'decline' })]) });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Update knowledge-base\/instructions\.md:[\s\S]*- If asked about salary[\s\S]*\+ Do not discuss salary/);
      // The Owner's name comes from the existing Core.
      expect(await readProjectFile(cwd, 'knowledge-base/instructions.md')).toContain('suggest contacting Jamie Rivera directly');
      expect(JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json')).instructions.text).toContain('Do not discuss salary');
      expect(changedFiles(before, await snapshot(cwd))).toEqual(['.luzia/knowledge-base.json', 'knowledge-base/instructions.md']);
    });
  });

  describe('widget', () => {
    it('takes the contact from the existing Core and updates only the widget in the layout, after a diff', async () => {
      const cwd = await existingSetupProject();
      const before = await snapshot(cwd);
      const embeddings = fakeEmbeddingModel();

      const run = await runInit(cwd, {
        answers: rerunAnswers(['widget', [...widgetAnswers({ theme: 'light' }), answer.confirm(/Add the widget to app\/layout\.tsx/, true)]]),
        embeddingModel: embeddings.model,
      });

      expect(run.code).toBe(0);
      expect(run.asked.some((asked) => /How should Visitors contact you/.test(asked.message))).toBe(false);
      expect(run.stdout).toMatch(/Update app\/layout\.tsx:[\s\S]*-\s+theme="dark"[\s\S]*\+\s+theme="light"/);
      const layout = await readProjectFile(cwd, 'app/layout.tsx');
      expect(layout.match(/<LuziaWidget/g)).toHaveLength(1);
      expect(layout).toContain('contact="hello@jamie.dev"');
      expect(layout).toContain('greeting="Hi! I’m luzIA, an AI agent that answers questions about Jamie. What would you like to know?"');
      expect(layout).toContain('theme="light"');
      expect(changedFiles(before, await snapshot(cwd))).toEqual(['app/layout.tsx']);
      expect(embeddings.embeddedValues).toEqual([]);
      expect(run.commands).toEqual([]);
    });

    it('reads the name and contact from a Core the Owner wrote by hand', async () => {
      const cwd = await existingSetupProject({
        'knowledge-base/core.md': '# Jamie Rivera\n\nI build web products. Reach me at jamie@hand.example or on GitHub.\n',
      });

      const run = await runInit(cwd, {
        answers: rerunAnswers(['widget', [...widgetAnswers(), answer.confirm(/Add the widget to/, true)]]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Core.*Jamie Rivera.*jamie@hand\.example/);
      expect(await readProjectFile(cwd, 'app/layout.tsx')).toContain('contact="jamie@hand.example"');
    });
  });

  describe('production variables', () => {
    it('uploads the variables from the existing .env.local to a linked Vercel project', async () => {
      const cwd = await existingSetupProject({ '.vercel/project.json': '{"projectId":"prj_example"}' });
      const before = await snapshot(cwd);
      const runner = fakeRunner((request) => (request.args[0] === '--version' ? { stdout: 'Vercel CLI 67.0.0' } : {}));

      const run = await runInit(cwd, {
        answers: rerunAnswers(['production', productionAnswers({ linked: true, environments: 'production' })]),
        runner,
      });

      expect(run.code).toBe(0);
      const uploads = run.requests.filter((request) => request.args[0] === 'env');
      expect(uploads.map((request) => request.args[2])).toEqual([
        'LUZIA_CHAT_PROVIDER',
        'LUZIA_CHAT_MODEL',
        'LUZIA_EMBEDDING_PROVIDER',
        'LUZIA_EMBEDDING_MODEL',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
      ]);
      expect(uploads.find((request) => request.args[2] === 'ANTHROPIC_API_KEY')?.input).toBe(EXISTING_KEYS.anthropic);
      expect(uploads.find((request) => request.args[2] === 'LUZIA_CHAT_MODEL')?.input).toBe('claude-haiku-5-5');
      expect(run.output).not.toContain(EXISTING_KEYS.anthropic);
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
    });
  });

  it('runs several sections one after the other until the Owner is done', async () => {
    const cwd = await existingSetupProject();
    const before = await snapshot(cwd);

    const run = await runInit(cwd, {
      answers: rerunAnswers(
        ['instructions', instructionsAnswers({ availability: 'Say Jamie can start in June' })],
        ['widget', [...widgetAnswers({ mode: 'inline' }), answer.confirm(/Add the widget to/, true)]],
      ),
    });

    expect(run.code).toBe(0);
    expect(run.asked.filter((asked) => /What do you want to change/.test(asked.message))).toHaveLength(3);
    expect(await readProjectFile(cwd, 'knowledge-base/instructions.md')).toContain('can start in June');
    expect(await readProjectFile(cwd, 'app/layout.tsx')).toContain('mode="inline"');
    expect(changedFiles(before, await snapshot(cwd))).toEqual(['.luzia/knowledge-base.json', 'app/layout.tsx', 'knowledge-base/instructions.md']);
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).toMatch(/Updated: .*knowledge-base\/instructions\.md.*app\/layout\.tsx/);
  });
});
