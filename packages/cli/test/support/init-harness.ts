import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';
import { runCli, type CliIo } from '../../src/index.ts';
import type { CvFacts } from '../../src/init/core-sources/cv-draft.ts';
import type { CommandRequest, CommandResult, CommandRunner } from '../../src/init/command-runner.ts';
import { WizardCancelledError, type Prompter } from '../../src/init/prompter.ts';

const fixtures = new URL('../fixtures/', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Projects

/**
 * Copies a fixture project (e.g. `nextjs-app`) to a temporary folder, without
 * the `remove`d files or folders, and with extra or replaced `files`.
 */
export async function ownerProject(
  fixture: string,
  files: Record<string, string | Uint8Array> = {},
  options: { remove?: string[] } = {},
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-init-'));
  await cp(path.join(fixtures, fixture), cwd, { recursive: true });
  for (const file of options.remove ?? []) await rm(path.join(cwd, file), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), content);
  }
  return cwd;
}

/** A fixture CV PDF (`cv.pdf` with a text layer, `scan.pdf` without), as bytes to put in a project. */
export async function cvFixture(name: 'cv.pdf' | 'scan.pdf'): Promise<Buffer> {
  return readFile(path.join(fixtures, 'cv', name));
}

/** An empty temporary folder (the standalone path), with optional `files`. */
export async function emptyProject(files: Record<string, string> = {}): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-init-'));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), content);
  }
  return cwd;
}

export async function readProjectFile(cwd: string, file: string): Promise<string> {
  return readFile(path.join(cwd, file), 'utf8');
}

