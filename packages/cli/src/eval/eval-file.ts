import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const factsCaseSchema = z.strictObject({
  name: z.string().min(1).optional(),
  question: z.string().min(1),
  /** Facts the Agent's answer must contain (in any wording or language). */
  expectedFacts: z.array(z.string().min(1)).min(1),
});

const trapCaseSchema = z.strictObject({
  name: z.string().min(1).optional(),
  question: z.string().min(1),
  /** The answer is not in the Knowledge Base: the Agent must decline rather than invent one. */
  trap: z.literal(true),
});

const evalCaseSchema = z.union([factsCaseSchema, trapCaseSchema], {
  error: 'Each case needs a "question" and either "expectedFacts" (a non-empty list) or "trap": true.',
});

export const evalFileSchema = z.strictObject({
  cases: z.array(evalCaseSchema).min(1),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalFile = z.infer<typeof evalFileSchema>;

export async function readEvalFile(file: string): Promise<EvalFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read eval file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = evalFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid eval file ${file}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
