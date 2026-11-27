import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { runCli, type CliIo } from '../../src/index.ts';
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
  files: Record<string, string> = {},
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
  const asked: { kind: Kind; message: string; options?: string[] }[] = [];

  function next(
    kind: Kind,
    message: string,
    validate?: (value: string) => string | undefined,
    options?: string[],
  ): unknown {
    asked.push(options ? { kind, message, options } : { kind, message });
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

// ---------------------------------------------------------------------------
// Running the wizard

export interface RunInitOptions {
  answers: ScriptedAnswer[];
  runner?: ReturnType<typeof fakeRunner>;
  chatModel?: CliIo['chatModel'];
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

/** Core from questions, then saving it. */
export function coreAnswers(options: { save?: boolean } = {}): ScriptedAnswer[] {
  return [
    answer.text(/your name/i, 'Jamie Rivera'),
    answer.text(/summary/i, 'Full-stack developer with six years of experience building web products.'),
    answer.text(/highlights/i, 'Led the checkout rebuild at Shopwise; maintains an open-source form library.'),
    answer.text(/Visitors contact you/i, 'jamie.rivera@example.com'),
    answer.text(/other links/i, 'https://github.com/jamie-example'),
    answer.text(/role/i, 'A senior full-stack role'),
    answer.text(/available/i, 'From next month'),
    answer.select(/work mode/i, 'remote'),
    answer.confirm(/Save the Core/, options.save ?? true),
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

/** Widget: no questions yet. */
export function widgetAnswers(): ScriptedAnswer[] {
  return [];
}

/** Next.js integration: confirm installing packages and creating the route. */
export function integrationAnswers(options: { apply?: boolean } = {}): ScriptedAnswer[] {
  return [answer.confirm(/Apply these changes/, options.apply ?? true)];
}

/** Production variables: no questions yet. */
export function productionAnswers(): ScriptedAnswer[] {
  return [];
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