export async function projectFileExists(cwd: string, file: string): Promise<boolean> {
  return stat(path.join(cwd, file)).then(
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Scripted prompter

type Kind = 'text' | 'secret' | 'select' | 'confirm' | 'editor';

/** One expected question (matched against the prompt message) and the Owner's answer. */
export interface ScriptedAnswer {
  kind: Kind;
  question: string | RegExp;
  answer: string | boolean | typeof CANCEL;
}

/** Answer with this to cancel at that question, as Ctrl+C does. */
export const CANCEL = Symbol('cancel');

export const answer = {
  text: (question: string | RegExp, value: string): ScriptedAnswer => ({ kind: 'text', question, answer: value }),
  secret: (question: string | RegExp, value: string): ScriptedAnswer => ({ kind: 'secret', question, answer: value }),
  select: (question: string | RegExp, value: string): ScriptedAnswer => ({ kind: 'select', question, answer: value }),
  confirm: (question: string | RegExp, value: boolean): ScriptedAnswer => ({ kind: 'confirm', question, answer: value }),
  editor: (question: string | RegExp, value: string): ScriptedAnswer => ({ kind: 'editor', question, answer: value }),
  cancel: (kind: Kind, question: string | RegExp): ScriptedAnswer => ({ kind, question, answer: CANCEL }),
};

/**
 * A prompter that plays back a queue of answers. Any question that is not the
 * next expected one (wrong text or kind), asked after the queue ran out, or an
 * answer the prompt's own validation rejects, is recorded as a failure, which
 * {@link runInit} turns into a failed test. So are answers left unused.
 */
export function scriptedPrompter(script: ScriptedAnswer[]) {
  const queue = [...script];
  const failures: string[] = [];
  const asked: { kind: Kind; message: string; options?: string[]; initialValue?: string }[] = [];

  function next(
    kind: Kind,
    message: string,
    validate?: (value: string) => string | undefined,
    options?: string[],
    initialValue?: string,
  ): unknown {
    asked.push({ kind, message, ...(options ? { options } : {}), ...(initialValue !== undefined ? { initialValue } : {}) });
    const expected = queue.shift();
    const fail = (reason: string): never => {
      failures.push(reason);
      throw new Error(`Scripted prompter: ${reason}`);
    };
    if (!expected) return fail(`unanswered ${kind} question "${message}"`);
    const matches =
      typeof expected.question === 'string' ? message.includes(expected.question) : expected.question.test(message);
    if (!matches || expected.kind !== kind) {
      return fail(`unexpected ${kind} question "${message}" (expected ${expected.kind} matching ${String(expected.question)})`);
    }
    if (expected.answer === CANCEL) throw new WizardCancelledError();
    if (typeof expected.answer === 'string' && validate) {
      const error = validate(expected.answer);
      if (error) return fail(`answer "${expected.answer}" to "${message}" was rejected: ${error}`);
    }
    return expected.answer;
  }

  const prompter: Prompter = {
    async text(options) {
      const value = next('text', options.message, options.validate) as string;
      return value === '' && options.defaultValue !== undefined ? options.defaultValue : value;
    },
    async secret(options) {
      return next('secret', options.message, options.validate) as string;
    },
    async select(options) {
      const value = next(
        'select',
        options.message,
        undefined,
        options.options.map((option) => option.value),
        options.initialValue,
      ) as string;
      const option = options.options.find((candidate) => candidate.value === value);
      if (!option) {
        const reason = `"${value}" is not an option of "${options.message}" (${options.options.map((o) => o.value).join(', ')})`;
        failures.push(reason);
        throw new Error(`Scripted prompter: ${reason}`);
      }
      return option.value;
    },
    async confirm(options) {
      return next('confirm', options.message) as boolean;
    },
    async editor(options) {
      return next('editor', options.message) as string;
    },
  };

  return {
    prompter,
    asked,
    /** Problems with the script: unexpected, unanswered or rejected questions, and unused answers. */
    problems(): string[] {
      return [
        ...failures,
        ...queue.map((left) => `answer never asked for: ${left.kind} ${String(left.question)}`),
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Command runner

/** A runner that records requested commands and answers them with `respond` (exit code 0 by default). */
export function fakeRunner(respond: (request: CommandRequest) => Partial<CommandResult> = () => ({})) {
  const requests: CommandRequest[] = [];
  const runner: CommandRunner = {
    async run(request) {
      requests.push(request);
      return { exitCode: 0, stdout: '', stderr: '', ...respond(request) };
    },
  };
  return {
    runner,
    requests,
    /** Each requested command as a single line, e.g. `pnpm add @luzia/core`. */
    get commands() {
      return requests.map((request) => [request.command, ...request.args].join(' '));
    },
  };
}

// ---------------------------------------------------------------------------
// Chat model

/** A chat model that fails the run if called, for paths that must not call a model. */
export function unusedChatModel() {
  const fail = async (): Promise<never> => {
    throw new Error('The chat model was called.');
  };
  const model = new MockLanguageModelV4({ doGenerate: fail, doStream: fail });
  return {
    model,
    get calls() {
      return model.doGenerateCalls.length + model.doStreamCalls.length;
    },
  };
}

export type { CvFacts };

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/**
 * A chat model that drafts Cores from CVs: each call answers with the next of
 * `drafts` as structured output, or fails with it when it is an Error.
 */
export function cvDraftingModel(drafts: (CvFacts | Error)[]) {
  const queue = [...drafts];
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const next = queue.shift();
      if (!next) throw new Error('The drafting model was called more often than expected.');
      if (next instanceof Error) throw next;
      return {
        content: [{ type: 'text', text: JSON.stringify(next) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
  });
  return {
    model,
    /** Everything the model received on each call (instructions and prompt), as plain text. */
    get prompts() {
      return model.doGenerateCalls.map((call) =>
        call.prompt
          .map((message) =>
            typeof message.content === 'string'
              ? message.content
              : message.content.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : '')).join(''),
          )
          .join('\n'),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Embeddings model

/** A deterministic, offline embeddings model that records what it embedded. */
export function fakeEmbeddingModel() {
  const model = new MockEmbeddingModelV4({
    provider: 'fake',
    modelId: 'fake-embedding',
    doEmbed: async ({ values }) => ({ embeddings: values.map((value) => [value.length, 1]), warnings: [] }),
  });
  return {
    model,
    get embeddedValues() {
      return model.doEmbedCalls.flatMap((call) => call.values);
    },
  };
}

// ---------------------------------------------------------------------------
// Running the wizard

export interface RunInitOptions {
  answers: ScriptedAnswer[];
  runner?: ReturnType<typeof fakeRunner>;
  chatModel?: CliIo['chatModel'];
  /** The embeddings model `luzia build` uses; a deterministic offline fake by default. */
  embeddingModel?: CliIo['embeddingModel'];
  env?: Record<string, string | undefined>;
}

/** Runs `luzia init` in `cwd` as an Owner would, through `runCli`. Throws if the script did not match the questions. */
export async function runInit(cwd: string, options: RunInitOptions) {
  const out: string[] = [];
  const err: string[] = [];
  const prompter = scriptedPrompter(options.answers);
  const runner = options.runner ?? fakeRunner();
  const code = await runCli(['init'], {
    cwd,
    env: options.env ?? {},
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    prompter: prompter.prompter,
    runner: runner.runner,
    chatModel: options.chatModel ?? unusedChatModel().model,
    embeddingModel: options.embeddingModel ?? fakeEmbeddingModel().model,
  });
  const problems = prompter.problems();
  if (problems.length > 0) {
    throw new Error(
      `The wizard's questions did not match the script:\n- ${problems.join('\n- ')}\n\nOutput:\n${out.join('\n')}\n${err.join('\n')}`,
    );
  }
  return {
    code,
    /** Everything printed, stdout and stderr in order of each stream. */
    output: [...out, ...err].join('\n'),
    stdout: out.join('\n'),
    stderr: err.join('\n'),
    commands: runner.commands,
    requests: runner.requests,
    asked: prompter.asked,
  };
}

// ---------------------------------------------------------------------------
// Answers for each step of a full Next.js run. Each step of the wizard has its
// own helper, so adding a step means changing only its helper.

export const OWNER_KEYS = {
  anthropic: 'sk-ant-secret-1234567890',
  openai: 'sk-openai-secret-0987654321',
};

export interface ModelAnswers {
  chatProvider?: string;
  chatModel?: string;
  /** Typed in after choosing "Another model id" for chat. */
  customChatModel?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  keys?: ScriptedAnswer[];
}

/** Models and keys: Anthropic for chat, OpenAI for embeddings by default. */
export function modelAnswers(options: ModelAnswers = {}): ScriptedAnswer[] {
  return [
    answer.select(/chat provider/i, options.chatProvider ?? 'anthropic'),
    answer.select(/chat model/i, options.customChatModel ? '__other__' : (options.chatModel ?? 'claude-sonnet-5-5')),
    ...(options.customChatModel ? [answer.text(/model id/i, options.customChatModel)] : []),
    answer.select(/embeddings provider/i, options.embeddingProvider ?? 'openai'),
    answer.select(/embeddings model/i, options.embeddingModel ?? 'text-embedding-3-small'),
    ...(options.keys ?? [
      answer.secret('ANTHROPIC_API_KEY', OWNER_KEYS.anthropic),
      answer.secret('OPENAI_API_KEY', OWNER_KEYS.openai),
    ]),
    answer.confirm(/\.env\.local/, true),
  ];
}

/** How the Owner reviews the shown Core: `accept` saves it, `edit` opens it in the editor, `redo` writes it again. */
export function reviewAnswer(choice: 'accept' | 'edit' | 'redo'): ScriptedAnswer {
  return answer.select(/Save the Core/, choice);
}

/** Core from questions, then accepting it. */
export function coreAnswers(options: { review?: ScriptedAnswer[] } = {}): ScriptedAnswer[] {
  return [
    answer.select(/write your Core/, 'questions'),
    answer.text(/your name/i, 'Jamie Rivera'),
    answer.text(/summary/i, 'Full-stack developer with six years of experience building web products.'),
    answer.text(/highlights/i, 'Led the checkout rebuild at Shopwise; maintains an open-source form library.'),
    answer.text(/Visitors contact you/i, 'jamie.rivera@example.com'),
    answer.text(/other links/i, 'https://github.com/jamie-example'),
    answer.text(/role/i, 'A senior full-stack role'),
    answer.text(/available/i, 'From next month'),
    answer.select(/work mode/i, 'remote'),
    ...(options.review ?? [reviewAnswer('accept')]),
  ];
}

/**
 * Core drafted from the CV at `path`: consent, then the answers to the
 * essentials the draft is `missing`, then the review (accepted by default).
 */
export function cvAnswers(
  options: { path?: string; consent?: boolean; missing?: ScriptedAnswer[]; review?: ScriptedAnswer[] } = {},
): ScriptedAnswer[] {
  return [
    answer.select(/write your Core/, 'cv'),
    answer.text(/CV/, options.path ?? 'cv.pdf'),
    answer.confirm(/Send/, options.consent ?? true),
    ...(options.missing ?? []),
    ...(options.review ?? [reviewAnswer('accept')]),
  ];
}

export interface InstructionsAnswers {
  /** `range`, `call` (the default) or `decline`. */
  salary?: 'range' | 'call' | 'decline';
  /** Typed in after choosing `range`. */
  salaryRange?: string;
  /** Empty (the default) skips the topic. */
  availability?: string;
  /** Empty (the default) skips the topic. */
  relocation?: string;
  /** Empty (the default) adds nothing. */
  other?: string;
  save?: boolean;
}

/** Instructions: salary, availability, relocation and anything else, then saving them. */
export function instructionsAnswers(options: InstructionsAnswers = {}): ScriptedAnswer[] {
  const salary = options.salary ?? 'call';
  return [
    answer.select(/salary/i, salary),
    ...(salary === 'range' ? [answer.text(/salary range/i, options.salaryRange ?? '')] : []),
    answer.text(/availability/i, options.availability ?? ''),
    answer.text(/relocation/i, options.relocation ?? ''),
    answer.text(/anything else/i, options.other ?? ''),
    answer.confirm(/Save the Instructions/, options.save ?? true),
  ];
}

export interface WidgetAnswers {
  /** Replaces the proposed greeting and questions (each left out keeps the proposal). */
  edit?: { greeting?: string; questions?: [string?, string?, string?] };
  theme?: 'auto' | 'light' | 'dark';
  mode?: 'bubble' | 'inline';
}

/** Widget: keep the proposed greeting and questions (or edit them), then theme and mode. */
export function widgetAnswers(options: WidgetAnswers = {}): ScriptedAnswer[] {
  const edit = options.edit;
  return [
    answer.confirm(/Use this greeting and these questions/, !edit),
    ...(edit
      ? [
          answer.text(/Greeting/, edit.greeting ?? ''),
          ...[0, 1, 2].map((index) => answer.text(`Suggested question ${index + 1}`, edit.questions?.[index] ?? '')),
        ]
      : []),
    answer.select(/theme/i, options.theme ?? 'auto'),
    answer.select(/bubble|inline/i, options.mode ?? 'bubble'),
  ];
}

export interface IntegrationAnswers {
  /** Installing the packages and creating the route (and the default for the other two). */
  apply?: boolean;
  /** Adding the widget to the root layout; `null` when the layout isn't recognised, so nothing is asked. */
  layout?: boolean | null;
  /** Prefixing the `dev` and `build` scripts with `luzia build`; `null` when nothing would change. */
  scripts?: boolean | null;
}

/** Next.js integration: confirm the packages and route, the root layout change, and the scripts change. */
export function integrationAnswers(options: IntegrationAnswers = {}): ScriptedAnswer[] {
  const apply = options.apply ?? true;
  const layout = options.layout === undefined ? apply : options.layout;
  const scripts = options.scripts === undefined ? apply : options.scripts;
  return [
    answer.confirm(/Apply these changes/, apply),
    ...(layout === null ? [] : [answer.confirm(/Add the widget to/, layout)]),
    ...(scripts === null ? [] : [answer.confirm(/luzia build.*dev.*build/, scripts)]),
  ];
}

export interface StandaloneAnswers {
  /** Answers to the portfolio domains question, in order: each one rejected is asked again. */
  domains?: string[];
  /** The deployed server URL; empty (the default) means not deployed yet. */
  serverUrl?: string;
  /** Scaffolding the server and installing the packages. */
  apply?: boolean;
}

/** Standalone integration: portfolio domains, the server URL, then confirming the scaffold. */
export function standaloneAnswers(options: StandaloneAnswers = {}): ScriptedAnswer[] {
  return [
    ...(options.domains ?? ['jamie.example.com, https://www.jamie.example.com']).map((domains) =>
      answer.text(/portfolio.*domain/i, domains),
    ),
    answer.text(/server.*URL/i, options.serverUrl ?? ''),
    answer.confirm(/Set up the luzIA server/, options.apply ?? true),
  ];
}

export interface ProductionAnswers {
  /** Whether the project is linked to Vercel with the CLI installed; otherwise the step asks nothing. */
  linked?: boolean;
  /** Target environments: `production,preview` (default) or `production`. */
  environments?: 'production,preview' | 'production';
  /** The answer to the one upload confirmation. */
  upload?: boolean;
  /** The answer to replacing variables that already exist on Vercel, when asked. */
  replace?: boolean;
}

/** Production variables: nothing to answer unless the project is linked to Vercel. */
export function productionAnswers(options: ProductionAnswers = {}): ScriptedAnswer[] {
  if (!options.linked) return [];
  return [
    answer.select(/environments/i, options.environments ?? 'production,preview'),
    answer.confirm(/Upload .* to Vercel/, options.upload ?? true),
    ...(options.replace === undefined ? [] : [answer.confirm(/already exist/, options.replace)]),
  ];
}

// ---------------------------------------------------------------------------
// Re-run on a project where luzIA is already set up

/** The keys already saved in the existing setup's `.env.local`. */
export const EXISTING_KEYS = {
  anthropic: 'sk-ant-existing-1111111111',
  openai: 'sk-openai-existing-2222222222',
};

/** The Core of the existing setup (contact: `hello@jamie.dev`). */
export const EXISTING_CORE = `# Jamie Rivera

Full-stack developer building web products for ten years.

## Role sought

A staff engineering role.

- Availability: From June
- Work mode: Remote

## Contact

- Email: hello@jamie.dev (preferred)
- https://github.com/jamie-example
`;

export const EXISTING_INSTRUCTIONS =
  'If asked about salary or compensation, say Jamie Rivera prefers to discuss it on a call, and share the contact details.\n';

const EXISTING_LAYOUT = `import type { ReactNode } from 'react';
import { LuziaWidget } from '@luzia/react';

export const metadata = { title: 'Jamie Rivera' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <LuziaWidget
          endpoint="/api/luzia"
          contact="hello@jamie.dev"
          theme="dark"
          mode="bubble"
        />
      </body>
    </html>
  );
}
`;

const EXISTING_ROUTE = `import { createLuziaHandler, loadCompiledKnowledgeBase } from '@luzia/core';
import compiledKnowledgeBase from '../../../.luzia/knowledge-base.json';

const handler = createLuziaHandler({
  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),
});

export const POST = handler;
export const OPTIONS = handler;
`;

/** The files of a Next.js project where `luzia init` already ran (Anthropic chat, OpenAI embeddings). */
export const EXISTING_SETUP: Record<string, string> = {
  'knowledge-base/core.md': EXISTING_CORE,
  'knowledge-base/instructions.md': EXISTING_INSTRUCTIONS,
  'knowledge-base/projects.md': '# Projects\n\nShopwise checkout: rebuilt the checkout flow in React and Node.js.\n',
  '.env.local': [
    'DATABASE_URL=postgres://localhost/portfolio',
    '',
    '# luzIA: models and API keys (server-side only, never commit this file)',
    'LUZIA_CHAT_PROVIDER=anthropic',
    'LUZIA_CHAT_MODEL=claude-haiku-5-5',
    'LUZIA_EMBEDDING_PROVIDER=openai',
    'LUZIA_EMBEDDING_MODEL=text-embedding-3-small',
    `ANTHROPIC_API_KEY=${EXISTING_KEYS.anthropic}`,
    `OPENAI_API_KEY=${EXISTING_KEYS.openai}`,
    '',
  ].join('\n'),
  '.gitignore': 'node_modules/\n.env*.local\n.luzia/\n',
  'app/api/luzia/route.ts': EXISTING_ROUTE,
  'app/layout.tsx': EXISTING_LAYOUT,
  '.luzia/knowledge-base.json': '{"format":"stale","embeddingModel":"openai.embedding:text-embedding-3-small"}\n',
};

/** The Next.js fixture with an existing luzIA setup ({@link EXISTING_SETUP}), plus extra or replaced `files`. */
export async function existingSetupProject(files: Record<string, string | Uint8Array> = {}): Promise<string> {
  const cwd = await ownerProject('nextjs-app', { ...EXISTING_SETUP, ...files });
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  packageJson.scripts = { ...packageJson.scripts, dev: 'luzia build && next dev', build: 'luzia build && next build' };
  if (!('package.json' in files)) await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return cwd;
}

export type MenuChoice = 'models' | 'core' | 'instructions' | 'widget' | 'production' | 'done';

/** A choice in the re-run menu. */
export function menuAnswer(choice: MenuChoice): ScriptedAnswer {
  return answer.select(/What do you want to change/, choice);
}

/** A re-run: each section's choice followed by its answers, then "done". */
export function rerunAnswers(...sections: [MenuChoice, ScriptedAnswer[]][]): ScriptedAnswer[] {
  return [...sections.flatMap(([choice, answers]) => [menuAnswer(choice), ...answers]), menuAnswer('done')];
}

/** Every answer of a full run on the Next.js fixture, with any step's answers replaced. */
export function fullRunAnswers(
  overrides: Partial<Record<'models' | 'core' | 'instructions' | 'widget' | 'integration' | 'production', ScriptedAnswer[]>> = {},
): ScriptedAnswer[] {
  return [
    ...(overrides.models ?? modelAnswers()),
    ...(overrides.core ?? coreAnswers()),
    ...(overrides.instructions ?? instructionsAnswers()),
    ...(overrides.widget ?? widgetAnswers()),
    ...(overrides.integration ?? integrationAnswers()),
    ...(overrides.production ?? productionAnswers()),
  ];
}
