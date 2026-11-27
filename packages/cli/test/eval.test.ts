import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvalCommand, runCli } from '../src/index.ts';
import { createFakeModel, type FakeVerdict } from './support/fake-models.ts';

const coreFixtures = new URL('../../core/test/fixtures/', import.meta.url).pathname;

function captureIo(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { cwd, env: {}, stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) },
    out,
    err,
  };
}

/** An Owner's project: the fixture Knowledge Base compiled with `luzia build`, plus an eval file. */
async function ownerProject(evalFile: unknown) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-eval-'));
  expect(await runCli(['build', '--dir', path.join(coreFixtures, 'knowledge-base')], captureIo(cwd).io)).toBe(0);
  await writeFile(path.join(cwd, 'luzia.evals.json'), JSON.stringify(evalFile));
  return cwd;
}

const evalFile = {
  cases: [
    { question: 'How many years of experience does Ada have?', expectedFacts: ['eight years of experience'] },
    { name: 'salary trap', question: 'What is Ada’s salary?', trap: true },
  ],
};

const honestReplies = {
  'years of experience': 'Ada has eight years of experience building payment systems.',
  salary: "I don't have that information. You can reach Ada at ada@example.com.",
};

const fabricatedSalary = 'Ada expects a salary of 150,000 EUR per year.';

/** A judge that passes the honest answers above and fails anything else. */
function sensibleJudge(prompt: string): FakeVerdict {
  if (prompt.includes('ada@example.com') || prompt.includes('eight years of experience building')) {
    return { passed: true, reason: 'The answer is supported.' };
  }
  return { passed: false, reason: 'The answer states a salary that is not in the Knowledge Base.' };
}

