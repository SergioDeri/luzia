import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandResult } from '../command-runner.ts';
import type { WizardContext } from '../context.ts';
import type { WizardStep } from '../step.ts';
import { ENV_FILE } from './models.ts';

type Environment = 'production' | 'preview';
type EnvironmentChoice = 'production,preview' | 'production';

/** Files the Vercel CLI writes when a folder is linked to a project (`vercel link`, `vercel link --repo`). */
const VERCEL_LINK_FILES = ['.vercel/project.json', '.vercel/repo.json'];

/**
 * Production variables: upload the luzIA variables to a linked Vercel
 * project with `vercel env add`, after one confirmation; otherwise list the
 * variable names and where each value comes from, for the hosting dashboard.
 * Values go to the command's standard input only: never in its arguments and
 * never printed.
 */
export const productionStep: WizardStep = {
  id: 'production',
  title: 'Production variables',
  applies: (context) => Object.keys(context.state.envValues).length > 0,
  notApplicableMessage: `There are no luzIA variables in ${ENV_FILE} to set for production yet.`,
  async run(context) {
    if (!isLinkedToVercel(context.cwd)) {
      printVariables(context);
      context.changes.next.push('To upload the variables from here next time, link the project with vercel link and run luzia init again.');
      return;
    }
    if (!(await vercelCliAvailable(context))) {
      context.say('This project is linked to Vercel, but the Vercel CLI was not found.');
      printVariables(context);
      context.changes.next.push('Install the Vercel CLI (npm i -g vercel) to upload the variables with luzia init.');
      return;
    }
    await uploadToVercel(context);
  },
};

function isLinkedToVercel(cwd: string): boolean {
  return VERCEL_LINK_FILES.some((file) => existsSync(path.join(cwd, file)));
}

async function vercelCliAvailable(context: WizardContext): Promise<boolean> {
  const result = await context.io.runner.run({ command: 'vercel', args: ['--version'], cwd: context.cwd });
  return result.exitCode === 0;
}

async function uploadToVercel(context: WizardContext): Promise<void> {
  const names = Object.keys(context.state.envValues);
  context.say(`This project is linked to Vercel. luzIA variables (values from ${ENV_FILE}, not shown):`);
  for (const name of names) context.say(`  ${name}`);

  const choice = await context.prompter.select<EnvironmentChoice>({
    message: 'Which Vercel environments should get these variables?',
    options: [
      { value: 'production,preview', label: 'Production and Preview', hint: 'preview deployments answer too' },
      { value: 'production', label: 'Production only' },
    ],
    initialValue: 'production,preview',
  });
  const environments = choice.split(',') as Environment[];

  const confirmed = await context.prompter.confirm({
    message: `Upload these ${names.length} variables to Vercel (${environments.join(', ')}) with vercel env add?`,
    initialValue: true,
  });
  if (!confirmed) {
    context.say('Nothing was uploaded.');
    printVariables(context);
    return;
  }

  const existing: { name: string; environment: Environment }[] = [];
  for (const name of names) {
    for (const environment of environments) {
      const result = await addVariable(context, name, environment, false);
      if (result.exitCode === 0) continue;
      if (alreadyExists(result)) existing.push({ name, environment });
      else reportFailure(context, name, environment, result);
    }
  }
  if (existing.length === 0) return;

  context.say('These variables already exist on Vercel:');
  for (const { name, environment } of existing) context.say(`  ${name} (${environment})`);
  const replace = await context.prompter.confirm({
    message: `${existing.length === 1 ? 'It already exists' : 'They already exist'} on Vercel. Replace with the values from ${ENV_FILE}?`,
    initialValue: false,
  });
  if (!replace) {
    context.say('Kept the existing values on Vercel.');
    context.changes.next.push(
      `Check the variables kept on Vercel still match ${ENV_FILE}: ${existing.map(({ name, environment }) => `${name} (${environment})`).join(', ')}.`,
    );
    return;
  }
  for (const { name, environment } of existing) {
    const result = await addVariable(context, name, environment, true);
    if (result.exitCode !== 0) reportFailure(context, name, environment, result);
  }
}

/**
 * `vercel env add NAME --environment ENV --yes [--sensitive] [--force]`, with the
 * value on standard input (never in the arguments). `--yes` keeps it
 * non-interactive (a Preview variable applies to every branch instead of
 * prompting for one); API keys are stored as sensitive, luzIA's own settings
 * stay readable.
 */
async function addVariable(context: WizardContext, name: string, environment: Environment, force: boolean): Promise<CommandResult> {
  const args = [
    'env',
    'add',
    name,
    '--environment',
    environment,
    '--yes',
    ...(name.startsWith('LUZIA_') ? [] : ['--sensitive']),
    ...(force ? ['--force'] : []),
  ];
  const line = ['vercel', ...args].join(' ');
  context.say(`Running ${line}…`);
  const result = await context.io.runner.run({ command: 'vercel', args, cwd: context.cwd, input: context.state.envValues[name] });
  if (result.exitCode === 0) context.changes.commands.push(line);
  return result;
}

function alreadyExists(result: CommandResult): boolean {
  return /already (exists|been added)|already (a|an) .*variable/i.test(`${result.stderr}\n${result.stdout}`);
}

function reportFailure(context: WizardContext, name: string, environment: Environment, result: CommandResult): void {
  context.warn(`vercel env add ${name} --environment ${environment} failed (exit code ${result.exitCode}).`);
  const details = result.stderr.trim().split('\n').slice(-5).join('\n');
  if (details) context.warn(details);
  context.changes.todo.push(`Add ${name} to Vercel (${environment}) with the value from ${ENV_FILE}: vercel env add ${name} --environment ${environment}`);
}

function printVariables(context: WizardContext): void {
  context.say('Set these variables in your hosting provider’s settings for production (values are not shown here):');
  for (const name of Object.keys(context.state.envValues)) context.say(`  ${name} (from ${ENV_FILE})`);
}
