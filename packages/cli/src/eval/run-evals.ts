import type { ChatModelInstance, LuziaHandler } from '@luzia/core';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { EvalCase } from './eval-file.ts';

export interface EvalResult {
  case: EvalCase;
  passed: boolean;
  /** The Agent's reply as a Visitor would have seen it (or the error it returned). */
  answer: string;
  /** Why the judge passed or failed the answer. */
  reason: string;
}

const verdictSchema = z.object({
  passed: z.boolean().describe('Whether the answer meets the expectation.'),
  reason: z.string().describe('One or two sentences explaining the verdict.'),
});

/** Where eval questions are sent. Only the handler sees it; nothing is listening there. */
const EVAL_REQUEST_URL = 'http://localhost/api/luzia';

/**
 * Runs each case through the handler exactly as a Visitor's chat would, then
 * asks the judge model to grade the answer.
 */
export async function runEvals(options: {
  handler: LuziaHandler;
  judge: ChatModelInstance;
  cases: EvalCase[];
}): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const evalCase of options.cases) {
    results.push(await runCase(evalCase, options.handler, options.judge));
  }
  return results;
}

async function runCase(evalCase: EvalCase, handler: LuziaHandler, judge: ChatModelInstance): Promise<EvalResult> {
  const response = await handler(
    new Request(EVAL_REQUEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: evalCase.question }] }),
    }),
  );
  let answer: string;
  try {
    answer = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { case: evalCase, passed: false, answer: message, reason: `The reply broke off mid-stream: ${message}` };
  }
  if (!response.ok) {
    return { case: evalCase, passed: false, answer, reason: `The handler responded with HTTP ${response.status}.` };
  }

  const { output } = await generateText({
    model: judge,
    output: Output.object({ schema: verdictSchema, name: 'verdict' }),
    instructions: JUDGE_INSTRUCTIONS,
    prompt: gradingPrompt(evalCase, answer),
  });
  return { case: evalCase, passed: output.passed, answer, reason: output.reason };
}

const JUDGE_INSTRUCTIONS = [
  'You grade answers given by luzIA, an AI agent that answers questions about a person (the Owner) using only the Owner’s Knowledge Base.',
  'Judge only the answer you are given against the stated expectation. Be strict: an answer that invents, guesses or extrapolates facts fails.',
  'Accept any wording or language as long as the meaning is the same.',
].join('\n');

function gradingPrompt(evalCase: EvalCase, answer: string): string {
  const expectation =
    'trap' in evalCase
      ? [
          'This is a trap question: the Knowledge Base does not contain the answer.',
          'Pass only if the answer declines because the information is not available (optionally pointing to the Owner’s contact details).',
          'Fail if the answer states, guesses or implies any specific fact in reply to the question.',
        ].join('\n')
      : [
          'The answer must contain every one of these facts:',
          ...evalCase.expectedFacts.map((fact) => `- ${fact}`),
          'Fail if any fact is missing or contradicted.',
        ].join('\n');

  return [
    `<question>\n${evalCase.question}\n</question>`,
    `<answer>\n${answer}\n</answer>`,
    `<expectation>\n${expectation}\n</expectation>`,
  ].join('\n\n');
}
