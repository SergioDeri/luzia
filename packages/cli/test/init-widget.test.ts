import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { WizardStep } from '../src/init/step.ts';
import { wizardSteps } from '../src/init/steps/index.ts';
import { runInitWizard } from '../src/init/wizard.ts';
import {
  answer,
  coreAnswers,
  fakeRunner,
  reviewAnswer,
  scriptedPrompter,
  fullRunAnswers,
  integrationAnswers,
  ownerProject,
  readProjectFile,
  runInit,
  unusedChatModel,
  widgetAnswers,
} from './support/init-harness.ts';

describe('luzia init: widget on Next.js', () => {
  it('adds the widget to the root layout with the Core contact, default greeting and questions, theme and mode', async () => {
    const cwd = await ownerProject('nextjs-app');
    const chatModel = unusedChatModel();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ widget: widgetAnswers({ theme: 'dark', mode: 'inline' }) }),
      chatModel: chatModel.model,
    });

    expect(run.code).toBe(0);
    const layout = await readProjectFile(cwd, 'app/layout.tsx');
    expect(layout).toContain("import { LuziaWidget } from '@luzia/react';");
    expect(layout).toContain('endpoint="/api/luzia"');
    expect(layout).toContain('contact="jamie.rivera@example.com"');
    expect(layout).toMatch(/greeting="Hi! I’m luzIA, an AI agent that answers questions about Jamie\. What would you like to know\?"/);
    expect(layout).toContain('"What role is Jamie looking for?"');
    expect(layout).toContain('theme="dark"');
    expect(layout).toContain('mode="inline"');
    // The widget sits inside the body, after the page.
    expect(layout).toMatch(/<body>\s*\{children\}\s*<LuziaWidget[\s\S]*\/>\s*<\/body>/);
    // The layout change was shown as a diff before it was written.
    expect(run.stdout).toMatch(/Update app\/layout\.tsx:[\s\S]*\+\s+<LuziaWidget/);
    // The questions path drafts nothing with the model, the widget copy included.
    expect(chatModel.calls).toBe(0);
  });

  it('writes the greeting and questions the Owner edited, keeping the ones left empty', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        widget: widgetAnswers({
          edit: { greeting: 'Hey, ask me "anything" about Jamie & co.', questions: ['Can Jamie lead a team?', '', 'Does Jamie know {GraphQL}?'] },
        }),
      }),
    });

    expect(run.code).toBe(0);
    const layout = await readProjectFile(cwd, 'app/layout.tsx');
    expect(layout).toContain('greeting={"Hey, ask me \\"anything\\" about Jamie & co."}');
    expect(layout).toMatch(/suggestedQuestions=\{\[\s*"Can Jamie lead a team\?",\s*"What is Jamie’s experience\?",\s*"Does Jamie know \{GraphQL\}\?",\s*\]\}/);
    expect(layout).toContain('theme="auto"');
    expect(layout).toContain('mode="bubble"');
  });

  it('takes the name and contact from the Core as the Owner edited it in their editor', async () => {
    const cwd = await ownerProject('nextjs-app');
    const edited = '# Sam Rivera\n\nFull-stack developer.\n\n## Contact\n\n- https://github.com/jamie-example\n- https://sam.example.com/contact (preferred)\n';

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: coreAnswers({ review: [reviewAnswer('edit'), answer.editor(/Edit your Core/, edited)] }),
      }),
    });

    expect(run.code).toBe(0);
    const layout = await readProjectFile(cwd, 'app/layout.tsx');
    expect(layout).toContain('contact="https://sam.example.com/contact"');
    expect(layout).not.toContain('jamie.rivera@example.com');
    expect(layout).toContain('answers questions about Sam.');
    expect(await readProjectFile(cwd, 'knowledge-base/instructions.md')).toContain('say Sam Rivera prefers to discuss it on a call');
  });

  it('asks for the widget contact when the edited Core no longer states one', async () => {
    const cwd = await ownerProject('nextjs-app');
    const edited = '# Jamie Rivera\n\nFull-stack developer.\n';

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: coreAnswers({ review: [reviewAnswer('edit'), answer.editor(/Edit your Core/, edited)] }),
        widget: [answer.text(/How should Visitors contact you/, 'https://jamie.dev'), ...widgetAnswers()],
      }),
    });

    expect(run.code).toBe(0);
    expect(await readProjectFile(cwd, 'app/layout.tsx')).toContain('contact="https://jamie.dev"');
  });

  it('prefixes the dev and build scripts with luzia build, and keeps the compiled Knowledge Base out of git', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, { answers: fullRunAnswers() });

    expect(run.code).toBe(0);
    const scripts = JSON.parse(await readProjectFile(cwd, 'package.json')).scripts;
    expect(scripts).toEqual({ dev: 'luzia build && next dev', build: 'luzia build && next build', start: 'next start' });
    expect(run.stdout).toMatch(/Update package\.json:[\s\S]*-\s+"dev": "next dev",[\s\S]*\+\s+"dev": "luzia build && next dev",/);
    expect(await readProjectFile(cwd, '.gitignore')).toMatch(/^\.luzia\/$/m);
  });

  it('does not prefix a script that already runs luzia build, nor ask when nothing changes', async () => {
    const packageJson = {
      name: 'jamie-portfolio',
      private: true,
      scripts: { dev: 'luzia build && next dev', build: 'next build' },
      dependencies: { next: '^16.4.6', react: '^19.3.1', 'react-dom': '^19.3.1' },
    };
    const cwd = await ownerProject('nextjs-app', { 'package.json': `${JSON.stringify(packageJson, null, 2)}\n` });

    const run = await runInit(cwd, { answers: fullRunAnswers() });
    expect(run.code).toBe(0);
    expect(JSON.parse(await readProjectFile(cwd, 'package.json')).scripts).toEqual({
      dev: 'luzia build && next dev',
      build: 'luzia build && next build',
    });

    const again = await ownerProject('nextjs-app', { 'package.json': await readProjectFile(cwd, 'package.json') });
    const rerun = await runInit(again, { answers: fullRunAnswers({ integration: integrationAnswers({ scripts: null }) }) });
    expect(rerun.code).toBe(0);
  });

  it('leaves the layout and scripts untouched when the Owner declines, and lists them as still to do', async () => {
    const cwd = await ownerProject('nextjs-app');
    const layout = await readProjectFile(cwd, 'app/layout.tsx');
    const packageJson = await readProjectFile(cwd, 'package.json');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ integration: integrationAnswers({ layout: false, scripts: false }) }),
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Update app\/layout\.tsx:/);
    expect(await readProjectFile(cwd, 'app/layout.tsx')).toBe(layout);
    expect(await readProjectFile(cwd, 'package.json')).toBe(packageJson);
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).toMatch(/Still to do:[\s\S]*app\/layout\.tsx/);
    expect(summary).toMatch(/Still to do:[\s\S]*luzia build &&/);
  });

  it('prints the exact snippet instead of changing a layout it does not recognise', async () => {
    const custom = "import type { ReactNode } from 'react';\nimport { Shell } from './shell';\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <Shell>{children}</Shell>;\n}\n";
    const cwd = await ownerProject('nextjs-app', { 'app/layout.tsx': custom });

    const run = await runInit(cwd, { answers: fullRunAnswers({ integration: integrationAnswers({ layout: null }) }) });

    expect(run.code).toBe(0);
    expect(await readProjectFile(cwd, 'app/layout.tsx')).toBe(custom);
    expect(run.stdout).toContain("import { LuziaWidget } from '@luzia/react';");
    expect(run.stdout).toMatch(/<LuziaWidget\s+endpoint="\/api\/luzia"\s+contact="jamie\.rivera@example\.com"\s+greeting=/);
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).toMatch(/Still to do:[\s\S]*LuziaWidget[\s\S]*app\/layout\.tsx/);
  });

  it('replaces a widget already in the layout instead of adding a second one', async () => {
    const withWidget = [
      "import type { ReactNode } from 'react';",
      "import { LuziaWidget } from '@luzia/react';",
      '',
      'export default function RootLayout({ children }: { children: ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        {children}',
      '        <LuziaWidget endpoint="/api/luzia" contact="old@example.com" theme="auto" />',
      '      </body>',
      '    </html>',
      '  );',
      '}',
      '',
    ].join('\n');
    const cwd = await ownerProject('nextjs-app', { 'app/layout.tsx': withWidget });

    const run = await runInit(cwd, { answers: fullRunAnswers({ widget: widgetAnswers({ theme: 'light' }) }) });

    expect(run.code).toBe(0);
    const layout = await readProjectFile(cwd, 'app/layout.tsx');
    expect(layout.match(/<LuziaWidget/g)).toHaveLength(1);
    expect(layout.match(/from '@luzia\/react'/g)).toHaveLength(1);
    expect(layout).toContain('theme="light"');
    expect(layout).toContain('contact="jamie.rivera@example.com"');
    expect(layout).not.toContain('old@example.com');
    expect(run.stdout).toMatch(/-\s+<LuziaWidget endpoint="\/api\/luzia" contact="old@example\.com"[\s\S]*\+\s+theme="light"/);
  });
});

