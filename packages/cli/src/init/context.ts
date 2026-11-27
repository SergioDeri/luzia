import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveChatModel, type ChatModelInstance, type ChatProvider, type EmbeddingProvider } from '@luzia/core';
import type { CliIo } from '../command.ts';
import type { CommandRequest, CommandRunner } from './command-runner.ts';
import { isDotenvFile, lineDiff, maskDotenv } from './diff.ts';
import type { ProjectInfo } from './project.ts';
import type { Prompter } from './prompter.ts';

/** The CLI `io` as `luzia init` needs it: a prompter (interactive terminal) and a command runner are required. */
export type WizardIo = CliIo & { prompter: Prompter; runner: CommandRunner };

/** The Owner's model choices. */
export interface ModelChoices {
  chat: { provider: ChatProvider; model: string };
  embedding: { provider: EmbeddingProvider; model: string };
}

/** A Core ready to be saved, and what later steps need from it. */
export interface CoreDraft {
  /** Markdown saved as `knowledge-base/core.md`. */
  text: string;
  /** The Owner's name as the Core states it. */
  ownerName: string;
  /** How Visitors should contact the Owner (email or URL); the widget's contact is taken from here. */
  contact: string;
  /** Further files the source adds to the Knowledge Base (e.g. the CV PDF). */
  files?: FileWrite[];
  /**
   * Set when the chat model drafted the Core, so the Owner already agreed to
   * send their details to it: the widget step then also asks it for a greeting
   * and suggested questions. Otherwise the widget starts from fixed defaults.
   */
  drafted?: boolean;
}

/** Widget options (filled in by the widget step). */
export interface WidgetOptions {
  contact: string;
  greeting?: string;
  suggestedQuestions?: string[];
  theme?: 'auto' | 'light' | 'dark';
  mode?: 'bubble' | 'inline';
  /** Image URL for the chat header (as the browser loads it); luzIA's icon when unset. */
  avatar?: string;
}

/** Everything the steps have learned so far, shared between steps. */
export interface WizardState {
  project: ProjectInfo;
  models?: ModelChoices;
  /** luzIA variables for `.env.local` (secrets included), by name. */
  envValues: Record<string, string>;
  /**
   * Settings the Owner typed but chose not to save to `.env.local`: used for
   * the rest of this run (e.g. drafting the Core), never written or uploaded.
   */
  unsavedEnv?: Record<string, string>;
  core?: CoreDraft;
  /** Instructions markdown (filled in by the Instructions step). */
  instructions?: string;
  widget?: WidgetOptions;
  /** Path of the chat endpoint the widget calls, e.g. `/api/luzia`. */
  endpoint?: string;
}

/** A file a step wants to create or replace, relative to the project. */
export interface FileWrite {
  path: string;
  /**
   * The complete new content: text, or bytes for a binary file (e.g. a PDF,
   * shown without a diff). A file whose content would not change is left out of the plan.
   */
  content: string | Uint8Array;
}

/** An external command a step wants to run. */
export interface PlannedCommand {
  command: string;
  args: string[];
  /** Shown if the command fails, e.g. "Install the packages yourself: pnpm add …". */
  fallback?: string;
  stream?: boolean;
  input?: string;
}

/** What has been done so far, for the final summary (also shown on cancel). */
export interface ChangeLog {
  created: string[];
  updated: string[];
  commands: string[];
  /** Things the Owner still has to do by hand (e.g. a declined change, a failed command). */
  todo: string[];
  /** Extra next steps for the summary (the defaults are added by the wizard). */
  next: string[];
  /** Set when something the setup needs failed (e.g. the build); the command then exits non-zero. */
  failed: boolean;
}

export interface WizardContext {
  readonly cwd: string;
  readonly io: WizardIo;
  readonly prompter: Prompter;
  /** The Owner's environment (variables already set), without the wizard's changes. */
  readonly env: Record<string, string | undefined>;
  readonly state: WizardState;
  readonly changes: ChangeLog;
  /** Prints a line; any secret the Owner entered is masked. */
  say(line?: string): void;
  /** Prints a warning line on stderr; secrets masked. */
  warn(line: string): void;
  /** Registers a value that must never be printed (an API key). */
  addSecret(value: string): void;
  /** Masks every registered secret in `text`. */
  redact(text: string): string;
  /** The environment with the wizard's `.env.local` values applied, as the build and server will see it. */
  projectEnv(): Record<string, string | undefined>;
  /** The chat model to draft with: the injected one, or the Owner's choice with their key. */
  chatModel(): Promise<ChatModelInstance>;
  /** Reads a project file, `null` if it doesn't exist. */
  readFile(file: string): Promise<string | null>;
  /**
   * The single way steps change the project. Shows every file to create, the
   * diff of every existing file that changes, and every command, then asks
   * `question`. Only after a yes are files written and then commands run.
   * Resolves to `false` (nothing touched) when the Owner says no or there was
   * nothing to do.
   */
  apply(plan: { files?: FileWrite[]; commands?: PlannedCommand[] }, question: string | ApplyConfirmed): Promise<boolean>;
}

