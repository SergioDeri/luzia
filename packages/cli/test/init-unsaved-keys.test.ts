import { describe, expect, it } from 'vitest';
import { createWizardContext } from '../src/init/context.ts';
import { detectProject } from '../src/init/project.ts';
import { modelsStep } from '../src/init/steps/models.ts';
import {
  fakeRunner,
  modelAnswers,
  OWNER_KEYS,
  ownerProject,
  projectFileExists,
  scriptedPrompter,
} from './support/init-harness.ts';

// The seam tests inject a fake chat model, so they never resolve the Owner's
// real one from their keys; this checks that resolution directly.
describe('luzia init: keys the Owner chose not to save', () => {
  it('are still used for the rest of this run (e.g. drafting the Core), but never written', async () => {
    const cwd = await ownerProject('nextjs-app');
    const prompter = scriptedPrompter(modelAnswers({ save: false }));
    const io = {
      cwd,
      env: {},
      stdout: () => {},
      stderr: () => {},
      prompter: prompter.prompter,
      runner: fakeRunner().runner,
    };
    const context = createWizardContext(io, await detectProject(cwd));

    await modelsStep.run(context);

    expect(prompter.problems()).toEqual([]);
    expect(await projectFileExists(cwd, '.env.local')).toBe(false);
    expect(context.projectEnv().ANTHROPIC_API_KEY).toBe(OWNER_KEYS.anthropic);
    await expect(context.chatModel()).resolves.toBeDefined();
    // Not saved, so not offered for upload to the hosting provider either.
    expect(context.state.envValues).toEqual({});
  });
});
