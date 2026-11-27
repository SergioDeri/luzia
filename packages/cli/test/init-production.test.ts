import { describe, expect, it } from 'vitest';
import { fakeRunner, fullRunAnswers, OWNER_KEYS, ownerProject, productionAnswers, runInit } from './support/init-harness.ts';

const LUZIA_VARIABLES = [
  'LUZIA_CHAT_PROVIDER',
  'LUZIA_CHAT_MODEL',
  'LUZIA_EMBEDDING_PROVIDER',
  'LUZIA_EMBEDDING_MODEL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
];

const LINKED = { '.vercel/project.json': JSON.stringify({ projectId: 'prj_example', orgId: 'team_example' }) };

/** A Vercel CLI that is installed and accepts every request. */
function vercelCli(respond: Parameters<typeof fakeRunner>[0] = () => ({})) {
  return fakeRunner((request) =>
    request.command === 'vercel' && request.args[0] === '--version' ? { stdout: 'Vercel CLI 67.0.0' } : respond(request),
  );
}

/** The `vercel env add` arguments luzIA uses: non-interactive, API keys stored as sensitive. */
function addArgs(name: string, environment: string): string[] {
  const sensitive = name.startsWith('LUZIA_') ? [] : ['--sensitive'];
  return ['env', 'add', name, '--environment', environment, '--yes', ...sensitive];
}
const addLine = (name: string, environment: string) => ['vercel', ...addArgs(name, environment)].join(' ');

describe('luzia init: production variables', () => {
  it('uploads every variable to a linked Vercel project after one confirmation, with values only on stdin', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);
    const runner = vercelCli();

    const run = await runInit(cwd, { answers: fullRunAnswers({ production: productionAnswers({ linked: true }) }), runner });

    expect(run.code).toBe(0);
    expect(run.commands).toContain('vercel --version');
    const uploads = run.requests.filter((request) => request.command === 'vercel' && request.args[0] === 'env');
    expect(uploads.map((request) => request.args)).toEqual(
      LUZIA_VARIABLES.flatMap((name) => [
        addArgs(name, 'production'),
        addArgs(name, 'preview'),
      ]),
    );
    const byName = (name: string) => uploads.filter((request) => request.args[2] === name).map((request) => request.input);
    expect(byName('ANTHROPIC_API_KEY')).toEqual([OWNER_KEYS.anthropic, OWNER_KEYS.anthropic]);
    expect(byName('OPENAI_API_KEY')).toEqual([OWNER_KEYS.openai, OWNER_KEYS.openai]);
    expect(byName('LUZIA_CHAT_MODEL')).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
    for (const request of run.requests) {
      expect(request.args.join(' ')).not.toContain(OWNER_KEYS.anthropic);
      expect(request.args.join(' ')).not.toContain(OWNER_KEYS.openai);
    }

    // The one confirmation names every variable and the target environments.
    const confirmation = run.asked.find((question) => /Upload/.test(question.message))!;
    for (const name of LUZIA_VARIABLES) expect(run.stdout).toContain(name);
    expect(confirmation.message).toMatch(/production.*preview/);
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
    expect(run.output).not.toContain(OWNER_KEYS.openai);
  });

  it('uploads nothing when the Owner declines, and lists the variables instead', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ production: productionAnswers({ linked: true, upload: false }) }),
      runner: vercelCli(),
    });

    expect(run.code).toBe(0);
    expect(run.commands.filter((command) => command.startsWith('vercel env'))).toEqual([]);
    for (const name of LUZIA_VARIABLES) expect(run.stdout).toMatch(new RegExp(`${name}.*from \\.env\\.local`));
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
  });

  it('targets only production when the Owner chooses it', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ production: productionAnswers({ linked: true, environments: 'production' }) }),
      runner: vercelCli(),
    });

    const uploads = run.commands.filter((command) => command.startsWith('vercel env'));
    expect(uploads).toEqual(LUZIA_VARIABLES.map((name) => addLine(name, 'production')));
  });

  it('asks before replacing variables that already exist on Vercel, and replaces them with --force on yes', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);
    const runner = vercelCli((request) =>
      request.args[2] === 'OPENAI_API_KEY' && !request.args.includes('--force')
        ? { exitCode: 1, stderr: 'Error: A variable with the name `OPENAI_API_KEY` already exists for the target production.' }
        : {},
    );

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ production: productionAnswers({ linked: true, environments: 'production', replace: true }) }),
      runner,
    });

    expect(run.code).toBe(0);
    expect(run.commands).toContain(`${addLine('OPENAI_API_KEY', 'production')} --force`);
    const forced = run.requests.find((request) => request.args.includes('--force'))!;
    expect(forced.input).toBe(OWNER_KEYS.openai);
    expect(run.stdout).not.toMatch(/Still to do/);
  });

  it('keeps variables that already exist on Vercel when the Owner says no', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);
    const runner = vercelCli((request) =>
      request.args[2] === 'OPENAI_API_KEY' ? { exitCode: 1, stderr: 'Error: OPENAI_API_KEY already exists' } : {},
    );

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ production: productionAnswers({ linked: true, environments: 'production', replace: false }) }),
      runner,
    });

    expect(run.code).toBe(0);
    expect(run.commands.filter((command) => command.includes('--force'))).toEqual([]);
    expect(run.stdout).toMatch(/Kept the existing values on Vercel/);
    expect(run.stdout).toMatch(/OPENAI_API_KEY \(production\)/);
  });

  it('records a failed upload in the summary’s to-do list, without printing the value', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);
    const runner = vercelCli((request) =>
      request.args[2] === 'ANTHROPIC_API_KEY' ? { exitCode: 1, stderr: 'Error: Not authorized' } : {},
    );

    const run = await runInit(cwd, {
      answers: fullRunAnswers({ production: productionAnswers({ linked: true, environments: 'production' }) }),
      runner,
    });

    expect(run.stderr).toMatch(/vercel env add ANTHROPIC_API_KEY --environment production .*failed/);
    expect(run.stdout).toMatch(/Still to do:[\s\S]*Add ANTHROPIC_API_KEY to Vercel \(production\)/);
    expect(run.commands).toContain(addLine('OPENAI_API_KEY', 'production'));
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
  });

  it('lists the variables when the project is linked but the Vercel CLI is not installed', async () => {
    const cwd = await ownerProject('nextjs-app', LINKED);
    const runner = fakeRunner((request) => (request.command === 'vercel' ? { exitCode: 127, stderr: 'spawn vercel ENOENT' } : {}));

    const run = await runInit(cwd, { answers: fullRunAnswers(), runner });

    expect(run.code).toBe(0);
    expect(run.commands.filter((command) => command.startsWith('vercel'))).toEqual(['vercel --version']);
    expect(run.stdout).toMatch(/Vercel CLI was not found/);
    for (const name of LUZIA_VARIABLES) expect(run.stdout).toMatch(new RegExp(`${name}.*from \\.env\\.local`));
  });

  it('without a linked Vercel project, lists each variable and where its value comes from, without secrets', async () => {
    const cwd = await ownerProject('nextjs-app');

    const run = await runInit(cwd, { answers: fullRunAnswers() });

    expect(run.code).toBe(0);
    for (const name of LUZIA_VARIABLES) expect(run.stdout).toMatch(new RegExp(`${name}.*from \\.env\\.local`));
    expect(run.output).not.toContain(OWNER_KEYS.anthropic);
    expect(run.output).not.toContain(OWNER_KEYS.openai);
    expect(run.commands.filter((command) => command.startsWith('vercel'))).toEqual([]);
  });
});
