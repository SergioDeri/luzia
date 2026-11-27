import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answer,
  coreAnswers,
  EXISTING_KEYS,
  existingSetupProject,
  existingStandaloneProject,
  fakeEmbeddingModel,
  fakeRunner,
  instructionsAnswers,
  integrationAnswers,
  modelAnswers,
  productionAnswers,
  widgetAnswers,
  readProjectFile,
  runInit,
  rerunAnswers,
  standaloneAnswers,
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

    it('starts from the widget options in the layout, so keeping them changes nothing', async () => {
      const cwd = await existingSetupProject({
        'app/layout.tsx': `import type { ReactNode } from 'react';
import { LuziaWidget } from '@luzia/react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <LuziaWidget
          endpoint="/api/luzia"
          contact="hello@jamie.dev"
          greeting="Hey there! Ask me anything about Jamie's work."
          suggestedQuestions={[
            "What does Jamie build?",
            "Is Jamie open to relocation?",
            "How do I reach Jamie?",
          ]}
          theme="dark"
          mode="inline"
        />
      </body>
    </html>
  );
}
`,
      });
      const before = await snapshot(cwd);

      const run = await runInit(cwd, {
        answers: rerunAnswers(['widget', widgetAnswers({ theme: 'dark', mode: 'inline' })]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toContain("Greeting: Hey there! Ask me anything about Jamie's work.");
      expect(run.stdout).toContain('- Is Jamie open to relocation?');
      const initial = (question: RegExp) => run.asked.find((asked) => question.test(asked.message))?.initialValue;
      expect(initial(/theme/i)).toBe('dark');
      expect(initial(/bubble|inline/i)).toBe('inline');
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
    });

    it('offers the current greeting and questions as the defaults when editing them', async () => {
      const cwd = await existingSetupProject({
        'app/layout.tsx': `import { LuziaWidget } from '@luzia/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <LuziaWidget endpoint="/api/luzia" contact="hello@jamie.dev" greeting="Hello from Jamie's agent" theme="light" />
      </body>
    </html>
  );
}
`,
      });

      const run = await runInit(cwd, {
        answers: rerunAnswers([
          'widget',
          [
            ...widgetAnswers({ edit: { questions: ['What is Jamie’s stack?'] }, theme: 'light' }),
            answer.confirm(/Add the widget to/, true),
          ],
        ]),
      });

      expect(run.code).toBe(0);
      const layout = await readProjectFile(cwd, 'app/layout.tsx');
      expect(layout).toContain('greeting="Hello from Jamie\'s agent"');
      expect(layout).toContain('"What is Jamie’s stack?"');
      // Questions the layout didn't set start from the defaults.
      expect(layout).toContain('"What is Jamie’s experience?"');
      expect(layout).toContain('theme="light"');
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

  describe('standalone server', () => {
    it('summarises the server and its allowed origins, and offers to change them', async () => {
      const cwd = await existingStandaloneProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, { answers: rerunAnswers() });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Server: api\/luzia\.ts \(allowed origins: https:\/\/jamie\.example\.com, https:\/\/www\.jamie\.example\.com\)/);
      expect(run.stdout).not.toMatch(/Route:/);
      const menu = run.asked.find((asked) => /What do you want to change/.test(asked.message));
      expect(menu?.options).toEqual(['models', 'core', 'instructions', 'widget', 'origins', 'production', 'done']);
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
    });

    it('changes the allowed origins in the function file after a diff, leaving the rest of it as it is', async () => {
      const cwd = await existingStandaloneProject();
      const before = await snapshot(cwd);
      const embeddings = fakeEmbeddingModel();

      const run = await runInit(cwd, {
        answers: rerunAnswers([
          'origins',
          [
            answer.text(/portfolio.*domain/i, 'jamie.example.com, localhost:8080'),
            answer.confirm(/allowed origins.*api\/luzia\.ts/, true),
          ],
        ]),
        embeddingModel: embeddings.model,
      });

      expect(run.code).toBe(0);
      // The current origins are shown, and kept when the answer is left empty.
      expect(run.asked.find((asked) => /domain/i.test(asked.message))?.message).toContain(
        'https://jamie.example.com, https://www.jamie.example.com',
      );
      expect(run.stdout).toMatch(/Update api\/luzia\.ts:[\s\S]*-\s+allowedOrigins: \['https:\/\/jamie\.example\.com', 'https:\/\/www\.jamie\.example\.com'\],[\s\S]*\+\s+allowedOrigins: \['https:\/\/jamie\.example\.com', 'http:\/\/localhost:8080'\],/);
      const fn = await readProjectFile(cwd, 'api/luzia.ts');
      expect(fn).toContain("allowedOrigins: ['https://jamie.example.com', 'http://localhost:8080'],");
      expect(fn).toContain('export const OPTIONS = handler;');
      expect(changedFiles(before, await snapshot(cwd))).toEqual(['api/luzia.ts']);
      expect(embeddings.embeddedValues).toEqual([]);
      expect(run.commands).toEqual([]);
    });

    it('keeps the allowed origins when the answer is left empty', async () => {
      const cwd = await existingStandaloneProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, { answers: rerunAnswers(['origins', [answer.text(/portfolio.*domain/i, '')]]) });

      expect(run.code).toBe(0);
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
    });

    it('reprints the snippet with the new widget options, with the placeholder endpoint when the server URL is unknown', async () => {
      const cwd = await existingStandaloneProject();
      const before = await snapshot(cwd);

      const run = await runInit(cwd, {
        answers: rerunAnswers(['widget', [...widgetAnswers({ theme: 'dark' }), answer.text(/server.*URL/i, '')]]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toContain('<script type="module" src="https://cdn.jsdelivr.net/npm/@luzia/widget/dist/luzia-widget.js"></script>');
      const snippet = run.stdout.slice(run.stdout.indexOf('<luzia-widget'), run.stdout.indexOf('</luzia-widget>'));
      expect(snippet).toContain('endpoint="https://YOUR-LUZIA-SERVER.vercel.app/api/luzia"');
      expect(snippet).toContain('contact="hello@jamie.dev"');
      expect(snippet).toContain('theme="dark"');
      const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
      expect(summary).toContain('YOUR-LUZIA-SERVER');
      expect(changedFiles(before, await snapshot(cwd))).toEqual([]);
      expect(run.commands).toEqual([]);
    });

    it('reads the widget options and endpoint back from a page in the folder that has the widget', async () => {
      const cwd = await existingStandaloneProject({
        'index.html': `<!doctype html>
<html>
  <head><script type="module" src="https://cdn.jsdelivr.net/npm/@luzia/widget/dist/luzia-widget.js"></script></head>
  <body>
    <luzia-widget
      endpoint="https://luzia-jamie.vercel.app/api/luzia"
      contact="hello@jamie.dev"
      greeting="Welcome! Ask about Jamie&#39;s projects."
      suggested-questions="[&quot;What has Jamie shipped?&quot;,&quot;Where is Jamie based?&quot;,&quot;Can I hire Jamie?&quot;]"
      theme="light"
      mode="inline"
    ></luzia-widget>
  </body>
</html>
`,
      });

      const run = await runInit(cwd, { answers: rerunAnswers(['widget', widgetAnswers({ theme: 'light', mode: 'bubble' })]) });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Widget: in index\.html/);
      expect(run.stdout).toContain("Greeting: Welcome! Ask about Jamie's projects.");
      const initial = (question: RegExp) => run.asked.find((asked) => question.test(asked.message))?.initialValue;
      expect(initial(/theme/i)).toBe('light');
      expect(initial(/bubble|inline/i)).toBe('inline');
      const snippet = run.stdout.slice(run.stdout.indexOf('<luzia-widget'), run.stdout.indexOf('</luzia-widget>'));
      expect(snippet).toContain('endpoint="https://luzia-jamie.vercel.app/api/luzia"');
      expect(snippet).toContain('suggested-questions="[&quot;What has Jamie shipped?&quot;');
      expect(snippet).toContain('mode="bubble"');
      expect(run.stdout).not.toContain('YOUR-LUZIA-SERVER');
    });
  });

  describe('partial setup: a Core without the integration', () => {
    it('on Next.js, offers to set up the integration and adds the route, the widget and the scripts', async () => {
      const cwd = await existingSetupProject({}, { integration: false });

      const run = await runInit(cwd, {
        answers: rerunAnswers(['integration', [...widgetAnswers({ theme: 'dark' }), ...integrationAnswers()]]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Route: not found/);
      const menus = run.asked.filter((asked) => /What do you want to change/.test(asked.message));
      expect(menus[0]?.options).toEqual(['integration', 'models', 'core', 'instructions', 'widget', 'production', 'done']);
      expect(menus[0]?.initialValue).toBe('integration');
      // Once set up, the entry is gone.
      expect(menus[1]?.options).not.toContain('integration');

      expect(await readProjectFile(cwd, 'app/api/luzia/route.ts')).toContain('createLuziaHandler');
      const layout = await readProjectFile(cwd, 'app/layout.tsx');
      expect(layout).toContain('contact="hello@jamie.dev"');
      expect(layout).toContain('theme="dark"');
      const packageJson = JSON.parse(await readProjectFile(cwd, 'package.json'));
      expect(packageJson.scripts.dev).toMatch(/^luzia build && /);
      expect(run.commands).toEqual(['pnpm add @luzia/core @luzia/react', 'pnpm add -D @luzia/cli']);
    });

    it('on a standalone folder, offers to set up the server, then builds the missing Knowledge Base', async () => {
      const cwd = await existingStandaloneProject({}, { server: false });
      await rm(path.join(cwd, '.luzia'), { recursive: true });

      const run = await runInit(cwd, {
        answers: rerunAnswers(['integration', [...widgetAnswers(), ...standaloneAnswers()]]),
      });

      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Server: not set up yet/);
      const menus = run.asked.filter((asked) => /What do you want to change/.test(asked.message));
      expect(menus[0]?.options).toEqual(['integration', 'models', 'core', 'instructions', 'widget', 'production', 'done']);
      // Once the server exists, its allowed origins can be changed instead.
      expect(menus[1]?.options).toEqual(['models', 'core', 'instructions', 'widget', 'origins', 'production', 'done']);

      expect(await readProjectFile(cwd, 'api/luzia.ts')).toContain(
        "allowedOrigins: ['https://jamie.example.com', 'https://www.jamie.example.com']",
      );
      expect(run.stdout).toContain('<luzia-widget');
      expect(run.stdout).toContain('contact="hello@jamie.dev"');
      expect(JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json')).core.text).toContain('hello@jamie.dev');
    });
  });
});
