import { describe, expect, it } from 'vitest';
import {
  answer,
  coreAnswers,
  cvAnswers,
  cvDraftingModel,
  cvFixture,
  fakeEmbeddingModel,
  fullRunAnswers,
  ownerProject,
  projectFileExists,
  OWNER_KEYS,
  readProjectFile,
  reviewAnswer,
  runInit,
  unusedChatModel,
  type CvFacts,
} from './support/init-harness.ts';

/** Everything the CV states, so nothing is missing. */
const COMPLETE_CV: CvFacts = {
  name: 'Ada Example',
  summary: 'Backend engineer building payment services in Go and Java.',
  highlights: ['Northwind Payments, 2019 to now: built Go services running on Kubernetes.'],
  email: 'ada@example.com',
  links: ['https://github.com/ada-example'],
  location: null,
  roleSought: 'A staff backend role',
  availability: 'From January',
  workMode: 'Remote',
};

describe('luzia init: Core drafted from the CV', () => {
  it('drafts the Core from the CV with the Owner’s chat model, saves it on accept and adds the CV to the Knowledge Base', async () => {
    const cwd = await ownerProject('nextjs-app', { 'docs/cv.pdf': await cvFixture('cv.pdf') });
    const chat = cvDraftingModel([COMPLETE_CV]);
    const embeddings = fakeEmbeddingModel();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ core: cvAnswers({ path: 'docs/cv.pdf' }) }),
      chatModel: chat.model,
      embeddingModel: embeddings.model,
    });

    expect(run.code).toBe(0);
    // Consent named the provider before anything was sent.
    const consent = run.asked.find((asked) => /send/i.test(asked.message));
    expect(consent?.message).toMatch(/Anthropic/);

    // The drafting prompt carries the CV's text and the stated-facts-only bar.
    expect(chat.prompts).toHaveLength(1);
    expect(chat.prompts[0]).toContain('Northwind Payments');
    expect(chat.prompts[0]).toMatch(/only (the )?facts.*stated/i);
    expect(chat.prompts[0]).toMatch(/never infer/i);

    // The full draft was shown, and saved as drafted.
    const core = await readProjectFile(cwd, 'knowledge-base/core.md');
    expect(core).toMatch(/^# Ada Example/);
    expect(core).toContain('Backend engineer building payment services in Go and Java.');
    expect(core).toContain('Northwind Payments, 2019 to now');
    expect(core).toContain('ada@example.com');
    expect(core).toContain('https://github.com/ada-example');
    expect(core).toContain('A staff backend role');
    expect(core).toContain('From January');
    for (const line of core.trimEnd().split('\n').filter(Boolean)) expect(run.stdout).toContain(line);

    // The CV is in the Knowledge Base and the build embedded it.
    expect(await projectFileExists(cwd, 'knowledge-base/cv.pdf')).toBe(true);
    expect(embeddings.embeddedValues.join('\n')).toContain('Northwind Payments');
    const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
    expect(artifact.chunks.map((chunk: { source: string }) => chunk.source)).toContain('cv.pdf');
    expect(artifact.core.text).toContain('Ada Example');
  });

  it('sends nothing when the Owner declines, and writes the Core from questions instead', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const chat = unusedChatModel();
    const questions = coreAnswers().slice(1);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ core: [...cvAnswers({ consent: false, review: [] }), ...questions] }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(chat.calls).toBe(0);
    expect(run.stdout).toMatch(/not sent/);
    expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toMatch(/^# Jamie Rivera/);
    expect(await projectFileExists(cwd, 'knowledge-base/cv.pdf')).toBe(false);
  });

  it('asks for the essentials the CV doesn’t state and merges the answers into the Core', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const chat = cvDraftingModel([{ ...COMPLETE_CV, email: null, roleSought: null, availability: null, workMode: null }]);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: cvAnswers({
          missing: [
            answer.text(/Visitors contact you/, 'https://ada.example.com/contact'),
            answer.text(/role/i, 'A platform engineering role'),
            answer.text(/available/i, 'Two weeks’ notice'),
            answer.select(/work mode/i, 'hybrid'),
          ],
        }),
      }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/doesn’t state how Visitors should contact you, the role you’re looking for, your availability, your preferred work mode/);
    // Essentials the CV states are not asked again.
    expect(run.asked.some((asked) => /your name|summary/i.test(asked.message))).toBe(false);
    const core = await readProjectFile(cwd, 'knowledge-base/core.md');
    expect(core).toMatch(/^# Ada Example/);
    expect(core).toContain('https://ada.example.com/contact (preferred)');
    expect(core).toContain('A platform engineering role.');
    expect(core).toContain('Availability: Two weeks’ notice');
    expect(core).toContain('Work mode: Hybrid');
    expect(core).not.toContain('ada@example.com');
  });

  it('saves the Core as the Owner edited it in their editor', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const edited = '# Ada Example\n\nBackend engineer. Ask me about payments.\n\n## Contact\n\n- Email: ada@example.com\n';

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: cvAnswers({ review: [reviewAnswer('edit'), answer.editor(/Edit your Core/, edited)] }),
      }),
      chatModel: cvDraftingModel([COMPLETE_CV]).model,
    });

    expect(run.code).toBe(0);
    expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toBe(edited);
    expect(await projectFileExists(cwd, 'knowledge-base/cv.pdf')).toBe(true);
  });

  it('drafts the Core again on redo, keeping the answers already given, and saves only the accepted draft', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const chat = cvDraftingModel([
      { ...COMPLETE_CV, summary: 'First draft summary.', availability: null },
      { ...COMPLETE_CV, summary: 'Second draft summary.', availability: null },
    ]);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: cvAnswers({
          missing: [answer.text(/available/i, 'From February')],
          review: [reviewAnswer('redo'), reviewAnswer('accept')],
        }),
      }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(chat.prompts).toHaveLength(2);
    expect(run.stdout).toContain('First draft summary.');
    const core = await readProjectFile(cwd, 'knowledge-base/core.md');
    expect(core).toContain('Second draft summary.');
    expect(core).not.toContain('First draft summary.');
    expect(core).toContain('Availability: From February');
  });

  it('explains that a scanned PDF has no text to draft from and offers the questions path', async () => {
    const cwd = await ownerProject('nextjs-app', { 'scan.pdf': await cvFixture('scan.pdf') });
    const chat = unusedChatModel();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: [
          answer.select(/write your Core/, 'cv'),
          answer.text(/CV/, 'scan.pdf'),
          answer.confirm(/answering a few questions instead/, true),
          ...coreAnswers().slice(1),
        ],
      }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/scan\.pdf has little or no text.*scanned image/);
    expect(chat.calls).toBe(0);
    expect(run.asked.some((asked) => /Send/.test(asked.message))).toBe(false);
    expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toMatch(/^# Jamie Rivera/);
    expect(await projectFileExists(cwd, 'knowledge-base/scan.pdf')).toBe(false);
  });

  it('names the provider and key when drafting fails, and retries after the Owner re-enters the key', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const chat = cvDraftingModel([new Error('Invalid x-api-key'), COMPLETE_CV]);
    const newKey = 'sk-ant-corrected-5555555555';

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: cvAnswers({
          missing: [
            answer.select(/Drafting failed/, 'key'),
            answer.secret('ANTHROPIC_API_KEY', newKey),
            answer.confirm(/Save the new key/, true),
          ],
        }),
      }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/Anthropic.*failed: Invalid x-api-key/);
    expect(run.stderr).toContain('ANTHROPIC_API_KEY');
    expect(chat.prompts).toHaveLength(2);
    const env = await readProjectFile(cwd, '.env.local');
    expect(env).toContain(`ANTHROPIC_API_KEY=${newKey}`);
    expect(env).not.toContain(OWNER_KEYS.anthropic);
    expect(run.output).not.toContain(newKey);
    expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toMatch(/^# Ada Example/);
  });

  it('switches to the questions path when drafting fails and the Owner prefers that', async () => {
    const cwd = await ownerProject('nextjs-app', { 'cv.pdf': await cvFixture('cv.pdf') });
    const chat = cvDraftingModel([new Error('model not found: claude-typo')]);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        core: [
          ...cvAnswers({ missing: [answer.select(/Drafting failed/, 'questions')], review: [] }),
          ...coreAnswers().slice(1),
        ],
      }),
      chatModel: chat.model,
    });

    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/model id \(claude-sonnet-5-5\)/);
    expect(await readProjectFile(cwd, 'knowledge-base/core.md')).toMatch(/^# Jamie Rivera/);
    expect(await projectFileExists(cwd, 'knowledge-base/cv.pdf')).toBe(false);
  });
});
