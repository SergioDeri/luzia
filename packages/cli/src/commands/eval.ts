import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  createLuziaHandler,
  resolveChatModel,
  type ChatModelConfig,
  type ChatModelInstance,
  type LuziaHandlerConfig,
} from 'luzia-core';
import type { CliCommand, CliIo } from '../command.ts';
import { readEvalFile } from '../eval/eval-file.ts';
import { runEvals, type EvalResult } from '../eval/run-evals.ts';
import { DEFAULT_ARTIFACT_PATH } from './build.ts';

export const DEFAULT_EVAL_FILE = 'luzia.evals.json';

export interface EvalCommandOptions {
  /** The Agent's chat model. Defaults to the Owner's configuration (LUZIA_CHAT_PROVIDER / LUZIA_CHAT_MODEL). */
  chat?: ChatModelConfig;
  /** The model that grades answers. Defaults to the Agent's chat model. */
  judge?: ChatModelInstance;
  /** Further handler settings, so evals run against the same setup Visitors get. */
  handler?: Omit<LuziaHandlerConfig, 'knowledgeBase' | 'chat' | 'env'>;
}

const usage = [
  `luzia eval [--file <evals.json>] [--kb <knowledge-base.json>]   (defaults: ${DEFAULT_EVAL_FILE}, ${DEFAULT_ARTIFACT_PATH})`,
  '           Eval file (JSON): { "cases": [',
  '             { "question": "Where does Ada work?", "expectedFacts": ["Works at Acme"] },',
  '             { "question": "What is Ada’s blood type?", "trap": true } ] }',
  '           "expectedFacts": facts the answer must contain. "trap": the answer is not in the',
  '           Knowledge Base and the Agent must decline. Optional "name" per case. Uses the configured',
  '           chat model for both answering and judging; exits non-zero if any case fails.',
].join('\n');

/** Creates `luzia eval`. Models can be injected; otherwise the Owner's configured chat model is used. */
export function createEvalCommand(options: EvalCommandOptions = {}): CliCommand {
  return {
    summary: 'Ask the Agent the questions in an eval file and grade its answers with an LLM judge.',
    usage,
    async run(args, io) {
      const { values } = parseArgs({
        args,
        options: {
          file: { type: 'string', default: DEFAULT_EVAL_FILE },
          kb: { type: 'string', default: DEFAULT_ARTIFACT_PATH },
        },
      });
      const env = io.env ?? process.env;
      const evalFile = await readEvalFile(path.resolve(io.cwd, values.file));
      const knowledgeBase = await readKnowledgeBaseArtifact(path.resolve(io.cwd, values.kb));

      const handler = createLuziaHandler({ ...options.handler, knowledgeBase, chat: options.chat, env });
      const judge = options.judge ?? resolveChatModel(options.chat, env);

      const results = await runEvals({ handler, judge, cases: evalFile.cases });
      printReport(results, io);
      return results.every((result) => result.passed) ? 0 : 1;
    },
  };
}

async function readKnowledgeBaseArtifact(file: string): Promise<LuziaHandlerConfig['knowledgeBase']> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the compiled Knowledge Base at ${file} (run \`luzia build\` first): ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

function printReport(results: EvalResult[], io: CliIo): void {
  results.forEach((result, index) => {
    const label = result.case.name ? `${result.case.name}: ${result.case.question}` : result.case.question;
    io.stdout(`${result.passed ? 'PASS' : 'FAIL'}  ${index + 1}. ${label}`);
    io.stdout(indent('Answer: ', result.answer));
    io.stdout(indent('Judge:  ', result.reason));
    io.stdout('');
  });
  const failed = results.filter((result) => !result.passed).length;
  io.stdout(`${results.length - failed} passed, ${failed} failed (${results.length} cases)`);
}

function indent(label: string, text: string): string {
  const pad = ' '.repeat(6);
  return text
    .trim()
    .split('\n')
    .map((line, i) => (i === 0 ? `${pad}${label}${line}` : `${pad}${' '.repeat(label.length)}${line}`))
    .join('\n');
}