// The model proposes the widget copy only when it drafted the Core (the CV
// path, where the Owner already agreed to send their details to it). Until
// that path is in the wizard, a stand-in Core step provides a drafted Core.
describe('luzia init: widget copy from a drafted Core', () => {
  const draftedCoreStep: WizardStep = {
    id: 'core',
    async run(context) {
      context.state.core = {
        text: '# Jamie Rivera\n\nFull-stack developer. Contact: jamie.rivera@example.com\n',
        ownerName: 'Jamie Rivera',
        contact: 'jamie.rivera@example.com',
        drafted: true,
      };
    },
  };
  const laterSteps = wizardSteps.filter((step) => step.id === 'widget' || step.id === 'nextjs');

  async function runWithDraftedCore(chatModel: MockLanguageModelV4) {
    const cwd = await ownerProject('nextjs-app');
    const prompter = scriptedPrompter([...widgetAnswers(), ...integrationAnswers()]);
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      cwd,
      env: {},
      stdout: (line: string) => out.push(line),
      stderr: (line: string) => err.push(line),
      prompter: prompter.prompter,
      runner: fakeRunner().runner,
      chatModel,
    };
    const code = await runInitWizard(io, [draftedCoreStep, ...laterSteps]);
    expect(prompter.problems()).toEqual([]);
    return { code, cwd, stdout: out.join('\n'), stderr: err.join('\n') };
  }

  it('proposes the greeting and questions the model suggests from the Core', async () => {
    const proposal = {
      greeting: 'Hello! Ask me anything about Jamie’s work.',
      suggestedQuestions: ['Which stack does Jamie use?', 'What did Jamie build at Shopwise?', 'Is Jamie available?'],
    };
    const chatModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(proposal) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    });

    const run = await runWithDraftedCore(chatModel);

    expect(run.code).toBe(0);
    expect(JSON.stringify(chatModel.doGenerateCalls[0]?.prompt)).toContain('Full-stack developer');
    expect(run.stdout).toContain('Greeting: Hello! Ask me anything about Jamie’s work.');
    const layout = await readProjectFile(run.cwd, 'app/layout.tsx');
    expect(layout).toContain('greeting="Hello! Ask me anything about Jamie’s work."');
    for (const question of proposal.suggestedQuestions) expect(layout).toContain(JSON.stringify(question));
  });

  it('starts from the fixed defaults when the model call fails', async () => {
    const chatModel = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('Invalid API key');
      },
    });

    const run = await runWithDraftedCore(chatModel);

    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/Couldn’t suggest a greeting[\s\S]*defaults/);
    const layout = await readProjectFile(run.cwd, 'app/layout.tsx');
    expect(layout).toContain(
      'greeting="Hi! I’m luzIA, an AI agent that answers questions about Jamie. What would you like to know?"',
    );
  });
});
