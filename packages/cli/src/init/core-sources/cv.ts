import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { CHAT_PROVIDERS, pdfReader } from 'luzia-core';
import { DEFAULT_KNOWLEDGE_BASE_DIR } from '../../commands/build.ts';
import type { WizardContext } from '../context.ts';
import { mergeEnvFile } from '../env-file.ts';
import { required } from '../prompter.ts';
import { ENV_FILE } from '../steps/models.ts';
import { draftCoreFacts, type CvFacts } from './cv-draft.ts';
import { questionsCoreSource } from './questions.ts';
import { renderCore, WORK_MODES, type WorkMode } from './render.ts';
import type { CoreSource, ProposedCore } from './source.ts';

/** A CV the Owner pointed at, read locally. */
interface Cv {
  fileName: string;
  bytes: Buffer;
  text: string;
}

/** The Owner's chat provider, as the consent prompt and failure messages name it. */
interface DraftingProvider {
  label: string;
  /** Where its API key lives, when the Owner chose a built-in provider. */
  apiKeyEnv?: string;
  model?: string;
}

/** What the Owner answered for essentials the CV leaves out, kept across redos. */
type OwnerAnswers = Partial<Record<'name' | 'summary' | 'contact' | 'role' | 'availability' | 'workMode', string>>;

/**
 * Drafts the Core from the Owner's CV PDF with their chat model, after their
 * consent, using only what the CV states; asks for the essentials it leaves
 * out, and adds the CV to the Knowledge Base. Falls back to the questions path
 * when the Owner declines, the PDF has no text, or drafting fails.
 */
export const cvCoreSource: CoreSource = {
  id: 'cv',
  label: 'Draft it from your CV (PDF)',
  hint: 'with your chat model; you review it before it is saved',
  async create(context) {
    const cv = await askForCv(context);
    if (!cv) return questionsCoreSource.create(context);

    const provider = draftingProvider(context);
    context.say(
      `To draft your Core, the text of ${cv.fileName} is sent to ${provider.label}, your chat provider, and nowhere else. ` +
        'Only facts your CV states are used; you review the draft before anything is saved.',
    );
    const consent = await context.prompter.confirm({
      message: `Send the text of ${cv.fileName} to ${provider.label} to draft your Core?`,
      initialValue: true,
    });
    if (!consent) {
      context.say('Your CV was not sent. Let’s write your Core by answering a few questions instead.');
      return questionsCoreSource.create(context);
    }

    const answers: OwnerAnswers = {};
    const draft = async (): Promise<ProposedCore | null> => {
      const facts = await draftWithRecovery(context, cv, provider);
      if (!facts) return null;
      return { ...(await completeCore(context, facts, answers)), files: [cvFile(cv)], drafted: true, redo: async () => (await draft()) ?? questions() };
    };
    const questions = async () => (await questionsCoreSource.create(context))!;
    return (await draft()) ?? questions();
  },
};

/** Asks for the CV until it has text to draft from; `null` when the Owner prefers the questions path. */
async function askForCv(context: WizardContext): Promise<Cv | null> {
  for (;;) {
    const answer = await context.prompter.text({
      message: 'Path to your CV (PDF)',
      placeholder: 'e.g. ~/Documents/cv.pdf',
      validate: (value) => {
        const missing = required('the path to your CV')(value);
        if (missing) return missing;
        const file = resolveCvPath(context.cwd, value);
        if (!existsSync(file)) return `No file at ${file}.`;
        if (!/\.pdf$/i.test(file)) return 'Please choose a PDF file.';
        return undefined;
      },
    });
    const file = resolveCvPath(context.cwd, answer);
    const fileName = path.basename(file);

    let problem: string;
    try {
      const result = await pdfReader.read(file);
      if (!result.warnings?.length) {
        return { fileName, bytes: await readFile(file), text: result.sections.map((section) => section.text).join('\n\n') };
      }
      problem =
        `${fileName} has little or no text that can be extracted; it is probably a scanned image. ` +
        'Your Core can’t be drafted from it (and the Agent couldn’t read it either).';
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    context.warn(problem);
    if (await context.prompter.confirm({ message: 'Write your Core by answering a few questions instead?', initialValue: true })) {
      return null;
    }
  }
}

/** Resolves a path as typed or dragged into the terminal (quotes, escaped spaces, `~`). */
function resolveCvPath(cwd: string, value: string): string {
  let typed = value.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/\\ /g, ' ');
  if (typed === '~' || typed.startsWith('~/')) typed = path.join(homedir(), typed.slice(1));
  return path.resolve(cwd, typed);
}

function draftingProvider(context: WizardContext): DraftingProvider {
  const chat = context.state.models?.chat;
  if (!chat) return { label: 'your chat provider' };
  const provider = CHAT_PROVIDERS[chat.provider];
  return { label: provider.label, apiKeyEnv: provider.apiKeyEnv, model: chat.model };
}