describe('luzia eval', () => {
  it('reports every case as passed and exits zero when the Agent answers well', async () => {
    const cwd = await ownerProject(evalFile);
    const { io, out } = captureIo(cwd);
    const agent = createFakeModel({ replies: honestReplies });
    const judge = createFakeModel({ judge: sensibleJudge });

    const code = await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run([], io);

    expect(code).toBe(0);
    const report = out.join('\n');
    expect(report).toMatch(/PASS.*How many years of experience does Ada have\?/);
    expect(report).toMatch(/PASS.*salary trap: What is Ada’s salary\?/);
    expect(report).toContain('Ada has eight years of experience building payment systems.');
    expect(report).toContain('The answer is supported.');
    expect(report).toMatch(/2 passed, 0 failed/);
  });

  it('reports a fabricated answer to a trap question as failed, shows the answer and exits non-zero', async () => {
    const cwd = await ownerProject(evalFile);
    const { io, out } = captureIo(cwd);
    const agent = createFakeModel({ replies: { ...honestReplies, salary: fabricatedSalary } });
    const judge = createFakeModel({ judge: sensibleJudge });

    const code = await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run([], io);

    expect(code).toBe(1);
    const report = out.join('\n');
    expect(report).toMatch(/PASS.*How many years of experience/);
    expect(report).toMatch(/FAIL.*What is Ada’s salary\?/);
    expect(report).toContain(fabricatedSalary);
    expect(report).toContain('The answer states a salary that is not in the Knowledge Base.');
    expect(report).toMatch(/1 passed, 1 failed/);

    const trapGrading = judge.judgePrompts.find((prompt) => prompt.includes('What is Ada’s salary?'));
    expect(trapGrading).toContain(fabricatedSalary);
    expect(trapGrading).toMatch(/trap question/i);
  });

  it('marks a case whose reply breaks off mid-stream as failed and runs the remaining cases', async () => {
    const cwd = await ownerProject(evalFile);
    const { io, out } = captureIo(cwd);
    const agent = createFakeModel({ replies: honestReplies, breakOn: ['years of experience'] });
    const judge = createFakeModel({ judge: sensibleJudge });

    const code = await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run([], io);

    expect(code).toBe(1);
    const report = out.join('\n');
    expect(report).toMatch(/FAIL.*How many years of experience does Ada have\?/);
    expect(report).toMatch(/reply broke off/i);
    expect(report).toMatch(/PASS.*salary trap: What is Ada’s salary\?/);
    expect(report).toMatch(/1 passed, 1 failed/);
    expect(judge.judgePrompts).toHaveLength(1);
  });

  it('gives the judge the question, the actual answer and the expected facts', async () => {
    const cwd = await ownerProject(evalFile);
    const agent = createFakeModel({ replies: honestReplies });
    const judge = createFakeModel({ judge: sensibleJudge });

    await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run([], captureIo(cwd).io);

    const factsGrading = judge.judgePrompts.find((prompt) => prompt.includes('How many years of experience'));
    expect(factsGrading).toContain('- eight years of experience');
    expect(factsGrading).toContain('Ada has eight years of experience building payment systems.');
  });

  it('asks each question through the handler, with the Knowledge Base reaching the Agent', async () => {
    const cwd = await ownerProject(evalFile);
    const agent = createFakeModel({ replies: honestReplies });
    const judge = createFakeModel({ judge: sensibleJudge });

    await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run([], captureIo(cwd).io);

    expect(agent.model.doStreamCalls).toHaveLength(2);
    const system = agent.model.doStreamCalls[0]!.prompt.find((message) => message.role === 'system');
    expect(system?.content).toContain('eight years of experience building payment systems');
  });

  it('judges with the Agent’s chat model when no judge is given', async () => {
    const cwd = await ownerProject(evalFile);
    const { io } = captureIo(cwd);
    const model = createFakeModel({ replies: honestReplies, judge: sensibleJudge });

    const code = await createEvalCommand({ chat: { model: model.model } }).run([], io);

    expect(code).toBe(0);
    expect(model.judgePrompts).toHaveLength(2);
  });

  it('reads the eval file and compiled Knowledge Base from --file and --kb', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-eval-'));
    await mkdir(path.join(cwd, 'evals'));
    await writeFile(path.join(cwd, 'evals/portfolio.json'), JSON.stringify(evalFile));
    await runCli(['build', '--dir', path.join(coreFixtures, 'knowledge-base'), '--out', 'kb.json'], captureIo(cwd).io);
    const { io, out } = captureIo(cwd);
    const agent = createFakeModel({ replies: honestReplies });
    const judge = createFakeModel({ judge: sensibleJudge });

    const code = await createEvalCommand({ chat: { model: agent.model }, judge: judge.model }).run(
      ['--file', 'evals/portfolio.json', '--kb', 'kb.json'],
      io,
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/2 passed/);
  });

  it('runs the example portfolio’s eval file', async () => {
    const example = new URL('../../../examples/nextjs/', import.meta.url).pathname;
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-eval-'));
    await runCli(['build', '--dir', path.join(example, 'knowledge-base')], captureIo(cwd).io);
    const { io, out } = captureIo(cwd);
    const model = createFakeModel({ judge: () => ({ passed: true, reason: 'ok' }) });

    const code = await createEvalCommand({ chat: { model: model.model } }).run(
      ['--file', path.join(example, 'luzia.evals.json')],
      io,
    );

    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/5 passed, 0 failed/);
  });

  it('rejects a case that has neither expected facts nor a trap flag', async () => {
    const cwd = await ownerProject({ cases: [{ question: 'Where does Ada live?' }] });
    const { io, err } = captureIo(cwd);

    const code = await runCli(['eval'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/Invalid eval file/);
    expect(err.join('\n')).toMatch(/expectedFacts/);
  });

  it('explains how to compile the Knowledge Base when the artifact is missing', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'luzia-eval-'));
    await writeFile(path.join(cwd, 'luzia.evals.json'), JSON.stringify(evalFile));
    const { io, err } = captureIo(cwd);

    const code = await runCli(['eval'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/luzia build/);
  });

  it('uses the Owner’s configured chat model by default', async () => {
    const cwd = await ownerProject(evalFile);
    const { io, err } = captureIo(cwd);

    const code = await runCli(['eval'], io);

    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/LUZIA_CHAT_PROVIDER/);
  });
});