/**
 * Passed to {@link WizardContext.apply} instead of a question when the Owner
 * has already approved this exact change (e.g. accepted the Core shown in
 * full): the change is still listed, then made without asking again.
 */
export const ALREADY_CONFIRMED = Symbol('already confirmed');
export type ApplyConfirmed = typeof ALREADY_CONFIRMED;

export function createWizardContext(io: WizardIo, project: ProjectInfo): WizardContext {
  const secrets = new Set<string>();
  const env = io.env ?? process.env;
  const state: WizardState = { project, envValues: {} };
  const changes: ChangeLog = { created: [], updated: [], commands: [], todo: [], next: [], failed: false };

  const redact = (text: string) => {
    let masked = text;
    for (const secret of secrets) masked = masked.split(secret).join('<hidden>');
    return masked;
  };
  const resolve = (file: string) => path.join(io.cwd, file);
  const readProjectFile = async (file: string) =>
    existsSync(resolve(file)) ? readFile(resolve(file), 'utf8') : null;

  const context: WizardContext = {
    cwd: io.cwd,
    io,
    prompter: io.prompter,
    env,
    state,
    changes,
    say: (line = '') => io.stdout(redact(line)),
    warn: (line) => io.stderr(redact(line)),
    addSecret: (value) => {
      if (value) secrets.add(value);
    },
    redact,
    projectEnv: () => ({ ...env, ...state.unsavedEnv, ...state.envValues }),
    async chatModel() {
      if (io.chatModel) return io.chatModel;
      if (!state.models) throw new Error('No chat model chosen yet.');
      return resolveChatModel({ provider: state.models.chat.provider, model: state.models.chat.model }, context.projectEnv());
    },
    readFile: readProjectFile,
    async apply(plan, question) {
      const files: (FileWrite & { before: string | null })[] = [];
      for (const file of plan.files ?? []) {
        if (typeof file.content === 'string') {
          const before = await readProjectFile(file.path);
          if (before !== file.content) files.push({ ...file, before });
        } else {
          const before = existsSync(resolve(file.path)) ? await readFile(resolve(file.path)) : null;
          if (!before?.equals(file.content)) files.push({ ...file, before: before && '' });
        }
      }
      const commands = plan.commands ?? [];
      if (files.length === 0 && commands.length === 0) return false;

      for (const file of files) {
        if (file.before === null) {
          context.say(`  Create ${file.path}`);
        } else if (typeof file.content !== 'string') {
          context.say(`  Replace ${file.path}`);
        } else {
          context.say(`  Update ${file.path}:`);
          const shown = isDotenvFile(file.path)
            ? lineDiff(maskDotenv(file.before), maskDotenv(file.content, file.before))
            : lineDiff(file.before, file.content);
          for (const line of shown) context.say(`    ${line}`);
        }
      }
      for (const command of commands) context.say(`  Run ${commandLine(command)}`);

      if (question !== ALREADY_CONFIRMED && !(await io.prompter.confirm({ message: question, initialValue: true }))) {
        context.say('  Left unchanged.');
        return false;
      }

      for (const file of files) {
        await mkdir(path.dirname(resolve(file.path)), { recursive: true });
        await writeFile(resolve(file.path), file.content);
        (file.before === null ? changes.created : changes.updated).push(file.path);
      }
      for (const command of commands) {
        context.say(`Running ${commandLine(command)}…`);
        const request: CommandRequest = { command: command.command, args: command.args, cwd: io.cwd };
        if (command.input !== undefined) request.input = command.input;
        if (command.stream) request.stream = true;
        const result = await io.runner.run(request);
        if (result.exitCode === 0) {
          changes.commands.push(commandLine(command));
        } else {
          context.warn(`${commandLine(command)} failed (exit code ${result.exitCode}).`);
          const details = result.stderr.trim().split('\n').slice(-5).join('\n');
          if (details) context.warn(details);
          changes.todo.push(command.fallback ?? `Run ${commandLine(command)}`);
        }
      }
      return true;
    },
  };
  return context;
}

function commandLine(command: { command: string; args: string[] }): string {
  return [command.command, ...command.args].join(' ');
}