/**
 * Drafts until it works; on failure names the provider and key, and lets the
 * Owner re-enter the key and retry, retry as is, or switch to questions (`null`).
 */
async function draftWithRecovery(context: WizardContext, cv: Cv, provider: DraftingProvider): Promise<CvFacts | null> {
  for (;;) {
    context.say(`Drafting your Core from ${cv.fileName} with ${provider.label}…`);
    try {
      return await draftCoreFacts(await context.chatModel(), cv.text);
    } catch (error) {
      context.warn(`Drafting the Core with ${provider.label} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (provider.apiKeyEnv) {
        context.warn(`Check the model id (${provider.model}) and the API key in ${provider.apiKeyEnv}.`);
      }
      const next = await context.prompter.select({
        message: 'Drafting failed. What do you want to do?',
        options: [
          ...(provider.apiKeyEnv ? [{ value: 'key', label: `Enter ${provider.apiKeyEnv} again and retry` }] : []),
          { value: 'retry', label: 'Retry' },
          { value: 'questions', label: 'Write the Core by answering questions instead' },
        ],
      });
      if (next === 'questions') return null;
      if (next === 'key' && provider.apiKeyEnv) await reenterKey(context, provider.label, provider.apiKeyEnv);
    }
  }
}

async function reenterKey(context: WizardContext, label: string, name: string): Promise<void> {
  const key = (
    await context.prompter.secret({ message: `Your ${label} API key (saved to ${ENV_FILE} as ${name})`, validate: required('the API key') })
  ).trim();
  context.addSecret(key);
  context.state.envValues = { ...context.state.envValues, [name]: key };
  const content = mergeEnvFile((await context.readFile(ENV_FILE)) ?? '', { [name]: key }, 'luzIA: models and API keys (server-side only, never commit this file)');
  if (!(await context.apply({ files: [{ path: ENV_FILE, content }] }, `Save the new key to ${ENV_FILE}?`))) {
    context.changes.todo.push(`Set ${name} in ${ENV_FILE}`);
  }
}

/** Asks the Owner for every essential the draft marks missing, and writes the Core from both. */
async function completeCore(context: WizardContext, facts: CvFacts, answers: OwnerAnswers) {
  const { prompter } = context;
  const stated = {
    name: facts.name?.trim() || undefined,
    summary: facts.summary?.trim() || undefined,
    contact: facts.email?.trim() || undefined,
    role: facts.roleSought?.trim() || undefined,
    availability: facts.availability?.trim() || undefined,
    workMode: facts.workMode?.trim() || undefined,
  };
  const labels = {
    name: 'your name',
    summary: 'a short summary',
    contact: 'how Visitors should contact you',
    role: 'the role you’re looking for',
    availability: 'your availability',
    workMode: 'your preferred work mode',
  } as const;
  const missing = (Object.keys(labels) as (keyof typeof labels)[]).filter((key) => !stated[key] && !answers[key]);

  if (missing.length > 0) {
    context.say(`Your CV doesn’t state ${missing.map((key) => labels[key]).join(', ')}. A few questions to complete your Core:`);
  }
  const ask = async (message: string, what: string) => (await prompter.text({ message, validate: required(what) })).trim();
  for (const key of missing) {
    if (key === 'name') answers.name = await ask('Your name, as Visitors should see it', 'your name');
    if (key === 'summary') {
      answers.summary = await ask('A short summary: who you are and what you do (one or two sentences)', 'a summary');
    }
    if (key === 'contact') {
      answers.contact = await ask('How should Visitors contact you? (email or URL; the widget shows it too)', 'an email or URL');
    }
    if (key === 'role') answers.role = await ask('What role are you looking for?', 'the role you are looking for');
    if (key === 'availability') {
      answers.availability = await ask('When are you available? (e.g. from March, two weeks’ notice)', 'your availability');
    }
    if (key === 'workMode') {
      const mode = await prompter.select<WorkMode>({
        message: 'Preferred work mode',
        options: Object.entries(WORK_MODES).map(([value, label]) => ({ value: value as WorkMode, label })),
      });
      answers.workMode = WORK_MODES[mode];
    }
  }

  const value = (key: keyof typeof labels) => (stated[key] ?? answers[key])!;
  return renderCore({
    name: value('name'),
    summary: value('summary'),
    highlights: facts.highlights.map((item) => item.trim()).filter(Boolean),
    contact: value('contact'),
    links: facts.links.map((link) => link.trim()).filter(Boolean),
    role: value('role'),
    availability: value('availability'),
    workMode: value('workMode'),
    location: facts.location?.trim() || null,
  });
}

function cvFile(cv: Cv) {
  return { path: `${DEFAULT_KNOWLEDGE_BASE_DIR}/${cv.fileName}`, content: cv.bytes };
}
