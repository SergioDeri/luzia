import { describe, expect, it } from 'vitest';
import {
  fullRunAnswers,
  instructionsAnswers,
  ownerProject,
  readProjectFile,
  runInit,
  unusedChatModel,
} from './support/init-harness.ts';

const INSTRUCTIONS_PATH = 'knowledge-base/instructions.md';

describe('luzia init: Instructions', () => {
  it('tells the Agent to suggest a call about salary, with no model call', async () => {
    const cwd = await ownerProject('nextjs-app');
    const chatModel = unusedChatModel();

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ instructions: instructionsAnswers({ salary: 'call' }) }),
      chatModel: chatModel.model,
    });

    expect(run.code).toBe(0);
    const instructions = await readProjectFile(cwd, INSTRUCTIONS_PATH);
    expect(instructions).toContain(
      'If asked about salary or compensation, say Jamie Rivera prefers to discuss it on a call, and share the contact details.',
    );
    expect(chatModel.calls).toBe(0);
  });

  it('gives the salary range the Owner types', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        instructions: instructionsAnswers({ salary: 'range', salaryRange: '€70,000–€85,000 a year.' }),
      }),
    });

    expect(run.code).toBe(0);
    const instructions = await readProjectFile(cwd, INSTRUCTIONS_PATH);
    expect(instructions).toContain(
      'If asked about salary or compensation, say Jamie Rivera is looking for €70,000–€85,000 a year. Add that the final figure depends on the role and the full package',
    );
    expect(instructions).not.toMatch(/on a call/);
  });

  it('tells the Agent not to discuss salary', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ instructions: instructionsAnswers({ salary: 'decline' }) }),
    });

    expect(run.code).toBe(0);
    const instructions = await readProjectFile(cwd, INSTRUCTIONS_PATH);
    expect(instructions).toMatch(/^Do not discuss salary or compensation, and do not guess at figures\./);
    expect(instructions).toContain('suggest contacting Jamie Rivera directly.');
    expect(instructions).not.toMatch(/range|on a call/);
  });

  it('includes availability, relocation and free-form guidance', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({
        instructions: instructionsAnswers({
          availability: 'Say Jamie can start two weeks after an offer',
          relocation: 'Say Jamie is open to relocating within the EU, but prefers remote work.',
          other: "Don't name Jamie's current employer; say it is under NDA",
        }),
      }),
    });

    expect(run.code).toBe(0);
    expect(await readProjectFile(cwd, INSTRUCTIONS_PATH)).toBe(
      [
        'If asked about salary or compensation, say Jamie Rivera prefers to discuss it on a call, and share the contact details.',
        "When asked about Jamie Rivera's availability or start date, follow this guidance: Say Jamie can start two weeks after an offer.",
        'When asked whether Jamie Rivera would relocate, follow this guidance: Say Jamie is open to relocating within the EU, but prefers remote work.',
        "Don't name Jamie's current employer; say it is under NDA.",
      ].join('\n\n') + '\n',
    );
  });

  it('leaves skipped topics out', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ instructions: instructionsAnswers({ relocation: 'Say Jamie would relocate to Berlin' }) }),
    });

    expect(run.code).toBe(0);
    const instructions = await readProjectFile(cwd, INSTRUCTIONS_PATH);
    expect(instructions).toContain('relocate');
    expect(instructions).not.toMatch(/availability|start date/);
    expect(instructions.split('\n\n')).toHaveLength(2);
  });

  it('shows the Instructions before saving and compiles them into the Knowledge Base', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, { answers: fullRunAnswers() });

    const shown = run.stdout.indexOf('Your Instructions (knowledge-base/instructions.md):');
    expect(shown).toBeGreaterThan(-1);
    expect(run.stdout.slice(shown)).toMatch(
      /^Your Instructions[^\n]*\n\n {2}If asked about salary or compensation, say Jamie Rivera prefers to discuss it on a call[\s\S]*Create knowledge-base\/instructions\.md/,
    );
    const artifact = JSON.parse(await readProjectFile(cwd, '.luzia/knowledge-base.json'));
    expect(artifact.instructions.text).toContain('prefers to discuss it on a call');
    const summary = run.stdout.slice(run.stdout.lastIndexOf('Summary'));
    expect(summary).toContain(INSTRUCTIONS_PATH);
  });

  it('shows the diff of existing Instructions and leaves them untouched when the Owner declines', async () => {
    const existing = 'If asked about salary, say Jamie prefers not to say.\n';
    const cwd = await ownerProject('nextjs-app', { [INSTRUCTIONS_PATH]: existing });

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ instructions: instructionsAnswers({ salary: 'decline', save: false }) }),
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(
      /Update knowledge-base\/instructions\.md:[\s\S]*- If asked about salary, say Jamie prefers not to say\.[\s\S]*\+ Do not discuss salary/,
    );
    expect(await readProjectFile(cwd, INSTRUCTIONS_PATH)).toBe(existing);
  });
});
